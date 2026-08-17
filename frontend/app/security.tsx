import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { createApiKey, getAuditLog, getMe, listApiKeys, listPermissions, listRoles, listSessions, listUsers, revokeAllSessions, revokeApiKey, revokeSession, updateUserRole } from '../src/api';
import type { AdminUser, ApiKeyInfo, AuditEntry, AuthPrincipal, RoleInfo, SessionInfo } from '../src/models';

export default function Security() {
  const [principal, setPrincipal] = useState<AuthPrincipal | null>(null);
  const [sessions, setSessions] = useState<SessionInfo[] | null>(null);
  const [apiKeys, setApiKeys] = useState<ApiKeyInfo[] | null>(null);
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [roles, setRoles] = useState<RoleInfo[] | null>(null);
  const [permissions, setPermissions] = useState<string[] | null>(null);
  const [audit, setAudit] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [keyName, setKeyName] = useState('');
  const [roleInputs, setRoleInputs] = useState<Record<number, string>>({});

  const isAdmin = principal ? principal.permissions.includes('users.manage') : false;

  const reload = useCallback(async () => {
    setError(null);
    try {
      const me = await getMe();
      setPrincipal(me);
      setSessions(await listSessions());
      setApiKeys(await listApiKeys());
      if (me.permissions.includes('audit.read')) {
        const page = await getAuditLog(20, 0);
        setAudit(page.entries);
      }
    } catch (reason) {
      setError(String(reason));
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  async function loadAdminData() {
    try {
      setUsers(await listUsers());
      setRoles(await listRoles());
      setPermissions(await listPermissions());
      const page = await getAuditLog(20, 0);
      setAudit(page.entries);
    } catch (reason) {
      setError(String(reason));
    }
  }

  async function createKey() {
    const name = keyName.trim();
    if (!name) return;
    try {
      const created = await createApiKey({ name, description: 'Created from the mobile app' });
      Alert.alert('API key created', `Store it now: ${created.key}`);
      setKeyName('');
      setApiKeys(await listApiKeys());
    } catch (reason) {
      Alert.alert('Could not create key', String(reason));
    }
  }

  async function revokeKey(id: string) {
    try {
      await revokeApiKey(id);
      setApiKeys(await listApiKeys());
    } catch (reason) {
      Alert.alert('Could not revoke key', String(reason));
    }
  }

  async function revokeOne(id: string) {
    try {
      await revokeSession(id);
      setSessions(await listSessions());
    } catch (reason) {
      Alert.alert('Could not revoke session', String(reason));
    }
  }

  async function revokeAll() {
    try {
      await revokeAllSessions();
      Alert.alert('Sessions revoked', 'All sessions have been invalidated.');
      setSessions(await listSessions());
    } catch (reason) {
      Alert.alert('Could not revoke sessions', String(reason));
    }
  }

  async function setRole(userId: number, role: string) {
    const target = role.trim();
    if (!target) return;
    try {
      await updateUserRole(userId, target);
      setUsers(await listUsers());
      setRoleInputs((prev) => ({ ...prev, [userId]: '' }));
    } catch (reason) {
      Alert.alert('Could not update role', String(reason));
    }
  }

  if (error && !principal) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>Could not load security data: {error}</Text>
        <Pressable onPress={() => router.back()}><Text style={styles.link}>Back</Text></Pressable>
      </View>
    );
  }
  if (!principal || !sessions || !apiKeys) {
    return <View style={styles.center}><ActivityIndicator color="#a78bfa" /><Text style={styles.muted}>Loading security data…</Text></View>;
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.kicker}>SECURITY</Text>
      <Text style={styles.title}>{principal.username}</Text>
      <View style={styles.card}><Text style={styles.cardTitle}>Active role: {principal.role}</Text><Text style={styles.muted}>{principal.permissions.join(', ') || 'No permissions'}</Text></View>

      <Text style={styles.section}>My sessions</Text>
      {sessions.map((session) => (
        <View key={session.id} style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>{session.userAgent || 'Unknown device'}</Text>
            <Text style={styles.meta}>{session.ip || 'unknown IP'} · {session.lastUsedAt ? new Date(session.lastUsedAt).toLocaleString() : 'never used'} · {session.active ? 'active' : 'inactive'}</Text>
          </View>
          {session.active && <Pressable style={styles.danger} onPress={() => void revokeOne(session.id)}><Text style={styles.dangerText}>Revoke</Text></Pressable>}
        </View>
      ))}
      <Pressable style={styles.secondary} onPress={() => void revokeAll()}><Text style={styles.secondaryText}>Revoke all sessions</Text></Pressable>

      <Text style={styles.section}>API keys</Text>
      {apiKeys.map((key) => (
        <View key={key.id} style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>{key.name}</Text>
            <Text style={styles.meta}>{key.prefix}… · {key.revokedAt ? 'revoked' : 'active'} · {key.scopes.join(', ') || 'no scopes'}</Text>
          </View>
          {!key.revokedAt && <Pressable style={styles.danger} onPress={() => void revokeKey(key.id)}><Text style={styles.dangerText}>Revoke</Text></Pressable>}
        </View>
      ))}
      <TextInput value={keyName} onChangeText={setKeyName} placeholder="New API key name" placeholderTextColor="#71717a" style={styles.input} autoCapitalize="none" />
      <Pressable style={styles.primary} onPress={() => void createKey()}><Text style={styles.primaryText}>Create API key</Text></Pressable>

      {isAdmin && (
        <>
          <Text style={styles.section}>Administration</Text>
          <Pressable style={styles.secondary} onPress={() => void loadAdminData()}><Text style={styles.secondaryText}>Load users, roles, permissions and audit</Text></Pressable>
          {users && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Users</Text>
              {users.map((user) => (
                <View key={user.id} style={styles.innerRow}>
                  <View style={{ flex: 1 }}><Text style={styles.rowTitle}>{user.username}</Text><Text style={styles.meta}>role: {user.role} · active: {String(user.isActive)}</Text></View>
                  <TextInput value={roleInputs[user.id] ?? ''} onChangeText={(value) => setRoleInputs((prev) => ({ ...prev, [user.id]: value }))} placeholder="role" placeholderTextColor="#71717a" style={[styles.input, { flex: 1, padding: 6 }]} autoCapitalize="none" />
                  <Pressable style={styles.danger} onPress={() => void setRole(user.id, roleInputs[user.id] ?? '')}><Text style={styles.dangerText}>Set</Text></Pressable>
                </View>
              ))}
            </View>
          )}
          {roles && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Roles</Text>
              {roles.map((role) => <Text key={role.name} style={styles.muted}>{role.name}: {role.permissions.join(', ')}</Text>)}
            </View>
          )}
          {permissions && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Permissions</Text>
              <Text style={styles.muted}>{permissions.join(', ')}</Text>
            </View>
          )}
        </>
      )}

      {audit && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Security activity</Text>
          {audit.map((entry) => <Text key={entry.id} style={styles.meta}>{entry.action} · {entry.resource} {entry.resourceId ?? ''} · {entry.user ?? 'system'} · {entry.success ? 'ok' : 'failed'}</Text>)}
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
  title: { color: '#fff', fontSize: 28, fontWeight: '800' },
  section: { color: '#fff', fontSize: 18, fontWeight: '700', marginTop: 12 },
  card: { backgroundColor: '#111113', borderWidth: 1, borderColor: '#27272a', borderRadius: 14, padding: 14, gap: 6 },
  cardTitle: { color: '#fff', fontWeight: '800', marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: '#18181b', borderWidth: 1, borderColor: '#27272a', borderRadius: 12 },
  innerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowTitle: { color: '#fafafa', fontWeight: '700' },
  meta: { color: '#71717a', fontSize: 12, lineHeight: 18 },
  input: { backgroundColor: '#18181b', borderColor: '#27272a', borderWidth: 1, borderRadius: 12, padding: 12, color: '#fff' },
  primary: { padding: 15, backgroundColor: '#7c3aed', borderRadius: 12, alignItems: 'center' },
  primaryText: { color: '#fff', fontWeight: '800' },
  secondary: { padding: 14, backgroundColor: '#18181b', borderRadius: 12, borderWidth: 1, borderColor: '#3f3f46', alignItems: 'center' },
  secondaryText: { color: '#fff', fontWeight: '700' },
  danger: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: '#2a1215' },
  dangerText: { color: '#f87171', fontWeight: '800' },
  error: { color: '#f87171' },
  muted: { color: '#a1a1aa', lineHeight: 20 },
  link: { color: '#a78bfa', textAlign: 'center', padding: 12, fontWeight: '700' },
});