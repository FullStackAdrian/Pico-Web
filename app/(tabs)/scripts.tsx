import { useCallback, useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { executeOnPico, listRemoteScripts } from '../../src/api';
import { loadState, newScript, saveState } from '../../src/storage';
import type { AppState, Script } from '../../src/models';

export default function Scripts() {
  const [state, setState] = useState<AppState | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');

  const refresh = useCallback(async () => {
    setRefreshing(true);
    const s = await loadState();
    const d = s.devices.find(x => x.id === s.activeDeviceId);
    if (d) {
      try {
        const remote = await listRemoteScripts(d);
        s.scripts = [...s.scripts.filter(x => x.source === 'local'), ...remote];
        await saveState(s);
      } catch {}
    }
    setState(s);
    setRefreshing(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  if (!state) return <View style={styles.center}><Text style={styles.muted}>Loading…</Text></View>;

  const filtered = state.scripts.filter(x =>
    x.name.toLowerCase().includes(query.toLowerCase()) ||
    x.tags.some(t => t.includes(query.toLowerCase()))
  );

  async function create() {
    const s = newScript();
    const next = { ...state, scripts: [s, ...state.scripts] };
    await saveState(next);
    setState(next);
    router.push({ pathname: '/editor', params: { id: s.id } });
  }

  async function run(script: Script) {
    if (!script.content) {
      Alert.alert('No content', 'Open the script in the editor or sync its content first.');
      return;
    }
    const d = state.devices.find(x => x.id === state.activeDeviceId);
    if (!d) return;
    const started = Date.now();
    try {
      await executeOnPico(d, script.content);
      const next = {
        ...state,
        executions: [{
          id: `exec-${Date.now()}`,
          scriptId: script.id,
          scriptName: script.name,
          startedAt: new Date().toISOString(),
          durationMs: Date.now() - started,
          success: true,
        }, ...state.executions],
      };
      await saveState(next);
      setState(next);
      Alert.alert('Executed', script.name);
    } catch (error) {
      const next = {
        ...state,
        executions: [{
          id: `exec-${Date.now()}`,
          scriptId: script.id,
          scriptName: script.name,
          startedAt: new Date().toISOString(),
          durationMs: Date.now() - started,
          success: false,
          error: String(error),
        }, ...state.executions],
      };
      await saveState(next);
      setState(next);
      Alert.alert('Execution failed', String(error));
    }
  }

  async function remove(script: Script) {
    if (script.source === 'pico') {
      Alert.alert('Backend required', 'The Pico backend does not expose DELETE yet. The UI is ready for that endpoint.');
      return;
    }
    const next = {
      ...state,
      scripts: state.scripts.filter(x => x.id !== script.id),
      payloads: state.payloads.filter(x => x.scriptId !== script.id),
    };
    await saveState(next);
    setState(next);
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View>
          <Text style={styles.kicker}>LIBRARY</Text>
          <Text style={styles.title}>Scripts</Text>
        </View>
        <Pressable style={styles.add} onPress={create}><Text style={styles.addText}>＋</Text></Pressable>
      </View>
      <TextInput value={query} onChangeText={setQuery} placeholder="Search scripts, tags…" placeholderTextColor="#71717a" style={styles.search} />
      <FlatList
        data={filtered}
        keyExtractor={x => x.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#a78bfa" />}
        contentContainerStyle={{ paddingBottom: 100 }}
        ListEmptyComponent={<Text style={styles.empty}>No scripts yet. Create your first payload.</Text>}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Pressable style={{ flex: 1 }} onPress={() => router.push({ pathname: '/editor', params: { id: item.id } })}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.meta}>{item.source === 'pico' ? 'REMOTE' : 'LOCAL'} · {item.category} · {item.tags.join(', ') || 'no tags'}</Text>
            </Pressable>
            <Pressable style={styles.run} onPress={() => run(item)}><Text style={styles.runText}>▶</Text></Pressable>
            <Pressable style={styles.delete} onPress={() => remove(item)}><Text style={styles.deleteText}>×</Text></Pressable>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#09090b', padding: 20 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#09090b' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  kicker: { color: '#a78bfa', fontSize: 11, fontWeight: '800', letterSpacing: 2 },
  title: { color: '#fff', fontSize: 32, fontWeight: '800' },
  add: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#7c3aed', alignItems: 'center', justifyContent: 'center' },
  addText: { color: '#fff', fontSize: 28 },
  search: { backgroundColor: '#18181b', borderColor: '#27272a', borderWidth: 1, borderRadius: 14, padding: 14, color: '#fff', marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14, backgroundColor: '#18181b', borderRadius: 14, borderWidth: 1, borderColor: '#27272a', marginBottom: 8 },
  name: { color: '#fafafa', fontWeight: '700', fontSize: 16 },
  meta: { color: '#71717a', fontSize: 12, marginTop: 5 },
  run: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#27272a', alignItems: 'center', justifyContent: 'center' },
  runText: { color: '#4ade80' },
  delete: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  deleteText: { color: '#f87171', fontSize: 24 },
  muted: { color: '#a1a1aa' },
  empty: { color: '#71717a', textAlign: 'center', padding: 30 },
});
