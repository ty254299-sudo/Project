import React, { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Shell } from '@/components/Shell';
import { PageHeader } from '@/components/PageHeader';
import { Button, Eyebrow, Field, Loading, Notice } from '@/components/ui';
import { useAppTheme } from '@/components/theme';
import { isSupabaseConfigured } from '@/services/supabase';
import { listStudyContent, newRequestId, StudyContent, submitLearningRequest } from '@/services/apiClient';
import { readAssistantDraft, writeAssistantDraft } from '@/services/learningDrafts';

type ContextMode = 'excerpt' | 'course';

export default function Assistant() {
  const theme = useAppTheme(); const s = styles(theme); const [initialDraft] = useState(readAssistantDraft);
  const [note, setNote] = useState(initialDraft.note); const [question, setQuestion] = useState(initialDraft.question);
  const [contextMode, setContextMode] = useState<ContextMode>('excerpt'); const [courseNotes, setCourseNotes] = useState<StudyContent[]>([]); const [selectedContentId, setSelectedContentId] = useState('');
  const [notesLoading, setNotesLoading] = useState(false); const [notesError, setNotesError] = useState('');
  const [notesRefresh, setNotesRefresh] = useState(0);
  const [error, setError] = useState(''); const [answer, setAnswer] = useState(''); const [citations, setCitations] = useState<Array<{ contentId: string; title: string }>>([]); const [busy, setBusy] = useState(false);
  const [requestId, setRequestId] = useState(initialDraft.requestId ?? newRequestId()); const controllerRef = useRef<AbortController | null>(null);

  useFocusEffect(useCallback(() => {
    if (!isSupabaseConfigured) return;
    const controller = new AbortController(); setNotesLoading(true); setNotesError('');
    listStudyContent(controller.signal).then((result) => { if (!controller.signal.aborted) { setCourseNotes(result.data); setSelectedContentId((current) => current || result.data[0]?.id || ''); } })
      .catch((cause) => { if (!controller.signal.aborted) setNotesError(cause instanceof Error ? cause.message : 'Assigned course notes could not be loaded.'); })
      .finally(() => { if (!controller.signal.aborted) setNotesLoading(false); });
    return () => { controller.abort(); controllerRef.current?.abort(); setBusy(false); };
  }, [notesRefresh]));

  function resetRequestId() { const nextRequestId = newRequestId(); setRequestId(nextRequestId); return nextRequestId; }
  function changeNote(value: string) { setNote(value); setAnswer(''); writeAssistantDraft({ note: value, question, requestId: resetRequestId() }); }
  function changeQuestion(value: string) { setQuestion(value); setAnswer(''); writeAssistantDraft({ note, question: value, requestId: resetRequestId() }); }
  async function ask() {
    if (contextMode === 'excerpt' && !note.trim()) { setError('Add a few lines from your course notes first.'); return; }
    if (contextMode === 'course' && !selectedContentId) { setError('Choose an assigned course note first.'); return; }
    if (!question.trim()) { setError('Write a question about your notes.'); return; }
    writeAssistantDraft({ note, question, requestId });
    const controller = new AbortController(); controllerRef.current = controller; setError(''); setAnswer(''); setCitations([]); setBusy(true);
    try {
      const response = await submitLearningRequest({ kind: 'question', prompt: question.trim(), sourceText: contextMode === 'excerpt' ? note.trim() : '', contentId: contextMode === 'course' ? selectedContentId : undefined, requestId }, controller.signal);
      if (!controller.signal.aborted) {
        setAnswer(response.response); setCitations(response.citations ?? []);
        const nextRequestId = newRequestId(); setRequestId(nextRequestId); writeAssistantDraft({ note, question, requestId: nextRequestId });
      }
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'We could not answer that yet. Your question is still here; retry.');
    } finally { if (!controller.signal.aborted) setBusy(false); }
  }

  return <Shell>
    <PageHeader eyebrow="AI assistance" title="Ask about your course notes." subtitle="Choose authorized context, ask one clear question, and review the explanation and its limits." />
    <View style={s.layout}>
      <View style={s.formCard}>
        <Eyebrow>CONTEXT SELECTOR</Eyebrow>
        <View accessibilityRole="radiogroup" accessibilityLabel="Note source" style={s.modePicker}>
          <Pressable accessibilityRole="radio" accessibilityState={{ checked: contextMode === 'excerpt' }} onPress={() => { if (contextMode !== 'excerpt') resetRequestId(); setContextMode('excerpt'); setError(''); }} style={[s.modeOption, contextMode === 'excerpt' && s.modeActive]}><Text style={[s.modeTitle, contextMode === 'excerpt' && s.modeTitleActive]}>Paste a note excerpt</Text><Text style={s.modeHint}>Use notes you choose to share.</Text></Pressable>
          <Pressable accessibilityRole="radio" accessibilityState={{ checked: contextMode === 'course' }} onPress={() => { if (contextMode !== 'course') resetRequestId(); setContextMode('course'); setError(''); }} style={[s.modeOption, contextMode === 'course' && s.modeActive]}><Text style={[s.modeTitle, contextMode === 'course' && s.modeTitleActive]}>Assigned course notes</Text><Text style={s.modeHint}>Use notes shared with your course.</Text></Pressable>
        </View>
        {contextMode === 'excerpt' ? <Field label="Course notes" value={note} onChangeText={changeNote} multiline placeholder="Paste a short excerpt from your notes..." maxLength={12000} /> : <View style={s.sourcePicker}>
          {notesLoading ? <Loading label="Loading assigned course notes..." /> : notesError ? <><Notice kind="error">{notesError}</Notice><Button secondary title="Retry loading notes" onPress={() => { setNotesError(''); setNotesRefresh((value) => value + 1); }} /></> : courseNotes.length ? courseNotes.map((item) => <Pressable key={item.id} accessibilityRole="radio" accessibilityState={{ checked: selectedContentId === item.id }} onPress={() => { if (selectedContentId !== item.id) resetRequestId(); setSelectedContentId(item.id); setAnswer(''); }} style={[s.sourceRow, selectedContentId === item.id && s.sourceRowActive]}><View style={s.radioDot}>{selectedContentId === item.id ? <View style={s.radioInner} /> : null}</View><View style={s.sourceCopy}><Text style={s.sourceTitle}>{item.title}</Text><Text style={s.sourceSub}>{item.subject}</Text></View></Pressable>) : <Notice>No assigned course notes are available yet. Paste an excerpt or ask a teacher to share course material.</Notice>}
        </View>}
        <Field label="Your question" value={question} onChangeText={changeQuestion} placeholder="What would you like to understand?" maxLength={2000} error={error && !question.trim() ? error : undefined} />
        {error ? <Notice kind="error">{error}</Notice> : null}
        <Button title={busy ? 'Preparing an explanation...' : error ? 'Retry question' : 'Ask assistant'} onPress={ask} disabled={busy || (contextMode === 'course' && notesLoading)} />
      </View>
      <View style={s.responseCard}>
        <Eyebrow>VALIDATED RESPONSE</Eyebrow>
        {busy ? <Loading label="Checking your notes and preparing an explanation..." /> : answer ? <><Text style={s.responseTitle}>A helpful explanation</Text><Text style={s.responseBody}>{answer}</Text><View style={s.evidenceBox}><Text style={s.evidenceLabel}>EVIDENCE AND LIMITATIONS</Text>{citations.length ? citations.map((item) => <Text key={item.contentId} style={s.evidenceText}>Source: {item.title}</Text>) : <Text style={s.evidenceText}>{contextMode === 'course' ? 'No source citation was returned for this answer. Check it against the selected course note.' : 'This answer uses the note excerpt you provided. Check it against your full course material.'}</Text>}<Text style={s.evidenceText}>AI explanations can be incomplete and are not official course guidance.</Text></View></> : <><Text style={s.responseTitle}>Your answer will appear here</Text><Text style={s.responseBody}>The assistant will use only the context you selected and return a checked explanation. It will not change your course or permissions.</Text></>}
      </View>
    </View>
    {!isSupabaseConfigured ? <Notice>Supabase is not connected yet. Your notes and question stay on this device until you connect the service.</Notice> : null}
  </Shell>;
}

