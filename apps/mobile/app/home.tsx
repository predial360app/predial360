import { useCallback } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { apiClient, clearTokens, tokenStorage } from '../src/lib/api-client';
import { useProperties } from '../src/hooks/useProperties';
import type { Property } from '../src/types/shared';

// ── Types ─────────────────────────────────────────────────────────────────────

type ServiceOrder = {
  id: string; code: string; title: string; type: string;
  status: string; priority: string; scheduledDate?: string;
  property?: { name: string; city: string; state: string };
};

// ── Constants ─────────────────────────────────────────────────────────────────

const TYPE_LABEL: Record<string,string> = { RESIDENTIAL:'Residencial', COMMERCE:'Comercial', CLINIC:'Clínica', MIXED:'Misto' };
const STATUS_COLOR: Record<string,string> = { OPEN:'#3498DB', ASSIGNED:'#F39C12', IN_PROGRESS:'#8E44AD', COMPLETED:'#27AE60', CANCELLED:'#95A5A6' };
const STATUS_LABEL: Record<string,string> = { OPEN:'Aberta', ASSIGNED:'Atribuída', IN_PROGRESS:'Em andamento', COMPLETED:'Concluída', CANCELLED:'Cancelada' };
const PRIORITY_LABEL: Record<string,string> = { LOW:'Baixa', MEDIUM:'Média', HIGH:'Alta', CRITICAL:'Crítica' };

// ── Logout helper ─────────────────────────────────────────────────────────────

function useLogout() {
  const router = useRouter();
  return useCallback(() => {
    clearTokens();
    tokenStorage.delete('userRole');
    tokenStorage.delete('userEmail');
    router.replace('/login');
  }, [router]);
}

// ── Owner view ────────────────────────────────────────────────────────────────

function OwnerHome() {
  const router = useRouter();
  const email = tokenStorage.getString('userEmail') ?? '';
  const name = email.split('@')[0];
  const { data, isLoading, isError, refetch } = useProperties();
  const properties: Property[] = data?.data ?? [];

  if (isLoading) return <View style={s.center}><ActivityIndicator size="large" color="#1E3A5F" /></View>;
  if (isError) return (
    <View style={s.center}>
      <Text style={s.errTxt}>Erro ao carregar imóveis.</Text>
      <Pressable style={s.retryBtn} onPress={() => void refetch()}><Text style={s.retryTxt}>Tentar novamente</Text></Pressable>
    </View>
  );

  return (
    <FlatList
      style={s.list}
      data={properties}
      keyExtractor={p => p.id}
      contentContainerStyle={{ padding:16, paddingBottom:32 }}
      ListHeaderComponent={<Text style={s.greeting}>Olá, {name} 👋</Text>}
      ListEmptyComponent={<View style={s.center}><Text style={s.muted}>Nenhum imóvel cadastrado.</Text></View>}
      refreshControl={<RefreshControl refreshing={isLoading} onRefresh={() => void refetch()} />}
      renderItem={({ item }) => (
        <Pressable style={s.card} onPress={() => router.push({ pathname:'/property/[id]', params:{ id:item.id } })}>
          <View style={s.row}>
            <Text style={s.title} numberOfLines={1}>{item.name}</Text>
            <View style={s.chip}><Text style={s.chipTxt}>{TYPE_LABEL[item.type] ?? item.type}</Text></View>
          </View>
          <Text style={s.sub}>{item.street}, {item.number} — {item.city}/{item.state}</Text>
          <Text style={s.meta}>{item.assets?.length ?? 0} ativo(s) · {item.floors ?? '—'} andares</Text>
        </Pressable>
      )}
    />
  );
}

// ── Technician view ───────────────────────────────────────────────────────────

function TechnicianHome() {
  const email = tokenStorage.getString('userEmail') ?? '';
  const name = email.split('@')[0];

  const { data, isLoading, isError, refetch } = useQuery<ServiceOrder[]>({
    queryKey: ['serviceOrders', 'mine'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: ServiceOrder[] }>('/service-orders');
      return res.data.data ?? [];
    },
    staleTime: 60_000,
  });

  if (isLoading) return <View style={s.center}><ActivityIndicator size="large" color="#1E3A5F" /></View>;
  if (isError) return (
    <View style={s.center}>
      <Text style={s.errTxt}>Erro ao carregar ordens.</Text>
      <Pressable style={s.retryBtn} onPress={() => void refetch()}><Text style={s.retryTxt}>Tentar novamente</Text></Pressable>
    </View>
  );

  const orders = data ?? [];

  return (
    <FlatList
      style={s.list}
      data={orders}
      keyExtractor={o => o.id}
      contentContainerStyle={{ padding:16, paddingBottom:32 }}
      ListHeaderComponent={<Text style={s.greeting}>Olá, {name} 🔧</Text>}
      ListEmptyComponent={<View style={s.center}><Text style={s.muted}>Nenhuma ordem atribuída.</Text></View>}
      refreshControl={<RefreshControl refreshing={isLoading} onRefresh={() => void refetch()} />}
      renderItem={({ item }) => {
        const color = STATUS_COLOR[item.status] ?? '#95A5A6';
        const date = item.scheduledDate ? new Date(item.scheduledDate).toLocaleDateString('pt-BR') : '—';
        return (
          <View style={s.card}>
            <View style={s.row}>
              <Text style={s.code}>{item.code}</Text>
              <View style={[s.statusChip, { backgroundColor: color + '22' }]}>
                <Text style={[s.statusTxt, { color }]}>{STATUS_LABEL[item.status] ?? item.status}</Text>
              </View>
            </View>
            <Text style={s.title}>{item.title}</Text>
            {item.property && <Text style={s.sub}>📍 {item.property.name} — {item.property.city}/{item.property.state}</Text>}
            <View style={s.row}>
              <Text style={s.meta}>Prioridade: {PRIORITY_LABEL[item.priority] ?? item.priority}</Text>
              <Text style={s.meta}>Agendado: {date}</Text>
            </View>
          </View>
        );
      }}
    />
  );
}

