import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from './theme';
import { Eyebrow } from './ui';

export function PageHeader({ eyebrow, title, subtitle, right }: { eyebrow: string; title: string; subtitle: string; right?: React.ReactNode }) {
  const theme = useAppTheme(); const s = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'center', gap: 16 }, copy: { gap: 8, flex: 1 }, title: { color: theme.ink, fontSize: 32, fontWeight: '800', letterSpacing: -1.1 }, subtitle: { color: theme.muted, fontSize: 15, lineHeight: 22 } });
  return <View style={s.row}><View style={s.copy}><Eyebrow>{eyebrow}</Eyebrow><Text accessibilityRole="header" style={s.title}>{title}</Text><Text style={s.subtitle}>{subtitle}</Text></View>{right}</View>;
}
