import { useCallback } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { api } from '../../../lib/api';
import { Button, Card, Centered, s } from '../../../ui/components';
import { colors } from '../../../ui/theme';
import { useAsync } from '../../../ui/useAsync';

const FIELDS: [key: string, label: string, unit?: string][] = [
  ['age', 'Age', 'y'], ['sex', 'Sex'], ['cancer', 'Cancer'], ['cancerStage', 'Stage'], ['regimen', 'Regimen'],
  ['weight', 'Weight', 'kg'], ['usualWeight', 'Usual weight', 'kg'], ['height', 'Height', 'cm'],
  ['albumin', 'Albumin', 'g/dL'], ['crp', 'CRP', 'mg/L'], ['creatinine', 'Creatinine', 'mg/dL'],
  ['urea', 'Urea', 'mg/dL'], ['sodium', 'Sodium', 'mmol/L'], ['ecogStatus', 'ECOG'],
  ['feedingMethod', 'Feeding'], ['status', 'Status'],
];

export default function PatientDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const load = useCallback(() => api.patient(id), [id]);
  const { data: p, error, loading, refreshing, reload } = useAsync(load);

  if (loading) return <Centered><Text style={s.sub}>Loading…</Text></Centered>;
  if (error || !p) return <Centered><Text style={{ color: colors.high, marginBottom: 12 }}>{error}</Text><Button title="Retry" onPress={reload} /></Centered>;

  return (
    <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} />} contentContainerStyle={{ paddingBottom: 32 }}>
      <Stack.Screen options={{ title: p.name }} />
      <Card>
        <Text style={s.name}>{p.name}</Text>
        {p.uhic ? <Text style={s.sub}>UHIC {p.uhic}</Text> : null}
      </Card>
      <Card>
        {FIELDS.filter(([k]) => p[k] != null && p[k] !== '').map(([k, label, unit]) => (
          <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7,
            borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <Text style={{ color: colors.muted }}>{label}</Text>
            <Text style={{ color: colors.text, fontWeight: '600' }}>{String(p[k])}{unit ? ` ${unit}` : ''}</Text>
          </View>
        ))}
      </Card>
      <Card>
        <Text style={s.sub}>Weekly entries, voice dictation, PDF report, QR and closure arrive in the next build phases.</Text>
      </Card>
    </ScrollView>
  );
}
