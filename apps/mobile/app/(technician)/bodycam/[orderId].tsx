/**
 * Bodycam Screen — gravação de vídeo corporal vinculada à OS.
 * ─────────────────────────────────────────────────────────────────────────────
 * - S3 Multipart Upload em segmentos de 30s
 * - Indicador vermelho piscante durante gravação
 * - Cronômetro e contador de chunks enviados
 * - Tratamento offline: aviso se sem conexão ao tentar iniciar
 */
import { useCallback, useEffect, useRef } from 'react';
import {
  Alert,
  Animated,
  Easing,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Camera, CameraType } from 'expo-camera';
import NetInfo from '@react-native-community/netinfo';
import { Ionicons } from '@expo/vector-icons';

import { useBodycam } from '../../../src/hooks/useBodycam';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function BodycamScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const router = useRouter();
  const { cameraRef, hasPermission, state, startRecording, stopRecording } = useBodycam(orderId);

  // Animação do indicador vermelho piscante
  const blinkAnim = useRef(new Animated.Value(1)).current;
  const blinkLoop = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (state.status === 'recording') {
      blinkLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(blinkAnim, {
            toValue: 0,
            duration: 500,
            easing: Easing.linear,
            useNativeDriver: true,
          }),
          Animated.timing(blinkAnim, {
            toValue: 1,
            duration: 500,
            easing: Easing.linear,
            useNativeDriver: true,
          }),
        ]),
      );
      blinkLoop.current.start();
    } else {
      blinkLoop.current?.stop();
      blinkAnim.setValue(1);
    }
  }, [state.status, blinkAnim]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleStart = useCallback(async () => {
    const net = await NetInfo.fetch();
    if (!net.isConnected) {
      Alert.alert(
        'Sem conexão',
        'A bodycam requer conexão com a internet para enviar os vídeos ao servidor.',
      );
      return;
    }
    await startRecording();
  }, [startRecording]);

  const handleStop = useCallback(() => {
    Alert.alert(
      'Encerrar gravação?',
      'O vídeo será finalizado e salvo na OS como evidência técnica.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Encerrar',
          style: 'destructive',
          onPress: () => void stopRecording(),
        },
      ],
    );
  }, [stopRecording]);

  const handleCompleted = useCallback(() => {
    Alert.alert(
      'Gravação salva',
      `Vídeo registrado com sucesso.\n${state.chunksUploaded} segmentos enviados.`,
      [
        {
          text: 'OK',
          onPress: () => router.back(),
        },
      ],
    );
  }, [state.chunksUploaded, router]);

  useEffect(() => {
    if (state.status === 'completed') {
      handleCompleted();
    }
  }, [state.status, handleCompleted]);

  // ── Permissão negada ────────────────────────────────────────────────────────

  if (hasPermission === false) {
    return (
      <>
        <Stack.Screen options={{ title: 'Bodycam' }} />
        <View style={styles.center}>
          <Ionicons name="videocam-off" size={64} color="#666" />
          <Text style={styles.permissionTitle}>Permissão de câmera negada</Text>
          <Text style={styles.permissionText}>
            Acesse Configurações {'>'} Predial360 {'>'} Câmera para permitir acesso.
          </Text>
        </View>
      </>
    );
  }

  // ── Gravação concluída ──────────────────────────────────────────────────────

  if (state.status === 'completed') {
    return (
      <>
        <Stack.Screen options={{ title: 'Bodycam — Concluído' }} />
        <View style={styles.center}>
          <Ionicons name="checkmark-circle" size={80} color="#22c55e" />
          <Text style={styles.completedTitle}>Vídeo registrado!</Text>
          <Text style={styles.completedSubtitle}>
            {state.chunksUploaded} segmentos enviados ao servidor
          </Text>
          <TouchableOpacity style={styles.doneButton} onPress={() => router.back()}>
            <Text style={styles.doneButtonText}>Voltar à OS</Text>
          </TouchableOpacity>
        </View>
      </>
    );
  }

  // ── Camera view ─────────────────────────────────────────────────────────────

  const isRecording = state.status === 'recording';
  const isLoading =
    state.status === 'uploading_chunk' ||
    state.status === 'finishing' ||
    state.status === 'requesting_permission';

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Bodycam',
          headerStyle: { backgroundColor: '#000' },
          headerTintColor: '#fff',
        }}
      />
      <View style={styles.container}>
        {/* Camera Preview */}
        <Camera
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          type={CameraType.back}
          ratio="16:9"
        />

        {/* Overlay: HUD superior */}
        <View style={styles.hud}>
          {/* Indicador REC piscante */}
          {isRecording && (
            <View style={styles.recContainer}>
              <Animated.View style={[styles.recDot, { opacity: blinkAnim }]} />
              <Text style={styles.recText}>REC</Text>
            </View>
          )}

          {/* Cronômetro */}
          {(isRecording || state.status === 'finishing') && (
            <Text style={styles.timer}>{formatDuration(state.elapsedSeconds)}</Text>
          )}

          {/* Contador de chunks */}
          {isRecording && state.chunksUploaded > 0 && (
            <View style={styles.chunkBadge}>
              <Ionicons name="cloud-upload" size={12} color="#fff" />
              <Text style={styles.chunkText}>{state.chunksUploaded} seg</Text>
            </View>
          )}
        </View>

        {/* Aviso de erro */}
        {state.errorMessage && (
          <View style={styles.errorBanner}>
            <Ionicons name="warning" size={16} color="#fbbf24" />
            <Text style={styles.errorText}>{state.errorMessage}</Text>
          </View>
        )}

        {/* Aviso jurídico — só aparece em idle */}
        {state.status === 'idle' && (
          <View style={styles.legalBanner}>
            <Ionicons name="information-circle" size={16} color="#60a5fa" />
            <Text style={styles.legalText}>
              A gravação será armazenada como evidência técnica e jurídica vinculada à OS.
            </Text>
          </View>
        )}

        {/* Controles inferiores */}
        <View style={styles.controls}>
          {/* Botão cancelar (só em idle) */}
          {state.status === 'idle' && (
            <TouchableOpacity style={styles.cancelButton} onPress={() => router.back()}>
              <Ionicons name="close" size={28} color="#fff" />
            </TouchableOpacity>
          )}

          {/* Botão principal: iniciar / parar */}
          <TouchableOpacity
            style={[
              styles.mainButton,
              isRecording && styles.mainButtonRecording,
              isLoading && styles.mainButtonLoading,
            ]}
            onPress={isRecording ? handleStop : handleStart}
            disabled={isLoading}
            activeOpacity={0.8}
          >
            {isLoading ? (
              <Text style={styles.mainButtonLabel}>
                {state.status === 'finishing' ? 'Finalizando...' : 'Aguarde...'}
              </Text>
            ) : isRecording ? (
              <View style={styles.stopIcon} />
            ) : (
              <View style={styles.startIcon} />
            )}
          </TouchableOpacity>

          {/* Espaçador */}
          {state.status === 'idle' && <View style={styles.cancelButton} />}
        </View>
      </View>
    </>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0f172a',
    gap: 16,
    paddingHorizontal: 32,
  },
  permissionTitle: {
    color: '#f1f5f9',
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  permissionText: {
    color: '#94a3b8',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
  },
  completedTitle: {
    color: '#f1f5f9',
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
  },
  completedSubtitle: {
    color: '#94a3b8',
    fontSize: 15,
    textAlign: 'center',
  },
  doneButton: {
    marginTop: 16,
    backgroundColor: '#3b82f6',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
  },
  doneButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  // ── HUD ──
  hud: {
    position: 'absolute',
    top: 16,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  recContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  recDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#ef4444',
  },
  recText: {
    color: '#ef4444',
    fontWeight: '800',
    fontSize: 13,
    letterSpacing: 1,
  },
  timer: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '300',
    fontVariant: ['tabular-nums'],
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  chunkBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(59,130,246,0.7)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
    marginLeft: 'auto',
  },
  chunkText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  // ── Banners ──
  errorBanner: {
    position: 'absolute',
    top: 70,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(239,68,68,0.85)',
    padding: 10,
    borderRadius: 8,
  },
  errorText: {
    color: '#fff',
    fontSize: 12,
    flex: 1,
  },
  legalBanner: {
    position: 'absolute',
    bottom: 140,
    left: 24,
    right: 24,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.65)',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(96,165,250,0.4)',
  },
  legalText: {
    color: '#cbd5e1',
    fontSize: 12,
    lineHeight: 18,
    flex: 1,
  },
  // ── Controls ──
  controls: {
    position: 'absolute',
    bottom: 48,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    paddingHorizontal: 24,
  },
  cancelButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mainButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.8)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  mainButtonRecording: {
    backgroundColor: '#1f2937',
  },
  mainButtonLoading: {
    backgroundColor: '#374151',
    opacity: 0.7,
  },
  mainButtonLabel: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
  startIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#fff',
  },
  stopIcon: {
    width: 28,
    height: 28,
    borderRadius: 4,
    backgroundColor: '#ef4444',
  },
});
