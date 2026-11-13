import { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import type { QueuePatient } from '../../lib/types';
import { Button, Card, Centered, Chip, s } from '../../ui/components';
import { colors } from '../../ui/theme';
import { useAsync } from '../../ui/useAsync';

type Bucket = 'approve' | 'due' | 'closures';

/** Same split as doctor.html: a complete pending week goes to Approve; a missing
 *  or half-finished weekly entry goes to Assessment due. */
function bucketOf(p: QueuePatient): Bucket | null {
  const rx = p.pendingRx;
  if (rx && rx.missingFields.length === 0) return 'approve';
  if (rx && rx.missingFields.length > 0) return 'due';
  if (p.weeklyOverdue || p.week1Due) return 'due';
  return null;
}

export default function Queue() {
  const { user, signOut } = useAuth();
  const load = useCallback(() => api.weeklyQueue(), []);
  const { data, error, loading, refreshing, reload } = useAsync(load);
  const [bucket, setBucket] = useState<Bucket>('approve');
  const [busyId, setBusyId] = useState<number | null>(null);

  const groups = useMemo(() => {
    const g: Record<Bucket, QueuePatient[]> = { approve: [], due: [], closures: [] };
    for (const p of data?.patients ?? []) { const b = bucketOf(p); if (b) g[b].push(p); }
    g.closures = (data?.closed ?? []).filter(p => p.closure?.needsConfirmation);
    return g;
  }, [data]);

  async function approve(p: QueuePatient) {
    const rx = p.pendingRx!;
    const doIt = async () => {
      setBusyId(rx.id);
      try {
        const out = await api.approveRx(rx.id);
        Alert.alert('Approved', `Week ${rx.weekNumber} sent to store${out?.batchCode ? ` — batch ${out.batchCode}` : ''}.`);
        await reload();
      } catch (e: any) {
        Alert.alert('Could not approve', e?.message ?? 'Please try again.');
        await reload();
      } finally { setBusyId(null); }
    };
    const warn = p.warnings.length
      ? `\n\nWarnings:\n${p.warnings.map(w => `• ${w.label} ${w.detail}`).join('\n')}` : '';
    Alert.alert(`Approve week ${rx.weekNumber}?`, `${p.name} — this sends the batch to the store.${warn}`, [
      { text: 'Cancel', style: 'cancel' },
      { text: p.warnings.length ? 'Approve anyway' : 'Approve', onPress: doIt },
    ]);
  }

  const list = groups[bucket];

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{
        headerRight: () => (
          <View style={{ flexDirection: 'row', gap: 16 }}>
            <Pressable onPress={() => router.push('/patients')}><Text style={{ color: '#fff', fontWeight: '600' }}>Patients</Text></Pressable>
            <Pressable onPress={() => Alert.alert('Sign out?', user?.name ?? '', [
              { text: 'Cancel', style: 'cancel' }, { text: 'Sign out', style: 'destructive', onPress: signOut }])}>
              <Text style={{ color: '#c9d3e3' }}>Sign out</Text>
            </Pressable>
          </View>
        ),
      }} />

      <View style={{ flexDirection: 'row', padding: 12, gap: 8 }}>
        {([['approve', 'Approve'], ['due', 'Assessment due'], ['closures', 'Closures']] as const).map(([k, label]) => (
          <Pressable key={k} onPress={() => setBucket(k)}
            style={{ flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center',
              backgroundColor: bucket === k ? colors.navy : colors.card, borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ color: bucket === k ? '#fff' : colors.text, fontWeight: '600', fontSize: 13 }}>
              {label} ({groups[k].length})
            </Text>
          </Pressable>
        ))}
      </View>

      {loading ? <Centered><Text style={s.sub}>Loading…</Text></Centered>
        : error ? <Centered><Text style={{ color: colors.high, marginBottom: 12 }}>{error}</Text><Button title="Retry" onPress={reload} /></Centered>
        : (
          <FlatList
            data={list}
            keyExtractor={p => p.id}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} />}
            contentContainerStyle={{ paddingBottom: 32 }}
            ListEmptyComponent={<Centered><Text style={s.sub}>Nothing here — all caught up.</Text></Centered>}
            renderItem={({ item: p }) => (
              <Card>
                <Pressable onPress={() => router.push({ pathname: '/patient/[id]', params: { id: p.id } })}>
                  <Text style={s.name}>{p.name}</Text>
                  <Text style={s.sub}>
                    {[p.uhic, p.cancer, p.currentWeek ? `Week ${p.currentWeek}` : 'Not yet monitored'].filter(Boolean).join(' · ')}
                  </Text>
                </Pressable>

                <View style={s.row}>
                  {p.weeklyOverdue && p.daysSinceWeekly != null ? <Chip tone="high" text={`Weekly overdue ${p.daysSinceWeekly}d`} /> : null}
                  {p.week1Due ? <Chip tone="watch" text="Week 1 due" /> : null}
                  {p.supplyDaysLeft != null && p.supplyDaysLeft <= 2 ? <Chip tone="watch" text={`Supply ${Math.max(0, p.supplyDaysLeft)}d left`} /> : null}
                  {p.warnings.map((w, i) => <Chip key={i} tone={w.level === 'high' ? 'high' : 'watch'} text={`${w.label} ${w.detail}`} />)}
                  {p.pendingRx?.missingFields.length ? <Chip tone="muted" text={`Missing: ${p.pendingRx.missingFields.join(' · ')}`} /> : null}
                  {p.closure ? <Chip tone="muted" text={`Closed: ${p.closure.label}${p.closure.closedByRole ? ` (by ${p.closure.closedByRole.toLowerCase()})` : ''}`} /> : null}
                </View>

                {bucket === 'approve' && p.pendingRx ? (
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                    <Button title={p.warnings.length ? `⚠ Approve week ${p.pendingRx.weekNumber}` : `✓ Approve week ${p.pendingRx.weekNumber}`}
                      kind={p.warnings.length ? 'warn' : 'primary'} busy={busyId === p.pendingRx.id}
                      disabled={busyId !== null} onPress={() => approve(p)} />
                    <Button title="Review" kind="ghost" onPress={() => router.push({ pathname: '/patient/[id]', params: { id: p.id } })} />
                  </View>
                ) : null}
              </Card>
            )}
          />
        )}
    </View>
  );
}
