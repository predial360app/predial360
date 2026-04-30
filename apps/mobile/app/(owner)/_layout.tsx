import { Stack, useRouter } from 'expo-router';
import { Pressable, Text } from 'react-native';
import { clearTokens, tokenStorage } from '../../src/lib/api-client';

export default function OwnerLayout() {
  const router = useRouter();
  function logout() {
    clearTokens();
    tokenStorage.delete('userRole');
    tokenStorage.delete('userEmail');
    router.replace('/login');
  }
  return (
    <Stack screenOptions={{
      headerStyle:{ backgroundColor:'#1E3A5F' },
      headerTintColor:'#fff',
      headerTitleStyle:{ fontWeight:'700' },
      headerRight: () => (
        <Pressable onPress={logout} style={{ marginRight:12 }}>
          <Text style={{ color:'#fff', fontSize:14 }}>Sair</Text>
        </Pressable>
      ),
    }} />
  );
}
