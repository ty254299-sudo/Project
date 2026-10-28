import '../global.css';
import { Redirect, Stack, useGlobalSearchParams, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';
import { ActivityIndicator } from 'react-native';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { ThemeProvider, useAppTheme } from '@/components/theme';
import { buildRequestedRoute, isPrivateRoute, safeRequestedRoute } from '@/services/authRoutes';

function RouterStack() {
  const theme = useAppTheme();
  const { session, ready } = useAuth();
  const pathname = usePathname();
  const params = useGlobalSearchParams<Record<string, string | string[]>>();

  if (!ready) {
    return <View accessibilityRole="progressbar" accessibilityLabel="Restoring your sign-in" style={[styles.pending, { backgroundColor: theme.canvas }]}><ActivityIndicator color={theme.green} /></View>;
  }
  if (isPrivateRoute(pathname) && !session) {
    const returnTo = buildRequestedRoute(pathname, params);
    return <Redirect href={{ pathname: '/login', params: { returnTo } }} />;
  }
  if (pathname === '/login' && session) {
    return <Redirect href={safeRequestedRoute(params.returnTo)} />;
  }
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.canvas } }} />;
}

export default function RootLayout() {
  return <ThemeProvider><AuthProvider><ThemedStatusBar /><RouterStack /></AuthProvider></ThemeProvider>;
}

function ThemedStatusBar() { const theme = useAppTheme(); return <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />; }

const styles = StyleSheet.create({ pending: { flex: 1, minHeight: '100%', alignItems: 'center', justifyContent: 'center' } });
