import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { apiClient, saveTokens, tokenStorage } from '../../src/lib/api-client';

function decodeJwt(token: string): Record<string, unknown> {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '=='.slice((base64.length + 3) % 4);
    return JSON.parse(atob(padded));
  } catch {
    return {};
  }
}

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    if (!email || !password) {
      Alert.alert('Atenção', 'Preencha e-mail e senha.');
      return;
    }
    setLoading(true);
    try {
      // API returns { accessToken, refreshToken, expiresIn, tokenType } directly
      const { data } = await apiClient.post<{
        accessToken: string;
        refreshToken: string;
        expiresIn: number;
        tokenType: string;
      }>('/auth/login', { email, password });

      const { accessToken, refreshToken } = data;
      saveTokens(accessToken, refreshToken);

      // Decode JWT to extract role and email (no separate /me endpoint)
      const payload = decodeJwt(accessToken);
      const role = (payload['role'] as string) ?? 'OWNER';
      const userEmail = (payload['email'] as string) ?? email;

      tokenStorage.set('userRole', role);
      tokenStorage.set('userEmail', userEmail);

      if (role === 'TECHNICIAN') {
        router.replace('/(technician)/');
      } else {
        router.replace('/(owner)/');
      }
    } catch {
      Alert.alert('Erro', 'E-mail ou senha incorretos. Verifique os dados e tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.card}>
        <Text style={styles.logo}>Predial360</Text>
        <Text style={styles.subtitle}>Gestão inteligente de imóveis</Text>

        <TextInput
          style={styles.input}
          placeholder="E-mail"
          placeholderTextColor="#8B9BB4"
          keyboardType="email-address"
          autoCapitalize="none"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={styles.input}
          placeholder="Senha"
          placeholderTextColor="#8B9BB4"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        <Pressable
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleLogin}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Entrar</Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1E3A5F', justifyContent: 'center', padding: 24 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 28, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 12, elevation: 6 },
  logo: { fontSize: 32, fontWeight: '700', color: '#1E3A5F', textAlign: 'center', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#6B7E97', textAlign: 'center', marginBottom: 32 },
  input: { borderWidth: 1, borderColor: '#D1DCE8', borderRadius: 10, padding: 14, fontSize: 15, color: '#1E3A5F', marginBottom: 14 },
  button: { backgroundColor: '#1E3A5F', borderRadius: 10, padding: 16, alignItems: 'center', marginTop: 8 },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
