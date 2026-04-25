/**
 * Scanner de QR Code — proprietário e técnico
 * Lê o payload JSON do QR e redireciona para:
 *   - Histórico do ativo (se asset existir)
 *   - Tela de nova OS vinculada ao ativo
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Camera, CameraView, type BarcodeScanningResult } from 'expo-camera';
import { router } from 'expo-router';

import { propertiesService } from '../../src/services/properties.service';

type ScanState = 'scanning' | 'processing' | 'done' | 'error';

interface QrPayload {
  type: string;
  id: string;
  qr: string;
}

export default function QrScannerScreen(): React.ReactElement {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [scanState, setScanState] = useState<ScanState>('scanning');
  const [statusMessage, setStatusMessage] = useState('');
  const lastScan = useRef<string>('');

  useEffect(() => {
    void Camera.requestCameraPermissionsAsync().then(({ status }) => {
      setHasPermission(status === 'granted');
    });
  }, []);

  async function handleBarCodeScanned({ data }: BarcodeScanningResult): Promise<void> {
    // Debounce — evita escanear o mesmo QR múltiplas vezes
    if (scanState !== 'scanning' || data === lastScan.current) return;
    lastScan.current = data;
    setScanState('processing');
    setStatusMessage('Identificando ativo...');

    try {
      // Tenta fazer parse do payload JSON
      let payload: QrPayload;
      try {
        payload = JSON.parse(data) as QrPayload;
      } catch {
        throw new Error('QR Code inválido — não é um ativo Predial360.');
      }

      if (payload.type !== 'asset' || !payload.qr) {
        throw new Error('QR Code não reconhecido.');
      }

      const asset = await propertiesService.scanQrCode(payload.qr);

      setScanState('done');
      setStatusMessage(`✅ ${asset.name} identificado!`);

      setTimeout(() => {
        Alert.alert(
          `🔩 ${asset.name as string}`,
          `Categoria: ${asset.category as string}\nImóvel: ${(asset as { property?: { name: string } }).property?.name ?? ''}`,
          [
            {
              text: 'Ver histórico',
              onPress: () => router.push(`/(owner)/property/asset/${asset.id as string}`),
            },
            {
              text: 'Abrir OS',
              onPress: () =>
                router.push(
                  `/(owner)/service-orders/new?assetId=${asset.id as string}&propertyId=${asset.propertyId as string}`,
                ),
            },
            {
              text: 'Escanear outro',
              onPress: () => {
                lastScan.current = '';
                setScanState('scanning');
              },
            },
          ],
        );
      }, 600);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido.';
      setScanState('error');
      setStatusMessage(`❌ ${message}`);

      setTimeout(() => {
        lastScan.current = '';
        setScanState('scanning');
        setStatusMessage('');
      }, 2000);
    }
  }

  if (hasPermission === null) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1E3A5F" />
        <Text style={styles.permText}>Solicitando permissão da câmera...</Text>
      </View>
    );
  }

  if (!hasPermission) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>
          Permissão da câmera negada.{'\n'}
          Habilite nas configurações do dispositivo.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={scanState === 'scanning' ? handleBarCodeScanned : undefined}
      />

      {/* Overlay escuro com janela de scan */}
      <View style={styles.overlay}>
        <View style={styles.topOverlay} />
        <View style={styles.middleRow}>
          <View style={styles.sideOverlay} />
          <View style={styles.scanWindow}>
            {/* Cantos decorativos */}
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
          </View>
          <View style={styles.sideOverlay} />
        </View>
        <View style={styles.bottomOverlay}>
          <Text style={styles.instruction}>
            Aponte a câmera para o QR Code do equipamento
          </Text>

          {scanState === 'processing' && (
            <View style={styles.statusBox}>
              <ActivityIndicator color="#fff" size="small" />
              <Text style={styles.statusText}>{statusMessage}</Text>
            </View>
          )}

          {(scanState === 'done' || scanState === 'error') && (
            <View style={styles.statusBox}>
              <Text style={styles.statusText}>{statusMessage}</Text>
            </View>
          )}

          <TouchableOpacity style={styles.cancelButton} onPress={() => router.back()}>
            <Text style={styles.cancelText}>Cancelar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const OVERLAY = 'rgba(0,0,0,0.65)';
const WINDOW_SIZE = 260;
const CORNER_SIZE = 28;
const CORNER_WIDTH = 4;
const CORNER_COLOR = '#22c55e';

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32 },
  permText: { color: '#6b7280', textAlign: 'center' },
  errorText: { color: '#ef4444', textAlign: 'center', lineHeight: 22 },
  overlay: { flex: 1 },
  topOverlay: { flex: 1, backgroundColor: OVERLAY },
  middleRow: { flexDirection: 'row', height: WINDOW_SIZE },
  sideOverlay: { flex: 1, backgroundColor: OVERLAY },
  scanWindow: {
    width: WINDOW_SIZE,
    height: WINDOW_SIZE,
    backgroundColor: 'transparent',
  },
  bottomOverlay: {
    flex: 1,
    backgroundColor: OVERLAY,
    alignItems: 'center',
    paddingTop: 24,
    gap: 16,
    paddingHorizontal: 32,
  },
  instruction: { color: '#fff', fontSize: 15, textAlign: 'center', lineHeight: 22 },
  statusBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  statusText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  cancelButton: {
    marginTop: 8,
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  cancelText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  corner: {
    position: 'absolute',
    width: CORNER_SIZE,
    height: CORNER_SIZE,
    borderColor: CORNER_COLOR,
  },
  cornerTL: { top: 0, left: 0, borderTopWidth: CORNER_WIDTH, borderLeftWidth: CORNER_WIDTH },
  cornerTR: { top: 0, right: 0, borderTopWidth: CORNER_WIDTH, borderRightWidth: CORNER_WIDTH },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: CORNER_WIDTH, borderLeftWidth: CORNER_WIDTH },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: CORNER_WIDTH, borderRightWidth: CORNER_WIDTH },
});