const styles = (theme: ReturnType<typeof useAppTheme>) => StyleSheet.create({
  layout: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: 16 }, formCard: { flex: 1, flexBasis: 420, padding: 22, backgroundColor: theme.paper, borderWidth: 1, borderColor: theme.line, borderRadius: 20, gap: 16 }, responseCard: { flex: .85, flexBasis: 320, padding: 22, backgroundColor: theme.mode === 'dark' ? '#252b36' : '#f0eef9', borderRadius: 20, gap: 14, minHeight: 250 },
  modePicker: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 }, modeOption: { flex: 1, flexBasis: 170, minHeight: 72, borderRadius: 13, padding: 12, borderWidth: 1, borderColor: theme.line, gap: 4 }, modeActive: { borderColor: theme.green, backgroundColor: theme.softGreen }, modeTitle: { color: theme.ink, fontSize: 13, fontWeight: '700' }, modeTitleActive: { color: theme.green }, modeHint: { color: theme.muted, fontSize: 12, lineHeight: 17 },
  sourcePicker: { gap: 8 }, sourceRow: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 12, borderWidth: 1, borderColor: theme.line, borderRadius: 12 }, sourceRowActive: { borderColor: theme.green, backgroundColor: theme.softGreen }, sourceCopy: { flex: 1, gap: 3 }, sourceTitle: { color: theme.ink, fontSize: 14, fontWeight: '700' }, sourceSub: { color: theme.muted, fontSize: 12 }, radioDot: { width: 18, height: 18, borderWidth: 1.5, borderColor: theme.green, borderRadius: 9, alignItems: 'center', justifyContent: 'center' }, radioInner: { width: 9, height: 9, borderRadius: 5, backgroundColor: theme.green },
  responseTitle: { color: theme.ink, fontSize: 18, fontWeight: '800' }, responseBody: { color: theme.ink, fontSize: 15, lineHeight: 23 }, evidenceBox: { borderTopWidth: 1, borderTopColor: theme.line, paddingTop: 12, gap: 7 }, evidenceLabel: { color: theme.green, fontSize: 10, fontWeight: '800', letterSpacing: .8 }, evidenceText: { color: theme.muted, fontSize: 13, lineHeight: 19 },
});
