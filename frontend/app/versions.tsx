import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { diffScriptVersions, listScriptVersions, rollbackScript } from '../src/api';
import type { ScriptDiff, ScriptVersion } from '../src/models';

export default function Versions() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const scriptId = id ?? '';
  const [versions, setVersions] = useState<ScriptVersion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ScriptVersion | null>(null);
  const [diff, setDiff] = useState<ScriptDiff | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        setVersions(await listScriptVersions(scriptId));
      } catch (reason) {
        setError(String(reason));
      }
    })();
  }, [scriptId]);

  const latest = versions && versions.length > 0 ? versions[versions.length - 1] : null;

  const compare = useCallback(async () => {
    if (!selected || !latest || selected.version === latest.version) {
      Alert.alert('Select versions', 'Pick a version older than the latest to compare.');
      return;
    }
    try {
      setDiff(await diffScriptVersions(scriptId, selected.version, latest.version));
    } catch (reason) {
      Alert.alert('Diff failed', String(reason));
    }
  }, [scriptId, selected, latest]);

  async function rollback() {
    if (!selected) return;
    setBusy(true);
    try {
      await rollbackScript(scriptId, selected.version);
      Alert.alert('Rolled back', `Version ${selected.version} restored as a new version.`);
    } catch (reason) {
      Alert.alert('Rollback failed', String(reason));
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return <View style={styles.center}><Text style={styles.error}>Could not load versions: {error}</Text></View>;
  }
  if (!versions) {
    return <View style={styles.center}><ActivityIndicator color="#a78bfa" /><Text style={styles.muted}>Loading versions…</Text></View>;
  }
  if (versions.length === 0) {
    return <View style={styles.center}><Text style={styles.muted}>No versions recorded for this script yet.</Text><Pressable onPress={() => router.back()}><Text style={styles.link}>Back</Text></Pressable></View>;
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.kicker}>VERSIONS</Text>
      <Text style={styles.title}>{versions.length} saved versions</Text>
      {versions.map((version) => {
        const isSelected = selected?.version === version.version;
        return (
          <Pressable key={version.id} style={[styles.row, isSelected && styles.rowSelected]} onPress={() => { setSelected(version); setDiff(null); }}>
            <Text style={styles.rowTitle}>Version {version.version}</Text>
            <Text style={styles.meta}>{new Date(version.createdAt).toLocaleString()}</Text>
            {version.version === latest?.version && <Text style={styles.latest}>LATEST</Text>}
          </Pressable>
        );
      })}
      <View style={styles.actions}>
        <Pressable style={styles.primary} onPress={() => void compare()}><Text style={styles.primaryText}>Compare with version {latest?.version ?? 'latest'}</Text></Pressable>
        <Pressable style={styles.secondary} onPress={() => void rollback()} disabled={!selected || busy}><Text style={styles.secondaryText}>Rollback</Text></Pressable>
      </View>
      {diff && (
        <View style={styles.diffBox}>
          <Text style={styles.kicker}>DIFF v{selected?.version} → v{latest?.version}</Text>
          {diff.changed ? diff.hunks.flatMap((hunk, hunkIndex) => [
            ...hunk.oldLines.map((line, i) => <Text key={`${hunkIndex}-o-${i}`} style={[styles.diffLine, styles.removed]}>{`- ${line}`}</Text>),
            ...hunk.newLines.map((line, i) => <Text key={`${hunkIndex}-n-${i}`} style={[styles.diffLine, styles.added]}>{`+ ${line}`}</Text>),
          ]) : <Text style={styles.muted}>No differences between these versions.</Text>}
        </View>
      )}
      <Pressable onPress={() => router.back()}><Text style={styles.link}>Back</Text></Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#09090b' },
  content: { padding: 20, gap: 10 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#09090b', gap: 12 },
  kicker: { color: '#a78bfa', fontSize: 11, fontWeight: '800', letterSpacing: 2 },
  title: { color: '#fff', fontSize: 24, fontWeight: '800' },
  row: { padding: 14, backgroundColor: '#18181b', borderRadius: 14, borderWidth: 1, borderColor: '#27272a' },
  rowSelected: { borderColor: '#a78bfa' },
  rowTitle: { color: '#fafafa', fontWeight: '700', fontSize: 16 },
  meta: { color: '#71717a', fontSize: 12, marginTop: 4 },
  latest: { color: '#4ade80', fontSize: 11, fontWeight: '800', marginTop: 4 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 6 },
  primary: { flex: 1, padding: 14, borderRadius: 12, backgroundColor: '#7c3aed', alignItems: 'center' },
  primaryText: { color: '#fff', fontWeight: '800' },
  secondary: { flex: 1, padding: 14, borderRadius: 12, backgroundColor: '#18181b', alignItems: 'center', borderWidth: 1, borderColor: '#27272a' },
  secondaryText: { color: '#e4e4e7', fontWeight: '700' },
  diffBox: { backgroundColor: '#050506', borderColor: '#27272a', borderWidth: 1, borderRadius: 14, padding: 14, gap: 4 },
  diffLine: { fontFamily: 'monospace', fontSize: 13, lineHeight: 20 },
  added: { color: '#4ade80' },
  removed: { color: '#f87171' },
  error: { color: '#f87171' },
  muted: { color: '#a1a1aa' },
  link: { color: '#a78bfa', textAlign: 'center', padding: 12, fontWeight: '700' },
});