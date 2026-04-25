/**
 * Banner visível no topo quando offline ou sincronizando.
 * Obrigatório no header do app do técnico (requisito do projeto).
 */
import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useNetworkSync } from '../../hooks/useNetworkSync';

export function OfflineBanner(): React.ReactElement | null {
  const { isOnline, isSyncing, pendingCount } = useNetworkSync();

  if (isOnline && !isSyncing) return null;

  return (
    <View style={[styles.banner, isSyncing ? styles.syncing : styles.offline]}>
      {isSyncing ? (
        <>
          <ActivityIndicator size="small" color="#fff" />
          <Text style={styles.text}>Sincronizando dados offline...</Text>
        </>
      ) : (
        <>
          <Text style={styles.icon}>📡</Text>
          <Text style={styles.text}>
            Modo offline
            {pendingCount > 0 ? ` — ${pendingCount} item(s) pendente(s)` : ''}
          </Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    gap: 8,
  },
  offline: { backgroundColor: '#ef4444' },
  syncing: { backgroundColor: '#f59e0b' },
  text: { color: '#fff', fontSize: 13, fontWeight: '600' },
  icon: { fontSize: 14 },
});
