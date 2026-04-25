/**
 * Tela "Meu Imóvel" — mostra:
 *   - Card de health score (grade + barra + alertas)
 *   - Lista de ativos/sistemas com status visual
 *   - Acesso rápido: nova OS, ver laudos, escanear QR
 */
import React from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { useLocalSearchParams, router, Stack } from 'expo-router';

import { useProperty, usePropertyAssets } from '../../../src/hooks/useProperties';
import { HealthScoreCard } from '../../../src/components/ui/HealthScoreCard';

const CATEGORY_EMOJI: Record<string, string> = {
  ELECTRICAL: '⚡',
  HYDRAULIC: '🚿',
  HVAC: '❄️',
  ELEVATOR: '🛗',
  FIRE_SAFETY: '🔥',
  GENERATOR: '⚙️',
  SECURITY: '🔒',
  STRUCTURE: '🏗️',
  FACADE: '🏢',
  ROOF: '🏠',
  PLUMBING: '🔧',
  GAS: '💨',
  LANDSCAPING: '🌿',
  OTHER: '📦',
};

const STATUS_COLOR: Record<string, string> = {
  OPERATIONAL: '#22c55e',
  UNDER_MAINTENANCE: '#f59e0b',
  DEACTIVATED: '#6b7280',
  SCRAPPED: '#ef4444',
};

const STATUS_LABEL: Record<string, string> = {
  OPERATIONAL: 'Operacional',
  UNDER_MAINTENANCE: 'Em Manutenção',
  DEACTIVATED: 'Desativado',
  SCRAPPED: 'Descartado',
};

export default function PropertyDetailScreen(): React.ReactElement {
  const { id } = useLocalSearchParams<{ id: string }>();

  const {
    data: property,
    isLoading,
    refetch,
    isRefetching,
  } = useProperty(id);

  const { data: assets = [] } = usePropertyAssets(id);

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1E3A5F" />
        <Text style={styles.loadingText}>Carregando imóvel...</Text>
      </View>
    );
  }

  if (!property) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Imóvel não encontrado.</Text>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: property.name,
          headerRight: () => (
            <TouchableOpacity
              onPress={() => router.push(`/(owner)/property/${id}/add-asset`)}
              style={{ marginRight: 8 }}
            >
              <Text style={{ color: '#1E3A5F', fontSize: 24 }}>＋</Text>
            </TouchableOpacity>
          ),
        }}
      />

      <ScrollView
        style={styles.container}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
      >
        {/* Endereço */}
        <View style={styles.addressCard}>
          <Text style={styles.propertyType}>{property.type}</Text>
          <Text style={styles.address}>
            {property.street}, {property.number}
            {property.complement ? ` — ${property.complement}` : ''}
          </Text>
          <Text style={styles.cityState}>
            {property.city} — {property.state} · CEP {property.zipCode}
          </Text>
          {property.buildingAge && (
            <Text style={styles.meta}>🏗️ {property.buildingAge} anos de construção</Text>
          )}
          {property.totalArea && (
            <Text style={styles.meta}>📐 {property.totalArea} m²</Text>
          )}
        </View>

        {/* Health Score */}
        <HealthScoreCard
          score={property.healthScore.score}
          grade={property.healthScore.grade}
          alerts={property.healthScore.alerts}
        />

        {/* Ações rápidas */}
        <View style={styles.actionsRow}>
          <QuickAction
            emoji="🔧"
            label="Nova OS"
            onPress={() => router.push(`/(owner)/service-orders/new?propertyId=${id}`)}
          />
          <QuickAction
            emoji="📋"
            label="Laudos"
            onPress={() => router.push(`/(owner)/reports?propertyId=${id}`)}
          />
          <QuickAction
            emoji="📷"
            label="Escanear QR"
            onPress={() => router.push('/(owner)/qr-scanner')}
          />
        </View>

        {/* Lista de ativos */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Sistemas e Equipamentos ({assets.length})
          </Text>

          {assets.length === 0 ? (
            <View style={styles.emptyAssets}>
              <Text style={styles.emptyEmoji}>🔩</Text>
              <Text style={styles.emptyText}>
                Nenhum equipamento cadastrado ainda.{'\n'}
                Toque em + para adicionar.
              </Text>
            </View>
          ) : (
            assets.map((asset) => (
              <TouchableOpacity
                key={asset.id}
                style={styles.assetCard}
                onPress={() => router.push(`/(owner)/property/asset/${asset.id}`)}
              >
                <Text style={styles.assetEmoji}>
                  {CATEGORY_EMOJI[asset.category] ?? '📦'}
                </Text>
                <View style={styles.assetInfo}>
                  <Text style={styles.assetName}>{asset.name}</Text>
                  {asset.brand && (
                    <Text style={styles.assetMeta}>{asset.brand} {asset.model ?? ''}</Text>
                  )}
                  {asset.nextMaintenanceDate && (
                    <Text style={styles.assetMeta}>
                      🔧 Próx. manutenção:{' '}
                      {new Date(asset.nextMaintenanceDate).toLocaleDateString('pt-BR')}
                    </Text>
                  )}
                </View>
                <View style={styles.statusDot}>
                  <View
                    style={[
                      styles.dot,
                      { backgroundColor: STATUS_COLOR[asset.status] ?? '#6b7280' },
                    ]}
                  />
                  <Text style={styles.statusLabel}>
                    {STATUS_LABEL[asset.status] ?? asset.status}
                  </Text>
                </View>
              </TouchableOpacity>
            ))
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </>
  );
}

function QuickAction({
  emoji,
  label,
  onPress,
}: {
  emoji: string;
  label: string;
  onPress: () => void;
}): React.ReactElement {
  return (
    <TouchableOpacity style={styles.quickAction} onPress={onPress}>
      <Text style={styles.quickEmoji}>{emoji}</Text>
      <Text style={styles.quickLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: '#6b7280', fontSize: 14 },
  errorText: { color: '#ef4444', fontSize: 16 },
  addressCard: {
    backgroundColor: '#fff',
    margin: 16,
    marginBottom: 0,
    padding: 16,
    borderRadius: 16,
    gap: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  propertyType: { fontSize: 11, color: '#1E3A5F', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  address: { fontSize: 16, fontWeight: '700', color: '#111827' },
  cityState: { fontSize: 13, color: '#6b7280' },
  meta: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
    marginHorizontal: 16,
    marginVertical: 12,
  },
  quickAction: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    gap: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  quickEmoji: { fontSize: 22 },
  quickLabel: { fontSize: 11, fontWeight: '600', color: '#374151' },
  section: { marginHorizontal: 16, marginTop: 4 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1E3A5F', marginBottom: 12 },
  assetCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  assetEmoji: { fontSize: 26, width: 36, textAlign: 'center' },
  assetInfo: { flex: 1 },
  assetName: { fontSize: 14, fontWeight: '700', color: '#111827' },
  assetMeta: { fontSize: 11, color: '#9ca3af', marginTop: 2 },
  statusDot: { alignItems: 'center', gap: 4 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  statusLabel: { fontSize: 9, color: '#6b7280', textAlign: 'center', maxWidth: 60 },
  emptyAssets: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 32,
    alignItems: 'center',
    gap: 8,
  },
  emptyEmoji: { fontSize: 40 },
  emptyText: { fontSize: 13, color: '#9ca3af', textAlign: 'center', lineHeight: 20 },
});
