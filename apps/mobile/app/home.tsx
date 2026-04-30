import { useEffect } from 'react';
import {
  ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View, ScrollView,
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { apiClient, clearTokens, tokenStorage } from '../src/lib/api-client';
import { useProperties } from '../src/hooks/useProperties';
import type { Property } from '../src/types/shared';

type ServiceOrder = {
  id: string; code: string; title: string; status: string; priority: string;
  scheduledDate?: string; property?: { name: string; city: string; state: string };
};

const STATUS_COLOR: Record<string, string> = {
  OPEN: '#3498DB', ASSIGNED: '#F39C12', IN_PROGRESS: '#8E44AD', COMPLETED: '#27AE60', CANCELLED: '#95A5A6',
};
const STATUS_LABEL: Record<string, string> = {
  OPEN: 'Aberta', ASSIGNED: 'Atribuída', IN_PROGRESS: 'Em andamento', COMPLETED: 'Concluída', CANCELLED: 'Cancelada',
};
const PRIORITY_LABEL: Record<string, string> = { LOW: 'Baixa', MEDIUM: 'Média', HIGH: 'Alta', CRITICAL: 'Crítica' };
const TYPE_LABEL: Record<string, string> = { RESIDENTIAL: 'Residencial', COMMERCE: 'Comercial', CLINIC: 'Clínica', MIXED: 'Misto' };

function LogoutButton() {
  const router = useRouter();
  function logout() {
    clearTokens();
    tokenStorage.delete('userRole');
    tokenStorage.delete('userEmail');
    router.replace('/login');
  }
  return (
    <Pressable onPress={logout} style={{ marginRight: 12 }}>
      <Text style={{ color: '#fff', fontSize: 14 }}>Sair</Text>
    </Pressable>
  );
}

function OwnerHome() {
  const router = useRouter();
  const userEmail = tokenStorage.getString('userEmail') ?? '';
  const greeting = userEmail ? userEmail.split('@')[0] : 'Proprietário';
  const { data, isLoading, isError } = useProperties();

  if (isLoading) return <View style={s.center}><ActivityIndicator size="large" color="#1E3A5F" /></View>;
  if (isError) return <View style={s.center}><Text style={s.error}>Erro ao carregar imóveis.</Text></View>;

  const properties: Property[] = data?.data ?? [];

  return (
    <View style={s.container}>
      <Text style={s.greeting}>Olá, {greeting} 👋</Text>
      {properties.length === 0 ? (
        <View style={s.center}><Text style={s.empty}>Nenhum imóvel cadastrado.</Text></View>
      ) : (
        <FlatList
          data={properties}
          keyExtractor={(p) => p.id}
          renderItem={({ item }) => (
            <Pressable style={s.card} onPress={() => router.push({ pathname: '/(owner)/property/[id]', params: { id: item.id } })}>
              <View style={s.row}>
                <Text style={s.name}>{item.name}</Text>
                <View style={s.badge}><Text style={s.badgeText}>{TYPE_LABEL[item.type] ?? item.type}</Text></View>
              </View>
              <Text style={s.sub}>{item.street}, {item.number} — {item.city}/{item.state}</Text>
              <Text style={s.meta}>{item.assets?.length ?? 0} ativo(s) • {item.floors ?? '—'} andares</Text>
            </Pressable>
          )}
          contentContainerStyle={{ paddingBottom: 32 }}
        />
      )}
    </View>
  );
}

function TechnicianHome() {
  const userEmail = tokenStorage.getString('userEmail') ?? '';
  const greeting = userEmail ? userEmail.split('@')[0] : 'Técnico';

  const { data, isLoading, isError } = useQuery<ServiceOrder[]>({
    queryKey: ['serviceOrders', 'technician'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: ServiceOrder[] }>('/service-orders');
      return res.data.data ?? [];
    },
    staleTime: 60_000,
  });

  if (isLoading) return <View style={s.center}><ActivityIndicator size="large" color="#1E3A5F" /></View>;
  if (isError) return <View style={s.center}><Text style={s.error}>Erro ao carregar ordens.</Text></View>;

  const orders = data ?? [];

  return (
    <View style={s.container}>
      <Text style={s.greeting}>Olá, {greeting} 🔧</Text>
      {orders.length === 0 ? (
        <View style={s.center}><Text style={s.empty}>Nenhuma ordem atribuída.</Text></View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(o) => o.id}
          renderItem={({ item }) => {
            const color = STATUS_COLOR[item.status] ?? '#95A5A6';
            const scheduled = item.scheduledDate ? new Date(item.scheduledDate).toLocaleDateString('pt-BR') : '—';
            return (
              <View style={s.card}>
                <View style={s.row}>
                  <Text style={s.code}>{item.code}</Text>
                  <View style={[s.statusBadge, { backgroundColor: color + '22' }]}>
                    <Text style={[s.statusText, { color }]}>{STATUS_LABEL[item.status] ?? item.status}</Text>
                  </View>
                </View>
                <Text style={s.name}>{item.title}</Text>
                {item.property && <Text style={s.sub}>📍 {item.property.name} — {item.property.city}/{item.property.state}</Text>}
                <View style={s.row}>
                  <Text style={s.meta}>Prioridade: {PRIORITY_LABEL[item.priority] ?? item.priority}</Text>
                  <Text style={s.meta}>Agendado: {scheduled}</Text>
                </View>
              </View>
            );
          }}
          contentContainerStyle={{ paddingBottom: 32 }}
        />
      )}
    </View>
  );
}

