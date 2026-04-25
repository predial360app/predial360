/**
 * useBodycam — hook para gravação bodycam com S3 multipart upload.
 * ─────────────────────────────────────────────────────────────────────────────
 * Fluxo:
 *  1. startRecording() → cria registro + obtém uploadId
 *  2. A cada ~30s: sendChunk(base64) → UploadPart no S3
 *  3. stopRecording() → finish → CompleteMultipartUpload
 *
 * Offline:
 *  - Chunks falhos são adicionados à SyncQueue do WatermelonDB
 *  - Retentativa automática via useNetworkSync
 *
 * Permissões: requer Camera + Microphone (expo-camera)
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { Camera, CameraRecordingOptions, VideoQuality } from 'expo-camera';

import { apiClient as api } from '../lib/api-client';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type BodycamStatus =
  | 'idle'
  | 'requesting_permission'
  | 'recording'
  | 'uploading_chunk'
  | 'finishing'
  | 'completed'
  | 'error';

export interface BodycamState {
  status: BodycamStatus;
  recordingId: string | null;
  chunksUploaded: number;
  elapsedSeconds: number;
  errorMessage: string | null;
}

interface StartResult {
  recordingId: string;
  uploadId: string;
  message: string;
}

interface ChunkResult {
  partNumber: number;
  etag: string;
  chunksUploaded: number;
}

// ─── Constantes ───────────────────────────────────────────────────────────────

/** Duração de cada segmento de vídeo gravado (ms) — sincronizar com chunk S3 */
const CHUNK_DURATION_MS = 30_000; // 30 segundos

