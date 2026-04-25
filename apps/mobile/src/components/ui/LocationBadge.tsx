/**
 * LocationBadge — indicador de transmissão de localização ativa.
 * ─────────────────────────────────────────────────────────────────────────────
 * Exibido no header do técnico quando ele está em rota com uma OS ativa.
 * Mostra um ponto verde pulsante + label "Ao vivo" para indicar rastreamento ativo.
 * Ao pressionar, abre um Alert com opção de desativar a transmissão.
 *
 * Uso:
 *   <Stack.Screen options={{ headerRight: () => <LocationBadge isTracking={state.isTracking} onStop={stopTracking} /> }} />
 */
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface LocationBadgeProps {
  isTracking: boolean;
  status?: 'EN_ROUTE' | 'ON_SITE' | 'IDLE' | 'OFFLINE';
  onStop?: () => void;
}

const STATUS_LABELS: Record<string, string> = {
  EN_ROUTE: 'A caminho',
  ON_SITE: 'No local',
  IDLE: 'Parado',
  OFFLINE: 'Offline',
};

const STATUS_COLORS: Record<string, string> = {
  EN_ROUTE: '#3b82f6',
  ON_SITE: '#22c55e',
  IDLE: '#f59e0b',
  OFFLINE: '#94a3b8',
};

export function LocationBadge({ isTracking, status = 'EN_ROUTE', onStop }: LocationBadgeProps) {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const opacityAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!isTracking) {
      pulseAnim.setValue(1);
      opacityAnim.setValue(0.4);
      return;
    }

    // Pulso contínuo enquanto transmitindo
    const loop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(pulseAnim, {
            toValue: 1.6,
            duration: 700,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(opacityAnim, {
            toValue: 0,
            duration: 700,
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 0,
            useNativeDriver: true,
          }),
          Animated.timing(opacityAnim, {
            toValue: 1,
            duration: 0,
            useNativeDriver: true,
          }),
        ]),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [isTracking, pulseAnim, opacityAnim]);

  const dotColor = isTracking ? (STATUS_COLORS[status] ?? '#3b82f6') : '#94a3b8';
  const label = isTracking ? (STATUS_LABELS[status] ?? 'Ao vivo') : 'Rastreio off';

  const handlePress = () => {
    if (!isTracking || !onStop) return;
    Alert.alert(
      'Desativar rastreamento?',
      'O proprietário não poderá mais ver sua localização em tempo real.',
      [
        { text: 'Manter ativo', style: 'cancel' },
        { text: 'Desativar', style: 'destructive', onPress: onStop },
      ],
    );
  };

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={handlePress}
      activeOpacity={onStop ? 0.7 : 1}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      {/* Anel pulsante */}
      <Animated.View
        style={[
          styles.pulseRing,
          {
            backgroundColor: dotColor,
            transform: [{ scale: pulseAnim }],
            opacity: opacityAnim,
          },
        ]}
      />
      {/* Ponto sólido */}
      <Animated.View style={[styles.dot, { backgroundColor: dotColor }]} />
      <Text style={[styles.label, !isTracking && styles.labelOff]}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: 'rgba(148,163,184,0.1)',
    borderRadius: 20,
    marginRight: 8,
    position: 'relative',
  },
  pulseRing: {
    position: 'absolute',
    left: 10,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  label: {
    color: '#f1f5f9',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  labelOff: {
    color: '#64748b',
  },
});
