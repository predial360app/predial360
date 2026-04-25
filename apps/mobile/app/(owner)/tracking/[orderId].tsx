/**
 * Owner Tracking Screen — Rastreamento do técnico em tempo real.
 * ─────────────────────────────────────────────────────────────────────────────
 * - Mapa react-native-maps com pin animado do técnico (EAS build / APK)
 * - Fallback text-based para Expo Go (react-native-maps não disponível)
 * - WebSocket /location: eventos order:location em tempo real
 * - Fallback: polling a cada 15s via React Query (GET /eta/:id)
 * - Card inferior: nome do técnico, ETA, status, botão de chat
 * - Alerta visual quando técnico está a < 500m
 */
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Animated,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { io, type Socket } from 'socket.io-client';
import { Ionicons } from '@expo/vector-icons';

import { apiClient, tokenStorage } from '../../../src/lib/api-client';

// ─── Detecção de Expo Go ──────────────────────────────────────────────────────
// react-native-maps requer código nativo não disponível no Expo Go.
// Usamos try/require para não quebrar o bundle — se falhar, ativamos o fallback.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let RNMapsLib: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  RNMapsLib = require('react-native-maps');
} catch {
  // Expo Go — módulo nativo ausente, usaremos fallback
}

const IS_EXPO_GO = !RNMapsLib;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MapView: any = RNMapsLib?.default ?? null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Marker: any = RNMapsLib?.Marker ?? null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Polyline: any = RNMapsLib?.Polyline ?? null;
const PROVIDER_GOOGLE = RNMapsLib?.PROVIDER_GOOGLE ?? null;

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface TrackingData {
  eta: {
    etaMinutes: number | null;
    distanceMeters: number | null;
    lastSeenAt: string | null;
    isOnline: boolean;
  };
  technician: {
    id: string;
    name: string;
    avatarUrl: string | null;
    rating: string | null;
    phone: string | null;
  } | null;
  order: {
    id: string;
    code: string;
    title: string;
    status: string;
    propertyLatitude?: number | null;
    propertyLongitude?: number | null;
    propertyAddress?: string | null;
  };
}

interface LocationEvent {
  lat: number;
  lng: number;
  accuracy?: number;
  heading?: number;
  speed?: number;
  status: 'EN_ROUTE' | 'ON_SITE' | 'IDLE';
  timestamp: string;
}

interface Coordinate {
  latitude: number;
  longitude: number;
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const WS_BASE_URL = (process.env['EXPO_PUBLIC_API_URL'] ?? 'http://localhost:3000/api/v1').replace(
  /\/api\/v\d+$/,
  '',
);

const TRAIL_MAX_POINTS = 20;

// ─── Hook de rastreamento WebSocket ───────────────────────────────────────────

function useRealtimeTracking(serviceOrderId: string) {
  const [techLocation, setTechLocation] = useState<Coordinate | null>(null);
  const [locationStatus, setLocationStatus] = useState<LocationEvent['status']>('EN_ROUTE');
  const [trail, setTrail] = useState<Coordinate[]>([]);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const token = tokenStorage.getString('accessToken');
    if (!token) return;

    const socket = io(`${WS_BASE_URL}/location`, {
      auth: { token },
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 3000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('location:subscribe', { serviceOrderId });
    });

    socket.on('location:updated', (data: { latitude: number; longitude: number; status?: LocationEvent['status'] }) => {
      const coord = { latitude: data.latitude, longitude: data.longitude };
      setTechLocation(coord);
      setLastUpdate(new Date());
      if (data.status) setLocationStatus(data.status);
      setTrail((prev) => [...prev.slice(-TRAIL_MAX_POINTS + 1), coord]);
    });

    socket.on('order:location', (data: LocationEvent) => {
      const coord = { latitude: data.lat, longitude: data.lng };
      setTechLocation(coord);
      setLocationStatus(data.status);
      setLastUpdate(new Date());
      setTrail((prev) => [...prev.slice(-TRAIL_MAX_POINTS + 1), coord]);
    });

    return () => {
      socket.emit('location:unsubscribe', { serviceOrderId });
      socket.disconnect();
      socketRef.current = null;
    };
  }, [serviceOrderId]);

  return { techLocation, locationStatus, trail, lastUpdate };
}

// ─── Fallback: Tela de rastreamento sem mapa (Expo Go) ───────────────────────

