import { useEffect } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation, useRouter } from 'expo-router';
import { useProperties } from '../../src/hooks/useProperties';
import { tokenStorage } from '../../src/lib/api-client';
import type { Property } from '../../src/types/shared';

const TYPE_LABEL: Record<string, string> = {
  RESIDENTIAL: 'Residencial',
  COMMERCE: 'Comercial',
  CLINIC: 'Clínica',
  MIXED: 'Misto',
};

export default function OwnerHome() {
  const router = useRouter();
  const navigation = useNavigation();
  const userName = tokenStorage.getString('userName') ?? 'Proprietário';
  const { data, isLoading, isError } = useProperties();

  useEffect(() => {
    navigation.setOptions({ title: 'Meus Imóveis' });
  }, [navigation]);

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
        <Text style={styles.error}>Erro ao carregar imóveis.</Text>
      </View>
    );
  }

  const properties: Property[] = data?.data ?? [];

  function renderItem({ item }: { item: Property }) {
    return (
      <Pressable
        style={styles.card}
        onPress={() => router.push({ pathname: '/(owner)/property/[id]', params: { id: item.id } })}
      >
        <View style={styles.cardHeader}>
          <Text style={styles.propertyName}>{item.name}</Text>
          <View style={styles.typeBadge}>
            <Text style={styles.typeText}>{TYPE_LABEL[item.type] ?? item.type}</Text>
          </View>
        </View>
        <Text style={styles.address}>
          {item.street}, {item.number} — {item.city}/{item.state}
        </Text>
        <Text style={styles.meta}>
          {item.assets?.length ?? 0} ativo(s) • {item.floors ?? '—'} andares
        </Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.greeting}>Olá, {userName.split(' ')[0]} 👋</Text>
      {properties.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.empty}>Nenhum imóvel cadastrado.</Text>
        </View>
      ) : (
        <FlatList
          data={properties}
          keyExtractor={(p) => p.id}
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
  propertyName: { fontSize: 16, fontWeight: '700', color: '#1E3A5F', flex: 1, marginRight: 8 },
  typeBadge: { backgroundColor: '#E8F0FB', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  typeText: { fontSize: 11, color: '#1E3A5F', fontWeight: '600' },
  address: { fontSize: 13, color: '#6B7E97', marginBottom: 4 },
  meta: { fontSize: 12, color: '#9BACC0' },
  error: { color: '#C0392B', fontSize: 15 },
  empty: { color: '#9BACC0', fontSize: 15 },
});
