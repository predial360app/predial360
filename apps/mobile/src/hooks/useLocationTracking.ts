/**
 * useLocationTracking — emissão da localização do técnico via WebSocket.
 * ─────────────────────────────────────────────────────────────────────────────
 * Usado pela tela do TÉCNICO quando está em rota (status ASSIGNED/IN_PROGRESS).
 *
 * Fluxo:
 *  1. Solicita permissão de localização em foreground
 *  2. Conecta ao WebSocket /location com JWT do usuário
 *  3. A cada ~15s envia `location:update` com lat/lng + status calculado
 *  4. Para quando o componente é desmontado (cleanup automático)
 *
 * Status calculado:
 *  - < 200m  → ON_SITE
 *  - < 500m  → EN_ROUTE (alerta de proximidade disparado pelo backend)
 *  - demais  → EN_ROUTE
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import { io, Socket } from 'socket.io-client';

import { getAccessToken } from '../lib/api-client';

const API_URL = process.env['EXPO_PUBLIC_API_URL'] ?? 'http://localhost:3000/api/v1';
// Strip /api/v1 suffix to get the base WebSocket URL
const WS_BASE_URL = API_URL.replace(/\/api\/v\d+$/, '');

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface TrackingLocation {
  latitude: number;
  longitude: number;
  accuracy?: number;
  heading?: number;
  speed?: number;
}

export type TechnicianStatus = 'EN_ROUTE' | 'ON_SITE' | 'IDLE' | 'OFFLINE';

export interface LocationTrackingState {
  isTracking: boolean;
  hasPermission: boolean | null;
  lastLocation: TrackingLocation | null;
  status: TechnicianStatus;
  error: string | null;
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const UPDATE_INTERVAL_MS = 15_000; // 15 segundos
const ON_SITE_RADIUS_M = 200;      // metros para considerar ON_SITE

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useLocationTracking(
  serviceOrderId: string,
  destinationLat?: number,
  destinationLng?: number,
) {
  const socketRef = useRef<Socket | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [trackingState, setTrackingState] = useState<LocationTrackingState>({
    isTracking: false,
    hasPermission: null,
    lastLocation: null,
    status: 'IDLE',
    error: null,
  });

  // ── Calcular status baseado na distância ─────────────────────────────────

  const computeStatus = useCallback(
    (lat: number, lng: number): TechnicianStatus => {
      if (!destinationLat || !destinationLng) return 'EN_ROUTE';

      // Haversine simplificado (suficiente para distâncias < 1km)
      const R = 6371000; // raio da Terra em metros
      const dLat = ((destinationLat - lat) * Math.PI) / 180;
      const dLng = ((destinationLng - lng) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((lat * Math.PI) / 180) *
          Math.cos((destinationLat * Math.PI) / 180) *
          Math.sin(dLng / 2) ** 2;
      const distanceMeters = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

      return distanceMeters <= ON_SITE_RADIUS_M ? 'ON_SITE' : 'EN_ROUTE';
    },
    [destinationLat, destinationLng],
  );

  // ── Enviar localização ────────────────────────────────────────────────────

  const sendLocation = useCallback(
    async (socket: Socket) => {
      try {
        const location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        const { latitude, longitude, accuracy, heading, speed } = location.coords;
        const status = computeStatus(latitude, longitude);

        socket.emit('location:update', {
          serviceOrderId,
          latitude,
          longitude,
          accuracy: accuracy ?? undefined,
          heading: heading ?? undefined,
          speed: speed ?? undefined,
          status,
        });

        setTrackingState((prev) => ({
          ...prev,
          lastLocation: { latitude, longitude, accuracy: accuracy ?? undefined, heading: heading ?? undefined, speed: speed ?? undefined },
          status,
          error: null,
        }));
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Erro ao obter localização';
        setTrackingState((prev) => ({ ...prev, error: msg }));
      }
    },
    [serviceOrderId, computeStatus],
  );

  // ── Iniciar tracking ──────────────────────────────────────────────────────

  const startTracking = useCallback(async () => {
    const token = getAccessToken();
    if (!token) return;

    // 1. Permissão foreground
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      setTrackingState((prev) => ({
        ...prev,
        hasPermission: false,
        error: 'Permissão de localização negada',
      }));
      return;
    }

    setTrackingState((prev) => ({ ...prev, hasPermission: true }));

    // 2. Conectar WebSocket
    const socket = io(`${WS_BASE_URL}/location`, {
      auth: { token },
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 3000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setTrackingState((prev) => ({ ...prev, isTracking: true, error: null }));

      // Primeira atualização imediata ao conectar
      void sendLocation(socket);

      // BUG #6 FIX: intervalo só é iniciado após confirmação de conexão,
      // evitando emissões em socket offline e dreno de GPS/bateria
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = setInterval(() => {
        void sendLocation(socket);
      }, UPDATE_INTERVAL_MS);
    });

    socket.on('connect_error', (err) => {
      setTrackingState((prev) => ({
        ...prev,
        error: `WebSocket: ${err.message}`,
      }));
    });

    socket.on('disconnect', () => {
      // Para o intervalo ao desconectar — será reiniciado no próximo 'connect'
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setTrackingState((prev) => ({ ...prev, isTracking: false }));
    });
  // 'getAccessToken' lê o token via MMKV a cada chamada — não é uma dep do hook
  }, [sendLocation]);

  // ── Parar tracking ────────────────────────────────────────────────────────

  const stopTracking = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    setTrackingState((prev) => ({ ...prev, isTracking: false, status: 'IDLE' }));
  }, []);

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  useEffect(() => {
    void startTracking();
    return () => stopTracking();
  }, [startTracking, stopTracking]);

  return { trackingState, stopTracking, restartTracking: startTracking };
}
