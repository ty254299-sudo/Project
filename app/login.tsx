import { useState } from 'react';
import { Link, router, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Field, Notice } from '@/components/ui';
import { useAppTheme } from '@/components/theme';
import { useAuth } from '@/context/AuthContext';
import { authErrorMessage } from '@/services/auth';
import { safeRequestedRoute } from '@/services/authRoutes';

export default function Login() {
  const theme = useAppTheme(); const s = styles(theme);
  const { signIn, configured, restoreError } = useAuth();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string | string[] }>();
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');

  async function submit() {
    if (!email.trim() || !/^\S+@\S+\.\S+$/.test(email.trim())) { setError('Enter a valid email address.'); return; }
    if (!password) { setError('Enter your password.'); return; }
    setBusy(true); setError('');
    try { await signIn(email.trim(), password); router.replace(safeRequestedRoute(returnTo)); }
    catch (cause) { setError(authErrorMessage(cause)); }
    finally { setBusy(false); }
  }

  return <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled"><View style={s.card}>
    <View style={s.brandMark}><Text style={s.mark}>✿</Text></View><Text style={s.brand}>study sprout</Text>
    <Text accessibilityRole="header" style={s.title}>Welcome back.</Text><Text style={s.sub}>Sign in to return to your learning space.</Text>
    {restoreError ? <Notice kind="error">{restoreError}</Notice> : null}
    {!configured ? <Notice kind="error">Supabase is not connected yet. Add the project URL and public anon key to your local environment.</Notice> : null}
    <Field label="Email address" value={email} onChangeText={(value) => { setEmail(value); if (error) setError(''); }} placeholder="you@college.edu" keyboardType="email-address" autoCapitalize="none" />
    <Field label="Password" value={password} onChangeText={(value) => { setPassword(value); if (error) setError(''); }} placeholder="Your password" secureTextEntry autoCapitalize="none" />
    {error ? <Notice kind="error">{error}</Notice> : null}
    <Button title={busy ? 'Signing in...' : 'Sign in'} onPress={submit} disabled={busy || !configured} />
    <Text style={s.foot}>Use the email and password for your college account.</Text><Link href="/" style={s.link}>Back to introduction</Link>
  </View></ScrollView>;
}

const styles = (theme: ReturnType<typeof useAppTheme>) => StyleSheet.create({
  page: { flexGrow: 1, minHeight: '100%', backgroundColor: theme.canvas, justifyContent: 'center', alignItems: 'center', padding: 20 },
  card: { width: '100%', maxWidth: 480, backgroundColor: theme.paper, padding: 30, borderRadius: 24, borderWidth: 1, borderColor: theme.line, gap: 17, alignItems: 'stretch' },
  brandMark: { alignSelf: 'center', width: 48, height: 48, borderRadius: 16, backgroundColor: theme.green, justifyContent: 'center', alignItems: 'center' }, mark: { color: theme.mode === 'dark' ? '#102119' : '#fff', fontSize: 22 },
  brand: { textAlign: 'center', color: theme.green, fontWeight: '800', fontSize: 17 }, title: { textAlign: 'center', color: theme.ink, fontSize: 28, fontWeight: '800', marginTop: 8 }, sub: { textAlign: 'center', color: theme.muted, lineHeight: 21, marginBottom: 6 },
  foot: { textAlign: 'center', color: theme.muted, fontSize: 12, lineHeight: 18 }, link: { textAlign: 'center', color: theme.green, fontWeight: '700', padding: 8 },
});
