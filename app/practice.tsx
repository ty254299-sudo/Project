import React, { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { StyleSheet, Text, View } from 'react-native';
import { Shell } from '@/components/Shell';
import { PageHeader } from '@/components/PageHeader';
import { Button, Eyebrow, Field, Notice } from '@/components/ui';
import { useAppTheme } from '@/components/theme';
import { isSupabaseConfigured } from '@/services/supabase';
import { newRequestId, submitLearningRequest } from '@/services/apiClient';
import { readPracticeDraft, writePracticeDraft } from '@/services/learningDrafts';

const question = 'In your own words, what is the main idea you are studying?';

export default function Practice() {
  const theme = useAppTheme(); const s = styles(theme);
  const [answer, setAnswer] = useState(() => readPracticeDraft().answer);
  const [error, setError] = useState(''); const [result, setResult] = useState(''); const [busy, setBusy] = useState(false);
  const [requestId, setRequestId] = useState(() => readPracticeDraft().requestId ?? newRequestId());
  const controllerRef = useRef<AbortController | null>(null);

  useFocusEffect(useCallback(() => () => { controllerRef.current?.abort(); setBusy(false); }, []));
  function changeAnswer(value: string) { setAnswer(value); writePracticeDraft({ answer: value, requestId }); }
  async function submit() {
    if (!answer.trim()) { setError('Write a short answer before submitting.'); return; }
    writePracticeDraft({ answer, requestId });
    const controller = new AbortController(); controllerRef.current = controller; setError(''); setBusy(true);
    try {
      const response = await submitLearningRequest({ kind: 'quiz', prompt: question, sourceText: answer.trim(), requestId }, controller.signal);
      if (!controller.signal.aborted) { setResult(response.response); const nextRequestId = newRequestId(); setRequestId(nextRequestId); writePracticeDraft({ answer, requestId: nextRequestId }); }
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Your answer could not be submitted. Try again.');
    } finally { if (!controller.signal.aborted) setBusy(false); }
  }

  function tryAgain() { setAnswer(''); setResult(''); setError(''); const nextRequestId = newRequestId(); setRequestId(nextRequestId); writePracticeDraft({ answer: '', requestId: nextRequestId }); }

  return <Shell>
    <PageHeader eyebrow="Practice and feedback" title="Try it in your own words." subtitle="A short answer helps you see what is clear and what to revisit." />
    <View style={s.promptBand}><Eyebrow>QUESTION 01 | NO TIME LIMIT</Eyebrow><Text accessibilityRole="header" style={s.question}>{question}</Text><Text style={s.hint}>There is no single perfect phrasing. Share what you remember.</Text></View>
    <View style={s.layout}>
      <View style={s.answerCard}><Eyebrow>YOUR ANSWER</Eyebrow><Field label="Your answer" value={answer} onChangeText={(value) => { changeAnswer(value); if (error) setError(''); }} multiline placeholder="Write what you remember..." error={error && !answer.trim() ? error : undefined}/><Button title={busy ? 'Checking your answer...' : error ? 'Retry feedback' : 'Submit answer'} onPress={submit} disabled={busy}/>{error ? <Notice kind="error">{error}</Notice> : null}{!isSupabaseConfigured && !result ? <Notice>Connect Supabase to save answers and get feedback. Your draft stays here while you set that up.</Notice> : null}</View>
      <View style={s.feedbackCard}><Eyebrow>FEEDBACK EXPLANATION</Eyebrow>{result ? <><Text style={s.feedbackTitle}>A useful next step</Text><Notice kind="success">{result}</Notice><Button secondary title="Try another answer" onPress={tryAgain}/></> : <><Text style={s.feedbackTitle}>Your feedback will appear here</Text><Text style={s.body}>Submit an answer to receive supportive, advisory feedback. It is for practice, not an official grade.</Text></>}</View>
    </View>
  </Shell>;
}

const styles = (theme: ReturnType<typeof useAppTheme>) => StyleSheet.create({
  promptBand: { padding: 24, borderRadius: 20, backgroundColor: theme.softGreen, gap: 12 }, question: { fontSize: 23, lineHeight: 31, fontWeight: '800', color: theme.ink, maxWidth: 700 }, hint: { color: theme.muted, fontSize: 14, lineHeight: 21 },
  layout: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: 16 }, answerCard: { flex: 1, flexBasis: 380, padding: 22, backgroundColor: theme.paper, borderWidth: 1, borderColor: theme.line, borderRadius: 20, gap: 16 },
  feedbackCard: { flex: .8, flexBasis: 300, padding: 22, backgroundColor: theme.mode === 'dark' ? '#252b36' : '#f0eef9', borderRadius: 20, gap: 14 }, feedbackTitle: { fontSize: 18, lineHeight: 25, fontWeight: '800', color: theme.ink }, body: { color: theme.muted, fontSize: 14, lineHeight: 22 },
});