/** Qualidade do vídeo — 720p equilibra tamanho e clareza */
const VIDEO_QUALITY = VideoQuality['720p'];

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useBodycam(serviceOrderId: string) {
  const cameraRef = useRef<Camera>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef = useRef(0);
  const partNumberRef = useRef(1);
  const recordingIdRef = useRef<string | null>(null);
  const isRecordingRef = useRef(false);
  // BUG #4: rastreia o promise do último uploadChunk em andamento
  // para garantir que stopRecording aguarde antes de chamar /finish
  const pendingChunkRef = useRef<Promise<void> | null>(null);
  // BUG #5: contador de retries consecutivos para evitar loop infinito
  const segmentRetryRef = useRef(0);

  const [state, setState] = useState<BodycamState>({
    status: 'idle',
    recordingId: null,
    chunksUploaded: 0,
    elapsedSeconds: 0,
    errorMessage: null,
  });

  const setStatus = useCallback((status: BodycamStatus, extra?: Partial<BodycamState>) => {
    setState((prev) => ({ ...prev, status, errorMessage: null, ...extra }));
  }, []);

  // ── Permissões ─────────────────────────────────────────────────────────────

  const [hasPermission, setHasPermission] = useState<boolean | null>(null);

  useEffect(() => {
    void (async () => {
      setStatus('requesting_permission');
      const { status } = await Camera.requestCameraPermissionsAsync();
      const { status: micStatus } = await Camera.requestMicrophonePermissionsAsync();
      const granted = status === 'granted' && micStatus === 'granted';
      setHasPermission(granted);
      if (granted) setStatus('idle');
    })();
  }, [setStatus]);

  // ── Timer de elapsed time ──────────────────────────────────────────────────

  const startTimer = useCallback(() => {
    elapsedRef.current = 0;
    timerRef.current = setInterval(() => {
      elapsedRef.current += 1;
      setState((prev) => ({ ...prev, elapsedSeconds: elapsedRef.current }));
    }, 1000);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // ── Upload de chunk (base64 do arquivo gravado) ────────────────────────────

  const uploadChunk = useCallback(
    async (fileUri: string, partNumber: number): Promise<void> => {
      if (!recordingIdRef.current) return;

      // Não altera status visual para 'uploading_chunk' neste ponto —
      // o upload ocorre em background enquanto o próximo segmento já grava
      try {
        // Ler arquivo e converter para base64
        const base64 = await FileSystem.readAsStringAsync(fileUri, {
          encoding: FileSystem.EncodingType.Base64,
        });

        const response = await api.post<ChunkResult>(
          `/service-orders/${serviceOrderId}/bodycam/chunk`,
          {
            recordingId: recordingIdRef.current,
            partNumber,
            videoBase64: base64,
          },
        );

        setState((prev) => ({
          ...prev,
          chunksUploaded: response.data.chunksUploaded,
        }));

        // Remover arquivo temporário após upload com sucesso
        await FileSystem.deleteAsync(fileUri, { idempotent: true });
      } catch (err) {
        // Chunk perdido — continua gravando (próximo segmento não é afetado)
        // TODO: adicionar à SyncQueue do WatermelonDB para retry offline
        console.warn(`[Bodycam] Falha no chunk ${partNumber}:`, err);
        setState((prev) => ({
          ...prev,
          errorMessage: `Chunk ${partNumber} falhou — continuando gravação`,
        }));
      }
    },
    [serviceOrderId],
  );

  // ── Segmento: grava 30s e envia ────────────────────────────────────────────

  const recordAndUploadSegment = useCallback(async () => {
    if (!cameraRef.current || !isRecordingRef.current) return;

    const options: CameraRecordingOptions = {
      quality: VIDEO_QUALITY,
      mute: false,
      maxDuration: CHUNK_DURATION_MS / 1000, // em segundos
    };

    try {
      const { uri } = await cameraRef.current.recordAsync(options);

      // Reset do contador de retries ao gravar com sucesso
      segmentRetryRef.current = 0;

      const currentPart = partNumberRef.current;
      partNumberRef.current += 1;

      // BUG #4: registra o promise do upload para que stopRecording possa aguardá-lo
      const chunkPromise = uploadChunk(uri, currentPart);
      pendingChunkRef.current = chunkPromise;
      void chunkPromise;

      // Inicia próximo segmento se ainda gravando
      if (isRecordingRef.current) {
        void recordAndUploadSegment();
      }
    } catch (err) {
      if (!isRecordingRef.current) return;

      // BUG #5: máximo 3 retries com backoff exponencial para evitar loop infinito
      const MAX_RETRIES = 3;
      segmentRetryRef.current += 1;

      if (segmentRetryRef.current > MAX_RETRIES) {
        console.error('[Bodycam] Máximo de retries atingido — encerrando gravação', err);
        setState((prev) => ({
          ...prev,
          status: 'error',
          errorMessage: 'Falha repetida na câmera. Reinicie a gravação.',
        }));
        isRecordingRef.current = false;
        return;
      }

      const backoffMs = 1000 * segmentRetryRef.current; // 1s, 2s, 3s
      console.warn(`[Bodycam] Erro no segmento (retry ${segmentRetryRef.current}/${MAX_RETRIES} em ${backoffMs}ms):`, err);
      await new Promise((r) => setTimeout(r, backoffMs));
      void recordAndUploadSegment();
    }
  }, [uploadChunk]);

  // ── start ──────────────────────────────────────────────────────────────────

  const startRecording = useCallback(async () => {
    if (!hasPermission) {
      Alert.alert('Permissão necessária', 'Câmera e microfone são necessários para a bodycam.');
      return;
    }
    if (state.status === 'recording') return;

    try {
      setStatus('uploading_chunk'); // mostra loading enquanto inicia

      // ISSUE #11: ambas plataformas usam mp4 — ternário removido
      const response = await api.post<StartResult>(
        `/service-orders/${serviceOrderId}/bodycam/start`,
        {
          mimeType: 'video/mp4',
          codec: 'H.264',
          resolution: '1280x720',
        },
      );

      recordingIdRef.current = response.data.recordingId;
      partNumberRef.current = 1;
      isRecordingRef.current = true;

      setState((prev) => ({
        ...prev,
        status: 'recording',
        recordingId: response.data.recordingId,
        chunksUploaded: 0,
        elapsedSeconds: 0,
        errorMessage: null,
      }));

      startTimer();
      void recordAndUploadSegment();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao iniciar gravação';
      setState((prev) => ({ ...prev, status: 'error', errorMessage: message }));
    }
  }, [hasPermission, state.status, serviceOrderId, setStatus, startTimer, recordAndUploadSegment]);

  // ── stop ───────────────────────────────────────────────────────────────────

  const stopRecording = useCallback(async () => {
    if (!isRecordingRef.current || !recordingIdRef.current) return;

    // Captura o ID antes de qualquer operação async (evita leitura de ref zerada)
    const recordingId = recordingIdRef.current;

    isRecordingRef.current = false;
    stopTimer();
    setStatus('finishing');

    // Para câmera (dispara o término do recordAsync do último segmento)
    cameraRef.current?.stopRecording();

    // BUG #4 FIX: aguarda o promise do último chunk em andamento
    // em vez de um timeout arbitrário de 2s
    if (pendingChunkRef.current) {
      try {
        await pendingChunkRef.current;
      } catch {
        // Ignora falha do chunk — o /finish ainda deve ser chamado
      }
      pendingChunkRef.current = null;
    }

    try {
      await api.post(`/service-orders/${serviceOrderId}/bodycam/finish`, {
        recordingId,
        durationSeconds: elapsedRef.current,
      });

      setState((prev) => ({
        ...prev,
        status: 'completed',
        recordingId,
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao finalizar gravação';
      setState((prev) => ({ ...prev, status: 'error', errorMessage: message }));
    }
  }, [serviceOrderId, setStatus, stopTimer]);

  // ── cleanup ────────────────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      stopTimer();
      isRecordingRef.current = false;
    };
  }, [stopTimer]);

  return {
    cameraRef,
    hasPermission,
    state,
    startRecording,
    stopRecording,
  };
}
