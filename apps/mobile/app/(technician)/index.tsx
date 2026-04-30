import { useEffect } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { apiClient, tokenStorage } from '../../src/lib/api-client';

type ServiceOrder = {
  id: string;
  code: string;
  title: string;
  type: string;
  status: string;
  priority: string;
  scheduledDate?: string;
  property?: { name: string; city: string; state: string };
};

const STATUS_COLOR: Record<string, string> = {
  OPEN: '#3498DB',
  ASSIGNED: '#F39C12',
  IN_PROGRESS: '#8E44AD',
  COMPLETED: '#27AE60',
  CANCELLED: '#95A5A6',
};

const STATUS_LABEL: Record<string, string> = {
  OPEN: 'Aberta',
  ASSIGNED: 'Atribuída',
  IN_PROGRESS: 'Em andamento',
  COMPLETED: 'Concluída',
  CANCELLED: 'Cancelada',
};

const PRIORITY_LABEL: Record<string, string> = {
  LOW: 'Baixa',
  MEDIUM: 'Média',
  HIGH: 'Alta',
  CRITICAL: 'Crítica',
};

export default function TechnicianHome() {
  const navigation = useNavigation();
  const userName = tokenStorage.getString('userName') ?? 'Técnico';

  useEffect(() => {
    navigation.setOptions({ title: 'Minhas Ordens' });
  }, [navigation]);

  const { data, isLoading, isError } = useQuery<ServiceOrder[]>({
    queryKey: ['serviceOrders', 'technician'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: ServiceOrder[] }>('/service-orders');
      return res.data.data ?? [];
    },
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#1E3A5F" />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>Erro ao carregar ordens de serviço.</Text>
      </View>
    );
  }

  const orders = data ?? [];

  function renderItem({ item }: { item: ServiceOrder }) {
    const color = STATUS_COLOR[item.status] ?? '#95A5A6';
    const scheduled = item.scheduledDate
      ? new Date(item.scheduledDate).toLocaleDateString('pt-BR')
      : '—';

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.code}>{item.code}</Text>
          <View style={[styles.statusBadge, { backgroundColor: color + '22' }]}>
            <Text style={[styles.statusText, { color }]}>
              {STATUS_LABEL[item.status] ?? item.status}
            </Text>
          </View>
        </View>
        <Text style={styles.title}>{item.title}</Text>
        {item.property && (
          <Text style={styles.property}>
            📍 {item.property.name} — {item.property.city}/{item.property.state}
          </Text>
        )}
        <View style={styles.footer}>
          <Text style={styles.meta}>Prioridade: {PRIORITY_LABEL[item.priority] ?? item.priority}</Text>
          <Text style={styles.meta}>Agendado: {scheduled}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.greeting}>Olá, {userName.split(' ')[0]} 🔧</Text>
      {orders.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.empty}>Nenhuma ordem de serviço atribuída.</Text>
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(o) => o.id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: 32 }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0F4F8', padding: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  greeting: { fontSize: 20, fontWeight: '700', color: '#1E3A5F', marginBottom: 16 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 8, elevation: 3 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  code: { fontSize: 12, fontWeight: '700', color: '#9BACC0', letterSpacing: 0.5 },
  statusBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 11, fontWeight: '700' },
  title: { fontSize: 15, fontWeight: '600', color: '#1E3A5F', marginBottom: 6 },
  property: { fontSize: 13, color: '#6B7E97', marginBottom: 8 },
  footer: { flexDirection: 'row', justifyContent: 'space-between' },
  meta: { fontSize: 12, color: '#9BACC0' },
  error: { color: '#C0392B', fontSize: 15 },
  empty: { color: '#9BACC0', fontSize: 15 },
});
