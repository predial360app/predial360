import { Redirect } from 'expo-router';
import { tokenStorage } from '../src/lib/api-client';

export default function Index() {
  const token = tokenStorage.getString('accessToken');
  const role = tokenStorage.getString('userRole');

  if (!token) return <Redirect href="/(auth)/login" />;
  if (role === 'TECHNICIAN') return <Redirect href="/(technician)/" />;
  return <Redirect href="/(owner)/" />;
}
