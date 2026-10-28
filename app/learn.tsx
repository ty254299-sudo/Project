import React, { useCallback, useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Shell } from '@/components/Shell';
import { PageHeader } from '@/components/PageHeader';
import { Button, Eyebrow, Notice } from '@/components/ui';
import { useAppTheme } from '@/components/theme';
import { newRequestId, submitLearningRequest } from '@/services/apiClient';
import { readLearnRequestId, writeLearnRequestId } from '@/services/learningDrafts';
import { boundedRouteText, isAllowedLearningGoal, learningGoals } from '@/services/studyInput';

const topics = [
  { title: 'Start with the core idea', body: 'Begin by finding the one idea everything else depends on. Write it in your own words, then connect each new detail back to that starting point.' },
  { title: 'Build a simple example', body: 'Take a familiar situation and walk through the idea one step at a time. Notice what changes, what stays the same, and why the result makes sense.' },
  { title: 'Check your understanding', body: 'Close your notes and explain the concept out loud in two or three sentences. If you get stuck, that is a helpful sign about where to focus next.' },
];

export default function Learn() {
  const theme = useAppTheme(); const s = styles(theme);
  const params = useLocalSearchParams<{ goal?: string | string[]; level?: string | string[] }>();
  const routeGoal = boundedRouteText(params.goal, 80); const goal = isAllowedLearningGoal(routeGoal) ? routeGoal : learningGoals[0];
  const level = boundedRouteText(params.level, 120) || 'my current level';
  const [topic, setTopic] = useState(0); const [saved, setSaved] = useState(false); const [saving, setSaving] = useState(false); const [error, setError] = useState('');
  const [requestId, setRequestId] = useState(() => readLearnRequestId() ?? newRequestId()); const controllerRef = useRef<AbortController | null>(null);

  useFocusEffect(useCallback(() => {
    if (controllerRef.current?.signal.aborted) setSaving(false);
    return () => { controllerRef.current?.abort(); };
  }, []));

  async function saveSession() {
    const controller = new AbortController(); controllerRef.current = controller; setSaving(true); setError(''); writeLearnRequestId(requestId);
    const sourceText = topics.map((item) => item.title + '\n' + item.body).join('\n\n');
    try {
      await submitLearningRequest({ kind: 'question', prompt: 'Explain the main ideas from this study path and relate them to my goal: ' + goal + '. My current level is ' + level + '.', sourceText, requestId }, controller.signal);
      if (!controller.signal.aborted) setSaved(true);
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Your session could not be saved. Retry to continue.');
    } finally { if (!controller.signal.aborted) setSaving(false); }
  }

  function selectTopic(index: number) {
    setTopic(index); setError('');
    if (saved) { const nextRequestId = newRequestId(); setRequestId(nextRequestId); writeLearnRequestId(nextRequestId); }
    setSaved(false);
  }

  const activeTopic = topics[topic];
  return <Shell>
    <PageHeader eyebrow="Learning workspace" title="Work through the idea." subtitle={'Your goal: ' + goal + ' | ' + level} />
    <View style={s.planStrip}><View style={s.planCopy}><Eyebrow>YOUR STUDY PATH</Eyebrow><Text style={s.planTitle}>Small steps, one clear idea at a time.</Text></View><Text style={s.stepLabel}>STEP {String(topic + 1).padStart(2, '0')} OF {String(topics.length).padStart(2, '0')}</Text></View>
    <View style={s.layout}>
      <View accessibilityLabel="Topic navigation" style={s.navigationCard}><Eyebrow>TOPIC NAVIGATION</Eyebrow>{topics.map((item, index) => <Pressable key={item.title} accessibilityRole="tab" accessibilityState={{ selected: topic === index }} onPress={() => selectTopic(index)} style={[s.topicTab, topic === index && s.topicTabActive]}><Text style={[s.topicNumber, topic === index && s.topicNumberActive]}>{String(index + 1).padStart(2, '0')}</Text><Text style={[s.topicTabText, topic === index && s.topicTabTextActive]}>{item.title}</Text></Pressable>)}</View>
      <View style={s.mainColumn}>
        <View style={s.lessonCard}><Eyebrow>LESSON CONTENT</Eyebrow><Text accessibilityRole="header" style={s.lessonTitle}>{activeTopic.title}</Text><Text style={s.lessonBody}>{activeTopic.body}</Text><View style={s.refBox}><Text style={s.refLabel}>SOURCE REFERENCES</Text><Text style={s.refText}>No course note is attached to this guided study path.</Text></View></View>
        <View style={s.notesCard}><Eyebrow>NOTES</Eyebrow><Text style={s.notesTitle}>Capture the takeaway</Text><Text style={s.notesBody}>Try saying the main idea in one sentence before you move to the next step. To work from course notes, open AI assistance and add an authorized note excerpt.</Text><Button secondary title="Ask about course notes" onPress={() => router.push('/assistant')} /></View>
        <View style={s.actionCard}><Notice kind={error ? 'error' : saved ? 'success' : 'info'}>{error || (saved ? 'Session saved. You can find it in progress when you return.' : 'Save this study path to keep it with your learning progress.')}</Notice><Button title={saving ? 'Saving session...' : saved ? 'Session saved' : 'Save this session'} onPress={saveSession} disabled={saving || saved} />{saved ? <Button secondary title="View progress" onPress={() => router.push('/progress')} /> : null}</View>
      </View>
    </View>
  </Shell>;
}

const styles = (theme: ReturnType<typeof useAppTheme>) => StyleSheet.create({
  planStrip: { backgroundColor: theme.softGreen, borderRadius: 18, padding: 20, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, planCopy: { gap: 6 }, planTitle: { color: theme.ink, fontSize: 17, fontWeight: '800' }, stepLabel: { color: theme.green, fontSize: 12, fontWeight: '800', letterSpacing: .5 },
  layout: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: 16 }, navigationCard: { flexGrow: .7, flexBasis: 220, padding: 18, backgroundColor: theme.paper, borderWidth: 1, borderColor: theme.line, borderRadius: 18, gap: 10 },
  topicTab: { minHeight: 48, borderRadius: 12, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 10 }, topicTabActive: { backgroundColor: theme.softGreen }, topicNumber: { width: 26, fontSize: 11, fontWeight: '800', color: theme.muted }, topicNumberActive: { color: theme.green }, topicTabText: { flex: 1, fontSize: 13, lineHeight: 19, color: theme.muted, fontWeight: '600' }, topicTabTextActive: { color: theme.ink },
  mainColumn: { flex: 1, flexBasis: 440, gap: 16 }, lessonCard: { padding: 24, backgroundColor: theme.paper, borderWidth: 1, borderColor: theme.line, borderRadius: 20, gap: 15 }, lessonTitle: { color: theme.ink, fontSize: 24, lineHeight: 31, fontWeight: '800' }, lessonBody: { color: theme.muted, fontSize: 16, lineHeight: 26 },
  refBox: { marginTop: 4, borderLeftWidth: 3, borderLeftColor: theme.green, backgroundColor: theme.softGreen, padding: 14, gap: 6, borderRadius: 4 }, refLabel: { color: theme.green, fontSize: 10, fontWeight: '800', letterSpacing: .8 }, refText: { color: theme.ink, fontSize: 13, lineHeight: 19 },
  notesCard: { padding: 20, backgroundColor: theme.mode === 'dark' ? '#252b36' : '#f0eef9', borderRadius: 18, gap: 10 }, notesTitle: { color: theme.ink, fontSize: 17, fontWeight: '800' }, notesBody: { color: theme.muted, fontSize: 14, lineHeight: 21 }, actionCard: { gap: 12 },
});
