import { Redirect } from 'expo-router';
import { tokenStorage } from '../src/lib/api-client';

export default function Index() {
  const token = tokenStorage.getString('accessToken');
  return token ? <Redirect href="/home" /> : <Redirect href="/login" />;
}