interface FallbackProps {
  tracking: TrackingData | undefined;
  isLoading: boolean;
  techLocation: Coordinate | null;
  locationStatus: LocationEvent['status'];
  lastUpdate: Date | null;
  etaLabel: string;
  distanceLabel: string | null;
  statusConfig: { label: string; color: string; icon: React.ComponentProps<typeof Ionicons>['name'] };
  onCall: () => void;
}

function TrackingFallback({
  tracking,
  isLoading,
  techLocation,
  locationStatus,
  lastUpdate,
  etaLabel,
  distanceLabel,
  statusConfig,
  onCall,
}: FallbackProps) {
  const pulseAnim = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0.6, duration: 900, useNativeDriver: true }),
      ]),
    ).start();
  }, [pulseAnim]);

  const lastUpdateLabel = useMemo(() => {
    if (!lastUpdate) return null;
    const secs = Math.floor((Date.now() - lastUpdate.getTime()) / 1000);
    if (secs < 60) return `há ${secs}s`;
    return `há ${Math.floor(secs / 60)}min`;
  }, [lastUpdate]);

  if (isLoading && !techLocation) {
    return (
      <View style={fb.center}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={fb.loadingText}>Localizando técnico...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={fb.container} contentContainerStyle={fb.content}>
      {/* ── Banner Expo Go ── */}
      <View style={fb.expoBanner}>
        <Ionicons name="information-circle-outline" size={16} color="#94a3b8" />
        <Text style={fb.expoText}>
          Mapa interativo disponível na versão APK/TestFlight.
        </Text>
      </View>

      {/* ── Card de status ao vivo ── */}
      <View style={fb.liveCard}>
        <View style={fb.liveHeader}>
          <View style={fb.liveIndicator}>
            <Animated.View style={[fb.liveDot, { backgroundColor: statusConfig.color, opacity: pulseAnim }]} />
            <Text style={[fb.liveLabel, { color: statusConfig.color }]}>AO VIVO</Text>
          </View>
          {lastUpdateLabel && (
            <Text style={fb.lastUpdate}>Atualizado {lastUpdateLabel}</Text>
          )}
        </View>

        {/* Status + distância */}
        <View style={fb.statusRow}>
          <View style={[fb.statusIcon, { backgroundColor: `${statusConfig.color}22` }]}>
            <Ionicons name={statusConfig.icon} size={22} color={statusConfig.color} />
          </View>
          <View style={fb.statusText}>
            <Text style={fb.statusLabel}>{statusConfig.label}</Text>
            {distanceLabel && (
              <Text style={fb.distanceText}>{distanceLabel} do destino</Text>
            )}
          </View>
        </View>

        {/* Coordenadas */}
        {techLocation ? (
          <View style={fb.coordBox}>
            <Ionicons name="location" size={14} color="#3b82f6" />
            <Text style={fb.coordText}>
              {techLocation.latitude.toFixed(5)}, {techLocation.longitude.toFixed(5)}
            </Text>
          </View>
        ) : (
          <View style={fb.coordBox}>
            <Ionicons name="location-outline" size={14} color="#475569" />
            <Text style={[fb.coordText, { color: '#475569' }]}>
              Aguardando primeira localização...
            </Text>
          </View>
        )}
      </View>

      {/* ── ETA ── */}
      <View style={fb.etaCard}>
        <Text style={fb.etaSmall}>TEMPO ESTIMADO</Text>
        <Text style={fb.etaValue}>{etaLabel}</Text>
      </View>

      {/* ── Destino ── */}
      {tracking?.order.propertyAddress && (
        <View style={fb.destCard}>
          <View style={fb.destIcon}>
            <Ionicons name="home" size={18} color="#f59e0b" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={fb.destLabel}>Destino</Text>
            <Text style={fb.destAddress}>{tracking.order.propertyAddress}</Text>
          </View>
        </View>
      )}

      {/* ── Técnico ── */}
      {tracking?.technician && (
        <View style={fb.techCard}>
          <View style={fb.techAvatar}>
            <Ionicons name="person" size={24} color="#3b82f6" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={fb.techName}>{tracking.technician.name}</Text>
            {tracking.technician.rating && (
              <View style={fb.ratingRow}>
                <Ionicons name="star" size={12} color="#fbbf24" />
                <Text style={fb.ratingText}>{tracking.technician.rating}</Text>
              </View>
            )}
          </View>
          {tracking.technician.phone && (
            <TouchableOpacity style={fb.callBtn} onPress={onCall}>
              <Ionicons name="call" size={20} color="#fff" />
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* ── OS ── */}
      {tracking?.order && (
        <View style={fb.orderCard}>
          <Ionicons name="document-text-outline" size={16} color="#64748b" />
          <Text style={fb.orderText}>
            {tracking.order.code} · {tracking.order.title}
          </Text>
        </View>
      )}

      {/* ── Alerta ON_SITE ── */}
      {locationStatus === 'ON_SITE' && (
        <View style={fb.proximityAlert}>
          <Ionicons name="flash" size={18} color="#22c55e" />
          <Text style={fb.proximityText}>Técnico chegou ao local!</Text>
        </View>
      )}
    </ScrollView>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function TrackingScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const mapRef = useRef<InstanceType<typeof MapView> | null>(null);
  const pinScale = useRef(new Animated.Value(1)).current;

  // ── API polling ────────────────────────────────────────────────────────

  const { data: tracking, isLoading } = useQuery<TrackingData>({
    queryKey: ['tracking', orderId],
    queryFn: async () => {
      const { data } = await apiClient.get<TrackingData>(
        `/service-orders/${orderId}/tracking`,
      );
      return data;
    },
    refetchInterval: 15_000,
    staleTime: 10_000,
  });

  // ── WebSocket ──────────────────────────────────────────────────────────

  const { techLocation, locationStatus, trail, lastUpdate } = useRealtimeTracking(orderId);

  // ── Destino (propriedade) ──────────────────────────────────────────────

  const propertyCoord: Coordinate | null = useMemo(() => {
    const lat = tracking?.order.propertyLatitude;
    const lng = tracking?.order.propertyLongitude;
    if (!lat || !lng) return null;
    return { latitude: lat, longitude: lng };
  }, [tracking?.order.propertyLatitude, tracking?.order.propertyLongitude]);

  // ── Animação bounce no pin ao atualizar ──────────────────────────────

  useEffect(() => {
    if (!techLocation) return;
    Animated.sequence([
      Animated.timing(pinScale, { toValue: 1.4, duration: 150, useNativeDriver: true }),
      Animated.timing(pinScale, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
    // Centralizar mapa (apenas quando nativo)
    if (!IS_EXPO_GO && mapRef.current) {
      mapRef.current.animateCamera({ center: techLocation, zoom: 15 }, { duration: 800 });
    }
  }, [techLocation, pinScale]);

  // ── Helpers de display ────────────────────────────────────────────────

  const statusConfig = useMemo(() => {
    switch (locationStatus) {
      case 'ON_SITE':
        return { label: 'No local', color: '#22c55e', icon: 'location' as const };
      case 'EN_ROUTE':
        return { label: 'A caminho', color: '#3b82f6', icon: 'navigate' as const };
      default:
        return { label: 'Aguardando', color: '#94a3b8', icon: 'time' as const };
    }
  }, [locationStatus]);

  const etaLabel = useMemo(() => {
    const eta = tracking?.eta;
    if (!eta?.isOnline) return 'Técnico offline';
    if (eta.etaMinutes == null) return 'Calculando...';
    if (eta.etaMinutes <= 1) return 'Chegando agora';
    return `~${eta.etaMinutes} min`;
  }, [tracking?.eta]);

  const distanceLabel = useMemo(() => {
    const d = tracking?.eta?.distanceMeters;
    if (!d) return null;
    return d >= 1000 ? `${(d / 1000).toFixed(1)} km` : `${Math.round(d)} m`;
  }, [tracking?.eta?.distanceMeters]);

  const callTechnician = useCallback(() => {
    const phone = tracking?.technician?.phone;
    if (!phone) return;
    void Linking.openURL(`tel:${phone.replace(/\D/g, '')}`);
  }, [tracking?.technician?.phone]);

  // ─── Render: Expo Go → fallback text-based ───────────────────────────────

  if (IS_EXPO_GO) {
    return (
      <>
        <Stack.Screen
          options={{
            title: tracking?.order.code ?? 'Rastreamento',
            headerStyle: { backgroundColor: '#0f172a' },
            headerTintColor: '#f1f5f9',
            headerTitleStyle: { fontWeight: '700' },
          }}
        />
        <TrackingFallback
          tracking={tracking}
          isLoading={isLoading}
          techLocation={techLocation}
          locationStatus={locationStatus}
          lastUpdate={lastUpdate}
          etaLabel={etaLabel}
          distanceLabel={distanceLabel}
          statusConfig={statusConfig}
          onCall={callTechnician}
        />
      </>
    );
  }

  // ─── Render: Nativo (APK/TestFlight) → MapView completo ──────────────────

  const initialRegion = {
    latitude: -23.5505,
    longitude: -46.6333,
    latitudeDelta: 0.02,
    longitudeDelta: 0.02,
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: tracking?.order.code ?? 'Rastreamento',
          headerStyle: { backgroundColor: '#0f172a' },
          headerTintColor: '#f1f5f9',
          headerTitleStyle: { fontWeight: '700' },
        }}
      />

      <View style={styles.container}>
        {/* ── Mapa ── */}
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          provider={PROVIDER_GOOGLE}
          initialRegion={initialRegion}
          showsUserLocation={false}
          showsMyLocationButton={false}
          showsCompass={false}
        >
          {trail.length > 1 && (
            <Polyline
              coordinates={trail}
              strokeColor="#3b82f6"
              strokeWidth={3}
              lineDashPattern={[8, 4]}
            />
          )}

          {propertyCoord && (
            <Marker
              coordinate={propertyCoord}
              anchor={{ x: 0.5, y: 1 }}
              title={tracking?.order.propertyAddress ?? 'Local do serviço'}
            >
              <View style={styles.destMarker}>
                <Ionicons name="home" size={16} color="#fff" />
              </View>
            </Marker>
          )}

          {techLocation && (
            <Marker coordinate={techLocation} anchor={{ x: 0.5, y: 0.5 }} flat>
              <Animated.View
                style={[styles.techMarkerContainer, { transform: [{ scale: pinScale }] }]}
              >
                <View style={[styles.techMarkerOuter, { borderColor: statusConfig.color }]}>
                  <View style={[styles.techMarkerInner, { backgroundColor: statusConfig.color }]}>
                    <Ionicons name="person" size={14} color="#fff" />
                  </View>
                </View>
                {locationStatus === 'EN_ROUTE' && (
                  <View style={styles.headingIndicator} />
                )}
              </Animated.View>
            </Marker>
          )}
        </MapView>

        {isLoading && !techLocation && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#3b82f6" />
            <Text style={styles.loadingText}>Localizando técnico...</Text>
          </View>
        )}

        {techLocation && (
          <View style={styles.statusBadge}>
            <View style={[styles.statusDot, { backgroundColor: statusConfig.color }]} />
            <Text style={styles.statusLabel}>{statusConfig.label}</Text>
            {distanceLabel && (
              <Text style={styles.distanceLabel}> · {distanceLabel}</Text>
            )}
          </View>
        )}

        {techLocation && (
          <TouchableOpacity
            style={styles.centerButton}
            onPress={() =>
              mapRef.current?.animateCamera({ center: techLocation, zoom: 15 }, { duration: 500 })
            }
          >
            <Ionicons name="locate" size={22} color="#fff" />
          </TouchableOpacity>
        )}

        {/* ── Card inferior ── */}
        <View style={styles.bottomCard}>
          <View style={styles.cardHeader}>
            <View>
              <Text style={styles.etaLabel}>{etaLabel}</Text>
              {tracking?.technician && (
                <Text style={styles.techName}>{tracking.technician.name}</Text>
              )}
              {tracking?.technician?.rating && (
                <View style={styles.ratingRow}>
                  <Ionicons name="star" size={12} color="#fbbf24" />
                  <Text style={styles.ratingText}>{tracking.technician.rating}</Text>
                </View>
              )}
            </View>

            {tracking?.technician?.phone && (
              <TouchableOpacity style={styles.callButton} onPress={callTechnician}>
                <Ionicons name="call" size={22} color="#fff" />
              </TouchableOpacity>
            )}
          </View>

          {tracking?.order && (
            <View style={styles.orderRow}>
              <Ionicons name="document-text-outline" size={14} color="#64748b" />
              <Text style={styles.orderText}>
                {tracking.order.code} · {tracking.order.title}
              </Text>
            </View>
          )}

          {locationStatus === 'ON_SITE' && (
            <View style={styles.proximityAlert}>
              <Ionicons name="flash" size={16} color="#22c55e" />
              <Text style={styles.proximityAlertText}>Técnico chegou ao local!</Text>
            </View>
          )}

          {!techLocation && !isLoading && (
            <View style={styles.noLocationRow}>
              <Ionicons name="location-outline" size={14} color="#94a3b8" />
              <Text style={styles.noLocationText}>
                Aguardando atualização de localização...
              </Text>
            </View>
          )}
        </View>
      </View>
    </>
  );
}

// ─── Estilos (versão nativa com mapa) ────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,23,42,0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: { color: '#94a3b8', fontSize: 14 },
  statusBadge: {
    position: 'absolute',
    top: 16,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15,23,42,0.85)',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusLabel: { color: '#f1f5f9', fontSize: 13, fontWeight: '600' },
  distanceLabel: { color: '#94a3b8', fontSize: 13 },
  centerButton: {
    position: 'absolute',
    right: 16,
    bottom: 240,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  destMarker: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f59e0b',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 6,
  },
  techMarkerContainer: { alignItems: 'center' },
  techMarkerOuter: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.95)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 6,
  },
  techMarkerInner: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headingIndicator: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderBottomWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#3b82f6',
    marginTop: -2,
  },
  bottomCard: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#0f172a',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 36,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(148,163,184,0.1)',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  etaLabel: { color: '#f1f5f9', fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  techName: { color: '#94a3b8', fontSize: 14, marginTop: 2 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 4 },
  ratingText: { color: '#fbbf24', fontSize: 12, fontWeight: '600' },
  callButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#22c55e',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#22c55e',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 4,
  },
  orderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: 'rgba(148,163,184,0.08)',
  },
  orderText: { color: '#64748b', fontSize: 13, flex: 1 },
  proximityAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(34,197,94,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.3)',
    borderRadius: 10,
    padding: 12,
  },
  proximityAlertText: { color: '#22c55e', fontSize: 14, fontWeight: '600' },
  noLocationRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  noLocationText: { color: '#475569', fontSize: 13 },
});

