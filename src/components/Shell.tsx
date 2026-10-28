import React from 'react';
import { Link, router, usePathname } from 'expo-router';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useAppTheme } from './theme';
import { useAuth } from '@/context/AuthContext';
import { clearLearningDrafts } from '@/services/learningDrafts';

const nav = [['/dashboard', 'Home', '⌂'], ['/learn', 'Learn', '◫'], ['/practice', 'Practice', '✳'], ['/progress', 'Progress', '↗'], ['/assistant', 'Ask AI', '✦']] as const;

export function Shell({ children }: React.PropsWithChildren) {
  const path = usePathname(); const { width } = useWindowDimensions(); const compact = width < 760;
  const { session, signOut } = useAuth(); const theme = useAppTheme(); const s = styles(theme);

  async function handleSignOut() {
    router.replace('/');
    try { await signOut(); clearLearningDrafts(); }
    catch {
      const message = 'We could not sign you out. Your session is still active.';
      if (Platform.OS === 'web') globalThis.alert?.(message);
      else Alert.alert('Sign out failed', message);
    }
  }

  return <View style={s.root}>
    <View accessibilityLabel="Primary navigation" style={[s.sidebar, compact && s.mobileNav]}>
      {!compact && <View style={s.brand}><View style={s.brandMark}><Text style={s.brandGlyph}>✿</Text></View><Text style={s.brandName}>study sprout</Text></View>}
      <View style={[s.links, compact && s.mobileLinks]}>{nav.map(([href, label, icon]) => <Link key={href} href={href} asChild><Pressable accessibilityLabel={label} accessibilityRole="link" accessibilityState={{ selected: path === href }} style={[s.navLink, path === href && s.navActive, compact && s.mobileLink]}><Text style={[s.navIcon, path === href && { color: theme.green }]}>{icon}</Text>{(!compact || path === href) && <Text style={[s.navText, path === href && { color: theme.green, fontWeight: '700' }]}>{label}</Text>}</Pressable></Link>)}</View>
      {!compact && <View style={s.sidebarBottom}><View style={s.avatar}><Text style={s.avatarText}>S</Text></View><View style={s.profile}><Text numberOfLines={1} style={s.profileName}>{session?.user.email?.split('@')[0] || 'Student account'}</Text><Text style={s.profileRole}>Your learning space</Text></View><Pressable accessibilityRole="button" onPress={handleSignOut} style={s.signOut}><Text style={s.signOutText}>Sign out</Text></Pressable></View>}
    </View>
    <ScrollView contentContainerStyle={[s.content, compact && s.mobileContent]} keyboardShouldPersistTaps="handled">
      {compact && session ? <Pressable accessibilityRole="button" onPress={handleSignOut} style={s.mobileSignOut}><Text style={s.signOutText}>Sign out</Text></Pressable> : null}
      <View style={s.page}>{children}</View>
    </ScrollView>
  </View>;
}

const styles = (theme: ReturnType<typeof useAppTheme>) => StyleSheet.create({
  root: { flex: 1, minHeight: '100%', flexDirection: 'row', backgroundColor: theme.canvas },
  sidebar: { width: 232, backgroundColor: theme.paper, borderRightWidth: 1, borderRightColor: theme.line, paddingHorizontal: 16, paddingTop: 28, paddingBottom: 16 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 8, marginBottom: 38 },
  brandMark: { width: 34, height: 34, borderRadius: 12, backgroundColor: theme.green, justifyContent: 'center', alignItems: 'center' },
  brandGlyph: { color: theme.mode === 'dark' ? '#102119' : '#fff', fontSize: 19 }, brandName: { color: theme.ink, fontSize: 17, fontWeight: '800', letterSpacing: -.5 },
  links: { gap: 6 }, navLink: { minHeight: 46, borderRadius: 12, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  navActive: { backgroundColor: theme.softGreen }, navIcon: { width: 22, fontSize: 20, textAlign: 'center', color: theme.muted }, navText: { fontSize: 14, color: theme.muted, fontWeight: '600' },
  sidebarBottom: { marginTop: 'auto', borderTopWidth: 1, borderTopColor: theme.line, paddingTop: 16, flexDirection: 'row', gap: 10, alignItems: 'center' },
  avatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: theme.softGreen, justifyContent: 'center', alignItems: 'center' }, avatarText: { color: theme.green, fontWeight: '800' },
  profile: { flex: 1 }, profileName: { color: theme.ink, fontWeight: '700', fontSize: 13 }, profileRole: { color: theme.muted, fontSize: 11, marginTop: 3 },
  signOut: { minHeight: 42, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' }, signOutText: { color: theme.green, fontWeight: '700', fontSize: 13 },
  content: { flexGrow: 1, paddingHorizontal: 34, paddingVertical: 34, alignItems: 'center' }, page: { width: '100%', maxWidth: 1040, gap: 22, paddingBottom: 30 },
  mobileNav: { position: 'absolute', bottom: 0, zIndex: 3, width: '100%', padding: 6, borderTopWidth: 1, borderTopColor: theme.line, flexDirection: 'row', justifyContent: 'center', backgroundColor: theme.paper },
  mobileLinks: { flexDirection: 'row', justifyContent: 'space-around', width: '100%' }, mobileLink: { flex: 1, minHeight: 52, justifyContent: 'center', paddingHorizontal: 4 },
  mobileContent: { paddingHorizontal: 18, paddingTop: 24, paddingBottom: 100 }, mobileSignOut: { alignSelf: 'flex-end', minHeight: 40, justifyContent: 'center', paddingHorizontal: 8, marginBottom: 8 },
});
