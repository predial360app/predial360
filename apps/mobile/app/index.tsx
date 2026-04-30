import { Redirect } from 'expo-router';
import { tokenStorage } from '../src/lib/api-client';

export default function Index() {
  const token = tokenStorage.getString('accessToken');
  if (!token) return <Redirect href="/login" />;
  return <Redirect href="/home" />;
}