// ─── Estilos do fallback (Expo Go) ────────────────────────────────────────────

const fb = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: '#0f172a' },
  loadingText: { color: '#94a3b8', fontSize: 14 },

  expoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(148,163,184,0.08)',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.12)',
  },
  expoText: { color: '#94a3b8', fontSize: 12, flex: 1 },

  liveCard: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 16,
    gap: 14,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.08)',
  },
  liveHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  liveIndicator: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  liveLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  lastUpdate: { color: '#475569', fontSize: 12 },

  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  statusIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusText: { flex: 1 },
  statusLabel: { color: '#f1f5f9', fontSize: 18, fontWeight: '700' },
  distanceText: { color: '#94a3b8', fontSize: 13, marginTop: 2 },

  coordBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(15,23,42,0.6)',
    borderRadius: 8,
    padding: 10,
  },
  coordText: { color: '#64748b', fontSize: 12, fontFamily: 'monospace' },

  etaCard: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.08)',
  },
  etaSmall: { color: '#64748b', fontSize: 10, fontWeight: '700', letterSpacing: 1.5, marginBottom: 6 },
  etaValue: { color: '#f1f5f9', fontSize: 32, fontWeight: '800', letterSpacing: -1 },

  destCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.2)',
  },
  destIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(245,158,11,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  destLabel: { color: '#64748b', fontSize: 11, fontWeight: '600', letterSpacing: 0.5 },
  destAddress: { color: '#f1f5f9', fontSize: 14, marginTop: 2 },

  techCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.08)',
  },
  techAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(59,130,246,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  techName: { color: '#f1f5f9', fontSize: 16, fontWeight: '700' },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 3 },
  ratingText: { color: '#fbbf24', fontSize: 12, fontWeight: '600' },
  callBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#22c55e',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#22c55e',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 4,
  },

  orderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.08)',
  },
  orderText: { color: '#64748b', fontSize: 13, flex: 1 },

  proximityAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(34,197,94,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.3)',
    borderRadius: 12,
    padding: 14,
  },
  proximityText: { color: '#22c55e', fontSize: 15, fontWeight: '700' },
});
