/**
 * Tela de Assinatura Digital — MÓDULO 6
 * ───────────────────────────────────────────────────────────────────────────
 * Fluxo:
 *  1. Técnico desenha assinatura no canvas (react-native-signature-canvas)
 *  2. App captura PNG em base64
 *  3. POST /storage/upload → URL S3
 *  4. PATCH /service-orders/:id/signature → persiste URL
 *  5. Exibição no laudo PDF gerado
 *
 * Após assinar com sucesso, navega para o laudo da OS.
 */
import React, { useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  StyleSheet,
  Platform,
  Dimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import SignatureCanvas from 'react-native-signature-canvas';
import { useMutation } from '@tanstack/react-query';

import { apiClient } from '../../../src/lib/api-client';

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface UploadResponse {
  url: string;
}

interface SignatureResponse {
  serviceOrderId: string;
  signatureUrl: string;
  signedAt: string;
}

// ─── Hooks de mutation ───────────────────────────────────────────────────────

function useUploadSignature() {
  return useMutation({
    mutationFn: async (base64: string): Promise<string> => {
      // Remove prefixo data:image/png;base64, se vier do canvas
      const clean = base64.startsWith('data:')
        ? base64.split(',')[1] ?? base64
        : base64;

      const { data } = await apiClient.post<UploadResponse>('/storage/upload', {
        base64: clean,
        mimeType: 'image/png',
        folder: 'signatures',
      });
      return data.url;
    },
  });
}

function useSaveSignature(orderId: string) {
  return useMutation({
    mutationFn: async (signatureUrl: string): Promise<SignatureResponse> => {
      const { data } = await apiClient.patch<SignatureResponse>(
        `/service-orders/${orderId}/signature`,
        { signatureUrl },
      );
      return data;
    },
  });
}

// ─── Componente principal ─────────────────────────────────────────────────────

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function SignatureScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const router = useRouter();
  const signatureRef = useRef<SignatureCanvas>(null);

  const [isEmpty, setIsEmpty] = useState(true);
  const [step, setStep] = useState<'draw' | 'confirm' | 'done'>('draw');

  const upload = useUploadSignature();
  const save = useSaveSignature(orderId);

  const isLoading = upload.isPending || save.isPending;

  // ── Callbacks do canvas ──────────────────────────────────────────────────

  const handleBegin = useCallback(() => {
    setIsEmpty(false);
  }, []);

  const handleOK = useCallback(
    async (signature: string) => {
      try {
        // 1. Upload para S3
        const s3Url = await upload.mutateAsync(signature);

        // 2. Salvar URL na OS
        await save.mutateAsync(s3Url);

        setStep('done');

        Alert.alert(
          'Assinatura salva! ✅',
          'A assinatura digital foi registrada com sucesso e aparecerá no laudo técnico.',
          [
            {
              text: 'Ver Laudo',
              onPress: () => {
                router.replace(`/(technician)/report/${orderId}`);
              },
            },
            {
              text: 'Voltar ao início',
              style: 'cancel',
              onPress: () => router.replace('/(technician)/'),
            },
          ],
        );
      } catch {
        Alert.alert(
          'Erro ao salvar assinatura',
          'Não foi possível enviar a assinatura. Verifique sua conexão e tente novamente.',
          [{ text: 'OK' }],
        );
      }
    },
    [upload, save, orderId, router],
  );

  const handleEmpty = useCallback(() => {
    Alert.alert('Canvas vazio', 'Por favor, assine antes de confirmar.');
  }, []);

  const handleClear = useCallback(() => {
    signatureRef.current?.clearSignature();
    setIsEmpty(true);
  }, []);

  const handleConfirm = useCallback(() => {
    if (isEmpty) {
      handleEmpty();
      return;
    }
    signatureRef.current?.readSignature();
  }, [isEmpty, handleEmpty]);

  // ── Estilos do canvas (injetados como HTML) ──────────────────────────────

  const webStyle = `
    .m-signature-pad {
      box-shadow: none;
      border: none;
    }
    .m-signature-pad--body {
      border: none;
    }
    .m-signature-pad--footer {
      display: none;
      margin: 0px;
    }
    body, html {
      width: 100%;
      height: 100%;
      background-color: #F8FAFC;
    }
  `;

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Assinatura Digital</Text>
        <Text style={styles.headerSubtitle}>
          Assine dentro do campo abaixo para confirmar o encerramento da OS
        </Text>
      </View>

      {/* Canvas de assinatura */}
      <View style={styles.canvasWrapper}>
        <View style={styles.canvasBorder}>
          <SignatureCanvas
            ref={signatureRef}
            onOK={handleOK}
            onBegin={handleBegin}
            onEmpty={handleEmpty}
            webStyle={webStyle}
            backgroundColor="rgba(248, 250, 252, 1)"
            penColor="#1E3A5F"
            minWidth={2}
            maxWidth={4}
            style={styles.canvas}
            descriptionText=""
            clearText=""
            confirmText=""
            trimWhitespace
            androidHardwareAccelerationDisabled={Platform.OS === 'android'}
          />
        </View>

        {isEmpty && (
          <View style={styles.placeholderOverlay} pointerEvents="none">
            <Text style={styles.placeholderText}>✍️  Assine aqui</Text>
          </View>
        )}
      </View>

      {/* Informativo LGPD / validade */}
      <View style={styles.infoBox}>
        <Text style={styles.infoText}>
          🔒 Esta assinatura tem validade jurídica conforme MP 2.200-2/2001 e será
          armazenada com segurança por 5 anos (NBR 16747).
        </Text>
      </View>

      {/* Botões */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.btn, styles.btnSecondary]}
          onPress={handleClear}
          disabled={isLoading || isEmpty}
        >
          <Text style={[styles.btnText, styles.btnTextSecondary]}>Limpar</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.btn,
            styles.btnPrimary,
            (isLoading || isEmpty) && styles.btnDisabled,
          ]}
          onPress={handleConfirm}
          disabled={isLoading || isEmpty}
        >
          {isLoading ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Text style={[styles.btnText, styles.btnTextPrimary]}>
              Confirmar Assinatura
            </Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Status de loading */}
      {isLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#1E3A5F" />
          <Text style={styles.loadingText}>
            {upload.isPending ? 'Enviando assinatura...' : 'Salvando na OS...'}
          </Text>
        </View>
      )}
    </View>
  );
}

// ─── Estilos ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },

  // Header
  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1E3A5F',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#64748B',
    lineHeight: 20,
  },

  // Canvas
  canvasWrapper: {
    flex: 1,
    marginHorizontal: 16,
    marginTop: 16,
    position: 'relative',
  },
  canvasBorder: {
    flex: 1,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#F8FAFC',
  },
  canvas: {
    flex: 1,
    width: SCREEN_WIDTH - 32,
  },
  placeholderOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 18,
    color: '#94A3B8',
    fontStyle: 'italic',
  },

  // Info box
  infoBox: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 12,
    backgroundColor: '#EFF6FF',
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#3B82F6',
  },
  infoText: {
    fontSize: 12,
    color: '#1D4ED8',
    lineHeight: 18,
  },

  // Botões
  actions: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  btn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimary: {
    backgroundColor: '#1E3A5F',
  },
  btnSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
  },
  btnDisabled: {
    opacity: 0.5,
  },
  btnText: {
    fontSize: 15,
    fontWeight: '600',
  },
  btnTextPrimary: {
    color: '#FFFFFF',
  },
  btnTextSecondary: {
    color: '#64748B',
  },

  // Overlay de loading
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 16,
    color: '#1E3A5F',
    fontWeight: '500',
  },
});
