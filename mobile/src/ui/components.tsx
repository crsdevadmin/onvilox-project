import { ActivityIndicator, Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { colors, radius } from './theme';

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function Chip({ text, tone = 'muted' }: { text: string; tone?: 'high' | 'watch' | 'ok' | 'muted' }) {
  const map = {
    high: [colors.highBg, colors.high], watch: [colors.watchBg, colors.watch],
    ok: [colors.okBg, colors.ok], muted: ['#eef1f5', colors.muted],
  } as const;
  const [bg, fg] = map[tone];
  return <View style={[s.chip, { backgroundColor: bg }]}><Text style={[s.chipText, { color: fg }]}>{text}</Text></View>;
}

export function Button({ title, onPress, kind = 'primary', disabled, busy }: {
  title: string; onPress: () => void; kind?: 'primary' | 'ghost' | 'warn'; disabled?: boolean; busy?: boolean;
}) {
  const bg = kind === 'primary' ? colors.navy : kind === 'warn' ? colors.watch : 'transparent';
  const fg = kind === 'ghost' ? colors.navy : '#fff';
  return (
    <Pressable onPress={onPress} disabled={disabled || busy}
      style={[s.btn, { backgroundColor: bg, borderColor: colors.navy, borderWidth: kind === 'ghost' ? 1 : 0 },
        (disabled || busy) && { opacity: 0.45 }]}>
      {busy ? <ActivityIndicator color={fg} /> : <Text style={[s.btnText, { color: fg }]}>{title}</Text>}
    </Pressable>
  );
}

export function Centered({ children }: { children: React.ReactNode }) {
  return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>{children}</View>;
}

export const s = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius, padding: 14, marginHorizontal: 12, marginTop: 10,
    borderWidth: 1, borderColor: colors.border },
  chip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, marginRight: 6, marginTop: 6 },
  chipText: { fontSize: 12, fontWeight: '600' },
  btn: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, alignItems: 'center', flexGrow: 1 },
  btnText: { fontWeight: '700' },
  name: { fontSize: 16, fontWeight: '700', color: colors.text },
  sub: { fontSize: 13, color: colors.muted, marginTop: 2 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
});
