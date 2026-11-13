import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { api } from '../../lib/api';
import { Button, Card, Centered, Chip, s } from '../../ui/components';
import { colors } from '../../ui/theme';
import { useAsync } from '../../ui/useAsync';

export default function Patients() {
  const load = useCallback(() => api.patients(), []);
  const { data, error, loading, refreshing, reload } = useAsync(load);
  const [q, setQ] = useState('');

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const all = data ?? [];
    if (!needle) return all;
    return all.filter(p => [p.name, p.uhic, p.cancer].some(v => String(v ?? '').toLowerCase().includes(needle)));
  }, [data, q]);

  return (
    <View style={{ flex: 1 }}>
      <TextInput placeholder="Search name, UHIC or cancer" value={q} onChangeText={setQ}
        style={{ margin: 12, marginBottom: 2, backgroundColor: colors.card, borderRadius: 10, padding: 12,
          borderWidth: 1, borderColor: colors.border, fontSize: 15 }} clearButtonMode="while-editing" />
      {loading ? <Centered><Text style={s.sub}>Loading…</Text></Centered>
        : error ? <Centered><Text style={{ color: colors.high, marginBottom: 12 }}>{error}</Text><Button title="Retry" onPress={reload} /></Centered>
        : (
          <FlatList
            data={list}
            keyExtractor={p => p.id}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} />}
            contentContainerStyle={{ paddingBottom: 32 }}
            ListEmptyComponent={<Centered><Text style={s.sub}>No patients found.</Text></Centered>}
            renderItem={({ item: p }) => (
              <Pressable onPress={() => router.push({ pathname: '/patient/[id]', params: { id: p.id } })}>
                <Card>
                  <Text style={s.name}>{p.name}</Text>
                  <Text style={s.sub}>{[p.uhic, p.age && `${p.age}y`, p.sex, p.cancer].filter(Boolean).join(' · ')}</Text>
                  {p.status ? <View style={s.row}><Chip text={String(p.status)} /></View> : null}
                </Card>
              </Pressable>
            )}
          />
        )}
    </View>
  );
}
