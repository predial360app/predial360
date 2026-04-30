import { useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { apiClient, saveTokens, tokenStorage } from '../src/lib/api-client';

function decodeJwt(token: string): Record<string, unknown> {
  try {
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(b64 + '=='.slice((b64.length + 3) % 4)));
  } catch { return {}; }
}

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    if (!email.trim() || !password) { Alert.alert('Atenção', 'Preencha e-mail e senha.'); return; }
    setLoading(true);
    try {
      // API returns { accessToken, refreshToken, expiresIn, tokenType } — no wrapper
      const { data } = await apiClient.post<{ accessToken: string; refreshToken: string }>(
        '/auth/login', { email: email.trim().toLowerCase(), password }
      );
      saveTokens(data.accessToken, data.refreshToken);
      const jwt = decodeJwt(data.accessToken);
      tokenStorage.set('userRole', String(jwt['role'] ?? 'OWNER'));
      tokenStorage.set('userEmail', String(jwt['email'] ?? email));
      router.replace('/home');
    } catch {
      Alert.alert('Acesso negado', 'E-mail ou senha incorretos.');
    } finally { setLoading(false); }
  }

  return (
    <KeyboardAvoidingView style={s.bg} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={s.card}>
        <Text style={s.logo}>Predial360</Text>
        <Text style={s.sub}>Gestão inteligente de imóveis</Text>
        <TextInput style={s.input} placeholder="E-mail" placeholderTextColor="#8B9BB4"
          keyboardType="email-address" autoCapitalize="none" value={email} onChangeText={setEmail} />
        <TextInput style={s.input} placeholder="Senha" placeholderTextColor="#8B9BB4"
          secureTextEntry value={password} onChangeText={setPassword} onSubmitEditing={handleLogin} />
        <Pressable style={[s.btn, loading && s.btnOff]} onPress={handleLogin} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnTxt}>Entrar</Text>}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  bg:   { flex:1, backgroundColor:'#1E3A5F', justifyContent:'center', padding:24 },
  card: { backgroundColor:'#fff', borderRadius:16, padding:28, elevation:6 },
  logo: { fontSize:32, fontWeight:'700', color:'#1E3A5F', textAlign:'center', marginBottom:4 },
  sub:  { fontSize:14, color:'#6B7E97', textAlign:'center', marginBottom:32 },
  input:{ borderWidth:1, borderColor:'#D1DCE8', borderRadius:10, padding:14, fontSize:15, color:'#1A1A2E', marginBottom:14 },
  btn:  { backgroundColor:'#1E3A5F', borderRadius:10, padding:16, alignItems:'center', marginTop:4 },
  btnOff:{ opacity:0.6 },
  btnTxt:{ color:'#fff', fontSize:16, fontWeight:'600' },
});