// ── Admin view ────────────────────────────────────────────────────────────────

function AdminHome() {
  const email = tokenStorage.getString('userEmail') ?? '';
  const name = email.split('@')[0];
  const { data: props, isLoading: loadProps } = useProperties({ perPage: 50 });
  const { data: orders, isLoading: loadOrders } = useQuery<ServiceOrder[]>({
    queryKey: ['serviceOrders', 'all'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: ServiceOrder[] }>('/service-orders');
      return res.data.data ?? [];
    },
    staleTime: 60_000,
  });

  const totalProps = props?.meta?.total ?? 0;
  const activeOrders = (orders ?? []).filter(o => o.status === 'ASSIGNED' || o.status === 'IN_PROGRESS').length;
  const properties: Property[] = props?.data ?? [];

  return (
    <ScrollView style={s.list} contentContainerStyle={{ padding:16, paddingBottom:32 }}>
      <Text style={s.greeting}>Olá, {name} ⚙️</Text>
      <View style={s.statsRow}>
        <View style={s.statCard}>
          <Text style={s.statNum}>{loadProps ? '…' : totalProps}</Text>
          <Text style={s.statLabel}>Imóveis</Text>
        </View>
        <View style={s.statCard}>
          <Text style={s.statNum}>{loadOrders ? '…' : activeOrders}</Text>
          <Text style={s.statLabel}>OS Ativas</Text>
        </View>
        <View style={s.statCard}>
          <Text style={s.statNum}>3</Text>
          <Text style={s.statLabel}>Usuários</Text>
        </View>
      </View>
      <Text style={s.section}>Imóveis cadastrados</Text>
      {properties.map(p => (
        <View key={p.id} style={s.card}>
          <Text style={s.title}>{p.name}</Text>
          <Text style={s.sub}>{p.city}/{p.state} · {TYPE_LABEL[p.type] ?? p.type}</Text>
          <Text style={s.meta}>{p.assets?.length ?? 0} ativo(s)</Text>
        </View>
      ))}
    </ScrollView>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────

export default function Home() {
  const logout = useLogout();
  const role = tokenStorage.getString('userRole') ?? 'OWNER';
  const title = role === 'TECHNICIAN' ? 'Minhas Ordens' : role === 'ADMIN' ? 'Dashboard Admin' : 'Meus Imóveis';

  return (
    <>
      <Stack.Screen options={{
        title,
        headerShown: true,
        headerStyle: { backgroundColor:'#1E3A5F' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight:'700' },
        headerRight: () => (
          <Pressable onPress={logout} style={{ marginRight:12 }}>
            <Text style={{ color:'#fff', fontSize:14 }}>Sair</Text>
          </Pressable>
        ),
      }} />
      {role === 'TECHNICIAN' ? <TechnicianHome /> :
       role === 'ADMIN' ? <AdminHome /> :
       <OwnerHome />}
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  list:       { flex:1, backgroundColor:'#F0F4F8' },
  center:     { flex:1, justifyContent:'center', alignItems:'center', padding:32 },
  greeting:   { fontSize:20, fontWeight:'700', color:'#1E3A5F', marginBottom:16 },
  card:       { backgroundColor:'#fff', borderRadius:12, padding:16, marginBottom:12, elevation:2 },
  row:        { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:4 },
  title:      { fontSize:15, fontWeight:'700', color:'#1E3A5F', flex:1, marginRight:8 },
  code:       { fontSize:12, fontWeight:'700', color:'#9BACC0', letterSpacing:0.5 },
  chip:       { backgroundColor:'#E8F0FB', borderRadius:6, paddingHorizontal:8, paddingVertical:3 },
  chipTxt:    { fontSize:11, color:'#1E3A5F', fontWeight:'600' },
  statusChip: { borderRadius:6, paddingHorizontal:8, paddingVertical:3 },
  statusTxt:  { fontSize:11, fontWeight:'700' },
  sub:        { fontSize:13, color:'#6B7E97', marginBottom:4 },
  meta:       { fontSize:12, color:'#9BACC0' },
  section:    { fontSize:15, fontWeight:'700', color:'#1E3A5F', marginBottom:12, marginTop:4 },
  statsRow:   { flexDirection:'row', gap:10, marginBottom:20 },
  statCard:   { flex:1, backgroundColor:'#fff', borderRadius:12, padding:14, alignItems:'center', elevation:2 },
  statNum:    { fontSize:26, fontWeight:'700', color:'#1E3A5F' },
  statLabel:  { fontSize:12, color:'#6B7E97', marginTop:3 },
  muted:      { color:'#9BACC0', fontSize:15 },
  errTxt:     { color:'#C0392B', fontSize:15, marginBottom:12 },
  retryBtn:   { backgroundColor:'#1E3A5F', borderRadius:8, paddingHorizontal:20, paddingVertical:10 },
  retryTxt:   { color:'#fff', fontSize:14 },
});