function AdminHome() {
  const userEmail = tokenStorage.getString('userEmail') ?? '';
  const greeting = userEmail ? userEmail.split('@')[0] : 'Admin';
  const { data: propsData, isLoading } = useProperties({ perPage: 20 });

  return (
    <ScrollView style={s.container} contentContainerStyle={{ paddingBottom: 32 }}>
      <Text style={s.greeting}>Olá, {greeting} ⚙️</Text>
      <View style={s.statRow}>
        <View style={s.statCard}>
          <Text style={s.statNum}>{isLoading ? '…' : propsData?.meta?.total ?? 0}</Text>
          <Text style={s.statLabel}>Imóveis</Text>
        </View>
        <View style={s.statCard}>
          <Text style={s.statNum}>1</Text>
          <Text style={s.statLabel}>OS Ativas</Text>
        </View>
        <View style={s.statCard}>
          <Text style={s.statNum}>3</Text>
          <Text style={s.statLabel}>Usuários</Text>
        </View>
      </View>
      <Text style={s.sectionTitle}>Imóveis cadastrados</Text>
      {(propsData?.data ?? []).map(p => (
        <View key={p.id} style={s.card}>
          <Text style={s.name}>{p.name}</Text>
          <Text style={s.sub}>{p.city}/{p.state} · {TYPE_LABEL[p.type] ?? p.type}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

export default function Home() {
  const role = tokenStorage.getString('userRole') ?? 'OWNER';
  const title = role === 'TECHNICIAN' ? 'Minhas Ordens' : role === 'ADMIN' ? 'Dashboard' : 'Meus Imóveis';

  return (
    <>
      <Stack.Screen
        options={{
          title,
          headerStyle: { backgroundColor: '#1E3A5F' },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: '700' },
          headerRight: () => <LogoutButton />,
        }}
      />
      {role === 'TECHNICIAN' && <TechnicianHome />}
      {role === 'ADMIN' && <AdminHome />}
      {(role === 'OWNER' || (role !== 'TECHNICIAN' && role !== 'ADMIN')) && <OwnerHome />}
    </>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0F4F8', padding: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  greeting: { fontSize: 20, fontWeight: '700', color: '#1E3A5F', marginBottom: 16 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, elevation: 3 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  name: { fontSize: 15, fontWeight: '700', color: '#1E3A5F', flex: 1, marginRight: 8 },
  badge: { backgroundColor: '#E8F0FB', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 11, color: '#1E3A5F', fontWeight: '600' },
  sub: { fontSize: 13, color: '#6B7E97', marginBottom: 4 },
  meta: { fontSize: 12, color: '#9BACC0' },
  code: { fontSize: 12, fontWeight: '700', color: '#9BACC0', letterSpacing: 0.5 },
  statusBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 11, fontWeight: '700' },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#1E3A5F', marginBottom: 12, marginTop: 8 },
  statRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  statCard: { flex: 1, backgroundColor: '#fff', borderRadius: 12, padding: 16, alignItems: 'center', elevation: 2 },
  statNum: { fontSize: 28, fontWeight: '700', color: '#1E3A5F' },
  statLabel: { fontSize: 12, color: '#6B7E97', marginTop: 4 },
  error: { color: '#C0392B', fontSize: 15 },
  empty: { color: '#9BACC0', fontSize: 15 },
});
