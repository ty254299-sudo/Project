import React, { useState } from 'react';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Shell } from '@/components/Shell';
import { PageHeader } from '@/components/PageHeader';
import { Button, Eyebrow, Field, Notice } from '@/components/ui';
import { useAppTheme } from '@/components/theme';
import { isAllowedLearningGoal, isValidCurrentLevel, learningGoals, MAX_CURRENT_LEVEL_LENGTH } from '@/services/studyInput';

export default function Dashboard() {
  const theme = useAppTheme(); const s = styles(theme);
  const [goal, setGoal] = useState<(typeof learningGoals)[number]>(learningGoals[0]);
  const [level, setLevel] = useState(''); const [error, setError] = useState('');

  function continueSession() {
    if (!isAllowedLearningGoal(goal)) { setError('Choose a learning goal to continue.'); return; }
    if (!isValidCurrentLevel(level)) { setError('Add a current level using 1 to 120 characters.'); return; }
    setError(''); router.push({ pathname: '/learn', params: { goal, level: level.trim() } });
  }

  return <Shell>
    <PageHeader eyebrow="Your learning space" title="A little progress adds up." subtitle="Choose one small step for today. Your saved work stays ready when you return." />
    <View style={s.hero}>
      <View style={s.heroCopy}><Eyebrow>CONTINUE LEARNING</Eyebrow><Text style={s.heroTitle}>Make a difficult task easier.</Text><Text style={s.heroSub}>Pick a goal, then move into a short study path built around it.</Text>
        <Button title="Continue session" onPress={continueSession} />
      </View>
      <View style={s.heroAside}><Text style={s.heroAsideMark}>✿</Text><Text style={s.heroAsideTitle}>One step at a time</Text><Text style={s.heroAsideCopy}>A focused session is enough to get started.</Text></View>
    </View>
    <View style={s.grid}>
      <View style={s.card}>
        <View style={s.cardHeading}><Eyebrow>TODAY'S PLAN</Eyebrow><Text style={s.sectionTitle}>Choose a goal</Text><Text style={s.body}>What would feel useful to work on today?</Text></View>
        <View accessibilityRole="radiogroup" accessibilityLabel="Learning goal" style={s.choices}>{learningGoals.map((item, index) => <Pressable key={item} accessibilityRole="radio" accessibilityState={{ checked: goal === item }} onPress={() => { setGoal(item); setError(''); }} style={[s.choice, goal === item && s.choiceActive]}><Text style={s.choiceIcon}>{['01', '02', '03'][index]}</Text><Text style={[s.choiceText, goal === item && s.choiceTextActive]}>{item}</Text></Pressable>)}</View>
        <Field label="Current level" value={level} onChangeText={(value) => { setLevel(value); if (error) setError(''); }} maxLength={MAX_CURRENT_LEVEL_LENGTH} placeholder="e.g. New to the topic, revising for an exam" error={error} />
        <Button secondary title="Set my study plan" onPress={continueSession} />
      </View>
      <View style={s.sideColumn}>
        <View style={[s.card, s.practiceCard]}><Eyebrow>PRACTICE QUEUE</Eyebrow><Text style={s.sectionTitle}>Try a quick check</Text><Text style={s.body}>Practice in your own words and get feedback you can use.</Text><Button secondary title="Start practice" onPress={() => router.push('/practice')} /></View>
        <View style={s.card}><Eyebrow>PROGRESS SUMMARY</Eyebrow><Text style={s.sectionTitle}>Your learning, in one place</Text><Text style={s.body}>Saved questions, practice answers, and progress will show here after your first session.</Text><Button secondary title="View progress" onPress={() => router.push('/progress')} /></View>
      </View>
    </View>
    {error ? <Notice kind="error">{error}</Notice> : null}
  </Shell>;
}

const styles = (theme: ReturnType<typeof useAppTheme>) => StyleSheet.create({
  hero: { backgroundColor: theme.softGreen, borderRadius: 24, padding: 28, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 24, minHeight: 230 },
  heroCopy: { flex: 1, flexBasis: 300, gap: 14 }, heroTitle: { fontSize: 30, lineHeight: 36, fontWeight: '800', color: theme.ink, letterSpacing: -.8, maxWidth: 500 },
  heroSub: { fontSize: 15, lineHeight: 23, color: theme.muted, maxWidth: 500, marginBottom: 4 }, heroAside: { flexBasis: 200, flexGrow: .5, minHeight: 160, borderRadius: 20, backgroundColor: theme.paper, alignItems: 'center', justifyContent: 'center', padding: 20, gap: 8 },
  heroAsideMark: { fontSize: 42, color: theme.green }, heroAsideTitle: { fontWeight: '800', color: theme.ink }, heroAsideCopy: { color: theme.muted, fontSize: 13, textAlign: 'center', lineHeight: 19 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: 16 }, card: { flexGrow: 1, flexBasis: 340, padding: 22, backgroundColor: theme.paper, borderWidth: 1, borderColor: theme.line, borderRadius: 20, gap: 17 },
  cardHeading: { gap: 6 }, sectionTitle: { fontSize: 19, fontWeight: '800', color: theme.ink }, body: { color: theme.muted, fontSize: 14, lineHeight: 21 }, choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  choice: { flexGrow: 1, flexBasis: 155, borderWidth: 1, borderColor: theme.line, backgroundColor: theme.paper, borderRadius: 13, paddingHorizontal: 12, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 9, minHeight: 48 },
  choiceActive: { backgroundColor: theme.softGreen, borderColor: theme.green }, choiceIcon: { fontSize: 11, fontWeight: '800', color: theme.green }, choiceText: { flex: 1, color: theme.muted, fontSize: 13, fontWeight: '600' }, choiceTextActive: { color: theme.ink },
  sideColumn: { flex: 1, flexBasis: 280, gap: 16 }, practiceCard: { backgroundColor: theme.mode === 'dark' ? '#252b36' : '#f0eef9' },
});
