import React, { useCallback, useMemo, useState } from 'react';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Shell } from '@/components/Shell';
import { PageHeader } from '@/components/PageHeader';
import { Button, Eyebrow, Loading, Notice } from '@/components/ui';
import { useAppTheme } from '@/components/theme';
import { listMyLearning, listMyProgress, LearningAnswer, LearningProgress } from '@/services/apiClient';

const dateRanges = ['7 days', '30 days', 'All time'] as const;
type DateRange = (typeof dateRanges)[number];

export default function Progress() {
  const theme = useAppTheme(); const s = styles(theme);
  const [rows, setRows] = useState<LearningAnswer[]>([]); const [progress, setProgress] = useState<LearningProgress[]>([]);
  const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [refresh, setRefresh] = useState(0); const [range, setRange] = useState<DateRange>('All time');

  useFocusEffect(useCallback(() => {
    const controller = new AbortController(); setLoading(true); setError('');
    Promise.all([listMyLearning(controller.signal), listMyProgress(controller.signal)])
      .then(([learning, savedProgress]) => { setRows(learning); setProgress(savedProgress); })
      .catch((cause) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Progress could not be loaded.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [refresh]));

  const visibleRows = useMemo(() => {
    if (range === 'All time') return rows;
    const days = range === '7 days' ? 7 : 30; const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    return rows.filter((row) => Date.parse(row.created_at) >= cutoff);
  }, [range, rows]);
  const averageCompletion = progress.length ? Math.round(progress.reduce((total, item) => total + item.completion, 0) / progress.length) : 0;

  return <Shell>
    <PageHeader eyebrow="Progress" title="Look how far you've come." subtitle="Your saved learning is here when you want to return." />
    <View style={s.stats}>
      <View style={[s.stat, { backgroundColor: theme.softGreen }]}><Text style={s.statNum}>{loading || error ? '--' : rows.length}</Text><Text style={s.statLabel}>Saved learning moments</Text></View>
      <View style={[s.stat, { backgroundColor: theme.mode === 'dark' ? '#353047' : '#f0eef9' }]}><Text style={s.statNum}>{loading || error ? '--' : new Set(rows.map((row) => row.kind)).size}</Text><Text style={s.statLabel}>Ways you've practised</Text></View>
      <View style={[s.stat, { backgroundColor: theme.mode === 'dark' ? '#49362c' : '#fff3d9' }]}><Text style={s.statNum}>{loading || error ? '--' : averageCompletion + '%'}</Text><Text style={s.statLabel}>Average progress</Text></View>
    </View>

    <View style={s.sectionCard}><Eyebrow>GOAL HISTORY</Eyebrow><Text style={s.sectionTitle}>Goals you have worked on</Text><Text style={s.body}>Your saved goal history will appear here when it is available. Choose a goal from Home to start a focused study path.</Text><Button secondary title="Choose a goal" onPress={() => router.push('/dashboard')} /></View>

    {loading ? <View style={s.stateCard}><Loading label="Loading your saved progress..." /></View> : error ? <View style={s.stateCard}><Notice kind="error">{error}</Notice><Button title="Try again" onPress={() => setRefresh((value) => value + 1)} /></View> : <>
      <View style={s.sectionCard}><View style={s.sectionHeading}><View style={s.titleGroup}><Eyebrow>PROGRESS BY TOPIC</Eyebrow><Text style={s.sectionTitle}>Your learning progress</Text></View></View>
        {progress.length ? progress.map((item) => <View style={s.progressRow} key={item.id}><View style={s.progressCopy}><Text style={s.rowTitle}>{item.status === 'completed' ? 'Completed' : 'In progress'}</Text><Text style={s.rowBody}>{item.content_id ? 'Assigned course material' : 'Personal learning'}</Text></View><Text style={s.percent}>{item.completion}%</Text></View>) : <Text style={s.body}>No progress information yet. Save a study session or practice answer to begin tracking.</Text>}
      </View>

      <View style={s.sectionCard}><View style={s.sectionHeading}><View style={s.titleGroup}><Eyebrow>SAVED SESSIONS</Eyebrow><Text style={s.sectionTitle}>Return to your learning</Text></View></View>
        <View accessible accessibilityLabel="Filter saved sessions by date range" style={s.rangePicker}>{dateRanges.map((item) => <Pressable key={item} accessibilityRole="button" accessibilityState={{ selected: range === item }} onPress={() => setRange(item)} style={[s.rangeButton, range === item && s.rangeSelected]}><Text style={[s.rangeText, range === item && s.rangeTextSelected]}>{item}</Text></Pressable>)}</View>
        {visibleRows.length ? visibleRows.map((row) => <View style={s.row} key={row.id}><View style={s.rowMark}><Text style={s.rowMarkText}>{row.kind === 'quiz' ? 'P' : 'Q'}</Text></View><View style={s.rowCopy}><Text style={s.rowTitle}>{row.kind === 'quiz' ? 'Practice answer' : 'Notes question'}</Text><Text numberOfLines={2} style={s.rowBody}>{row.prompt}</Text></View><Text style={s.date}>{new Date(row.created_at).toLocaleDateString()}</Text></View>) : <View style={s.empty}><Text style={s.emptyTitle}>{rows.length ? 'No saved learning in this range.' : 'Your story starts here.'}</Text><Text style={s.body}>{rows.length ? 'Choose another date range to see more.' : 'Saved questions and practice answers will show up here when you complete a learning activity.'}</Text><Button title="Resume session" onPress={() => router.push('/dashboard')} /></View>}
      </View>
    </>}
  </Shell>;
}

const styles = (theme: ReturnType<typeof useAppTheme>) => StyleSheet.create({
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 }, stat: { flexGrow: 1, flexBasis: 180, borderRadius: 18, padding: 20, gap: 4 }, statNum: { fontWeight: '800', fontSize: 27, color: theme.ink }, statLabel: { fontSize: 13, color: theme.muted },
  sectionCard: { backgroundColor: theme.paper, borderRadius: 20, padding: 22, borderWidth: 1, borderColor: theme.line, gap: 14 }, stateCard: { padding: 18, backgroundColor: theme.paper, borderWidth: 1, borderColor: theme.line, borderRadius: 18, gap: 12 },
  sectionHeading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, titleGroup: { gap: 5 }, sectionTitle: { fontSize: 19, fontWeight: '800', color: theme.ink }, body: { color: theme.muted, fontSize: 14, lineHeight: 22 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: 1, borderTopColor: theme.line, paddingTop: 15 }, progressCopy: { flex: 1, gap: 5 }, percent: { fontSize: 16, color: theme.green, fontWeight: '800' },
  rangePicker: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, rangeButton: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 12, borderWidth: 1, borderColor: theme.line, borderRadius: 12 }, rangeSelected: { backgroundColor: theme.softGreen, borderColor: theme.green }, rangeText: { color: theme.muted, fontSize: 13, fontWeight: '600' }, rangeTextSelected: { color: theme.ink },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: 1, borderTopColor: theme.line, paddingTop: 15 }, rowMark: { width: 36, height: 36, borderRadius: 12, backgroundColor: theme.softGreen, alignItems: 'center', justifyContent: 'center' }, rowMarkText: { color: theme.green, fontWeight: '800' }, rowCopy: { flex: 1, gap: 5 }, rowTitle: { fontWeight: '700', color: theme.ink, fontSize: 14 }, rowBody: { color: theme.muted, fontSize: 13, lineHeight: 20 }, date: { fontSize: 11, color: theme.muted },
  empty: { borderTopWidth: 1, borderTopColor: theme.line, paddingTop: 17, gap: 12 }, emptyTitle: { color: theme.ink, fontSize: 17, fontWeight: '800' },
});
