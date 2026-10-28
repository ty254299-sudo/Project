import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Button, Eyebrow } from '@/components/ui';
import { useAppTheme } from '@/components/theme';
import { useAuth } from '@/context/AuthContext';

const features = [
  ['01', 'Ask about your course notes', 'Get a clear explanation grounded in the material you are studying.'],
  ['02', 'Practice in your own words', 'Try a short answer and learn from supportive feedback.'],
  ['03', 'Keep track of your progress', 'Return to your saved learning when you are ready.'],
];

export default function Introduction() {
  const theme = useAppTheme(); const s = styles(theme); const { session } = useAuth();
  return <View style={s.page}>
    <View style={s.nav}><Text style={s.brand}>study sprout</Text><Button secondary title={session ? 'Open workspace' : 'Sign in'} onPress={() => router.push(session ? '/dashboard' : '/login')} /></View>
    <View style={s.hero}><View style={s.copy}><Eyebrow>YOUR STUDY SPACE</Eyebrow><Text accessibilityRole="header" style={s.title}>Make a difficult task easier.</Text><Text style={s.subtitle}>Turn course notes into clear answers, useful practice, and steady progress.</Text><Button title={session ? 'Continue learning' : 'Sign in to get started'} onPress={() => router.push(session ? '/dashboard' : '/login')} /></View><View accessibilityLabel="A simple illustration of a growing plant" style={s.illustration}><Text style={s.plant}>✿</Text><Text style={s.illustrationCaption}>One step at a time</Text></View></View>
    <View style={s.featureList}>{features.map(([number, title, description]) => <View style={s.feature} key={number}><Text style={s.number}>{number}</Text><View style={s.featureCopy}><Text style={s.featureTitle}>{title}</Text><Text style={s.featureText}>{description}</Text></View></View>)}</View>
    <Text style={s.footer}>A calmer way to keep moving through your studies.</Text>
  </View>;
}

const styles = (theme: ReturnType<typeof useAppTheme>) => StyleSheet.create({
  page: { flex: 1, minHeight: '100%', backgroundColor: theme.canvas, paddingHorizontal: '7%', paddingVertical: 24, gap: 36 },
  nav: { width: '100%', maxWidth: 1120, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, brand: { color: theme.ink, fontSize: 19, fontWeight: '800' },
  hero: { width: '100%', maxWidth: 1120, alignSelf: 'center', backgroundColor: theme.softGreen, borderRadius: 26, padding: 34, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 30 },
  copy: { flex: 1, flexBasis: 320, maxWidth: 560, gap: 17 }, title: { color: theme.ink, fontSize: 42, lineHeight: 50, fontWeight: '800', letterSpacing: -1.1 }, subtitle: { color: theme.muted, fontSize: 17, lineHeight: 26, maxWidth: 490 },
  illustration: { flexGrow: 1, flexBasis: 220, maxWidth: 340, minHeight: 230, borderRadius: 22, backgroundColor: theme.paper, alignItems: 'center', justifyContent: 'center', gap: 12 }, plant: { color: theme.green, fontSize: 90 }, illustrationCaption: { color: theme.green, fontWeight: '700' },
  featureList: { width: '100%', maxWidth: 1120, alignSelf: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 16 }, feature: { flexGrow: 1, flexBasis: 245, flexDirection: 'row', alignItems: 'flex-start', gap: 14, padding: 20, borderRadius: 18, borderWidth: 1, borderColor: theme.line, backgroundColor: theme.paper },
  number: { color: theme.green, fontSize: 12, fontWeight: '800', paddingTop: 2 }, featureCopy: { flex: 1, gap: 7 }, featureTitle: { color: theme.ink, fontSize: 15, fontWeight: '700' }, featureText: { color: theme.muted, fontSize: 13, lineHeight: 20 }, footer: { alignSelf: 'center', color: theme.muted, fontSize: 13, textAlign: 'center' },
});
