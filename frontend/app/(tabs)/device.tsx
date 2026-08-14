import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { createManagedDevice, deleteManagedDevice, getDeviceMetrics, listManagedDevices, updateManagedDevice, type DeviceMetrics, type ManagedDevice } from '../../src/api';
import { loadState } from '../../src/storage';
import type { Device } from '../../src/models';

function statusLabel(status: ManagedDevice['status']) { return status === 'online' ? 'ONLINE' : status === 'offline' ? 'OFFLINE' : 'UNKNOWN'; }
function metric(value: number | undefined, suffix = '') { return value === undefined ? '—' : `${value}${suffix}`; }

export default function DeviceScreen() {
  const [devices, setDevices] = useState<ManagedDevice[]>([]);
  const [metrics, setMetrics] = useState<Record<string, DeviceMetrics>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [backendError, setBackendError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [group, setGroup] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: '', picoUrl: '', apiUrl: '', groupName: '', tags: '' });

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const remote = await listManagedDevices({ search: search.trim() || undefined, group: group.trim() || undefined });
      setDevices(remote);
      setBackendError(null);
      if (remote.length && !selected) setSelected(remote[0].id);
    } catch (error) {
      setBackendError(error instanceof Error ? error.message : 'Backend unavailable');
      try {
        const local = await loadState();
        setDevices(local.devices.map((item) => ({ ...item, tags: item.tags || [], groupName: item.groupName || null })));
      } catch { setDevices([]); }
    } finally { setLoading(false); setRefreshing(false); }
  }, [group, search, selected]);

  useEffect(() => { void load(); }, [load]);

  const selectedDevice = useMemo(() => devices.find((item) => item.id === selected) ?? null, [devices, selected]);

  async function loadMetrics(deviceId: string) {
    try { const value = await getDeviceMetrics(deviceId); setMetrics((current) => ({ ...current, [deviceId]: value })); }
    catch { /* Device may not expose telemetry yet. */ }
  }

  function startCreate() {
    setSelected(null); setEditing(true); setForm({ name: '', picoUrl: '', apiUrl: '', groupName: '', tags: '' });
  }

  function startEdit(device: ManagedDevice) {
    setSelected(device.id); setEditing(true);
    setForm({ name: device.name, picoUrl: device.picoUrl, apiUrl: device.apiUrl, groupName: device.groupName || '', tags: device.tags.join(', ') });
  }

  async function save() {
    if (!form.name.trim() || !form.picoUrl.trim() || !form.apiUrl.trim()) return;
    const tags = form.tags.split(',').map((tag) => tag.trim()).filter(Boolean);
    try {
      if (selectedDevice) await updateManagedDevice(selectedDevice.id, { name: form.name.trim(), picoUrl: form.picoUrl.trim(), apiUrl: form.apiUrl.trim(), groupName: form.groupName.trim() || null, tags });
      else await createManagedDevice({ name: form.name.trim(), picoUrl: form.picoUrl.trim(), apiUrl: form.apiUrl.trim(), groupName: form.groupName.trim() || undefined, tags });
      setEditing(false); await load();
    } catch (error) { Alert.alert('Unable to save device', error instanceof Error ? error.message : 'Backend unavailable'); }
  }

  function remove(device: ManagedDevice) {
    Alert.alert('Delete device', `Remove ${device.name}?`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: async () => { try { await deleteManagedDevice(device.id); setSelected(null); await load(); } catch (error) { Alert.alert('Unable to delete', error instanceof Error ? error.message : 'Backend unavailable'); } } }]);
  }

  if (loading) return <View style={styles.center}><Text style={styles.muted}>Loading devices…</Text></View>;

  return <ScrollView style={styles.screen} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(true); }} />}>
    <View style={styles.header}><View><Text style={styles.kicker}>DEVICES</Text><Text style={styles.title}>Device dashboard</Text></View><Pressable style={styles.primarySmall} onPress={startCreate}><Text style={styles.primaryText}>＋ Add</Text></Pressable></View>
    {backendError && <View style={styles.warning}><Text style={styles.warningTitle}>Backend unavailable</Text><Text style={styles.muted}>{backendError}. Showing local devices until the API is reachable.</Text></View>}
    <View style={styles.filters}><TextInput value={search} onChangeText={setSearch} placeholder="Search devices" placeholderTextColor="#71717a" style={styles.filterInput}/><TextInput value={group} onChangeText={setGroup} placeholder="Group" placeholderTextColor="#71717a" style={styles.filterInput}/><Pressable style={styles.secondarySmall} onPress={() => void load()}><Text style={styles.secondaryText}>Filter</Text></Pressable></View>
    <View style={styles.summary}>{[['All', devices.length], ['Online', devices.filter((d) => d.status === 'online').length], ['Offline', devices.filter((d) => d.status === 'offline').length]].map(([label, value]) => <View key={String(label)} style={styles.summaryCard}><Text style={styles.summaryValue}>{value}</Text><Text style={styles.muted}>{label}</Text></View>)}</View>
    {editing && <View style={styles.panel}><Text style={styles.section}>{selectedDevice ? 'Edit device' : 'Add device'}</Text>{[['name','Name'],['picoUrl','Pico URL'],['apiUrl','API URL'],['groupName','Group'],['tags','Tags (comma separated)']].map(([key, label]) => <TextInput key={key} value={form[key as keyof typeof form]} onChangeText={(value) => setForm((current) => ({ ...current, [key]: value }))} placeholder={label} placeholderTextColor="#71717a" style={styles.input} autoCapitalize="none" />)}<View style={styles.row}><Pressable style={styles.primary} onPress={() => void save()}><Text style={styles.primaryText}>Save</Text></Pressable><Pressable style={styles.secondary} onPress={() => setEditing(false)}><Text style={styles.secondaryText}>Cancel</Text></Pressable></View></View>}
    <Text style={styles.section}>Fleet</Text>
    {devices.length === 0 ? <View style={styles.panel}><Text style={styles.muted}>No devices registered.</Text></View> : devices.map((device) => { const m = metrics[device.id]; return <Pressable key={device.id} style={[styles.deviceCard, selected === device.id && styles.selectedCard]} onPress={() => { setSelected(device.id); void loadMetrics(device.id); }}><View style={styles.cardHeader}><View style={{ flex: 1 }}><Text style={styles.deviceName}>{device.name}</Text><Text style={styles.muted}>{device.id}{device.groupName ? ` · ${device.groupName}` : ''}</Text></View><View style={styles.status}><View style={[styles.dot, { backgroundColor: device.status === 'online' ? '#4ade80' : device.status === 'offline' ? '#f87171' : '#a1a1aa' }]} /><Text style={styles.statusText}>{statusLabel(device.status)}</Text></View></View><View style={styles.tags}>{device.tags.map((tag) => <Text key={tag} style={styles.tag}>#{tag}</Text>)}</View><View style={styles.metrics}><View><Text style={styles.metricValue}>{metric(m?.temperature_c, '°C')}</Text><Text style={styles.muted}>Temperature</Text></View><View><Text style={styles.metricValue}>{metric(m?.free_memory, ' B')}</Text><Text style={styles.muted}>Free memory</Text></View><View><Text style={styles.metricValue}>{metric(m?.wifi_rssi, ' dBm')}</Text><Text style={styles.muted}>Wi‑Fi</Text></View><View><Text style={styles.metricValue}>{metric(m?.uptime_seconds, ' s')}</Text><Text style={styles.muted}>Uptime</Text></View></View>{device.firmware && <Text style={styles.firmware}>Firmware {device.firmware}</Text>}{selected === device.id && <View style={styles.row}><Pressable style={styles.secondary} onPress={() => startEdit(device)}><Text style={styles.secondaryText}>Edit</Text></Pressable><Pressable style={styles.danger} onPress={() => remove(device)}><Text style={styles.dangerText}>Delete</Text></Pressable></View>}</Pressable>; })}
  </ScrollView>;
}

const styles = StyleSheet.create({
  screen:{flex:1,backgroundColor:'#09090b'},content:{padding:20,gap:12},center:{flex:1,alignItems:'center',justifyContent:'center',backgroundColor:'#09090b'},header:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},kicker:{color:'#a78bfa',fontSize:11,fontWeight:'800',letterSpacing:2},title:{color:'#fff',fontSize:32,fontWeight:'800'},section:{color:'#fff',fontSize:19,fontWeight:'700',marginTop:8},muted:{color:'#a1a1aa',lineHeight:19},warning:{backgroundColor:'#211b0f',borderColor:'#5b4a20',borderWidth:1,borderRadius:14,padding:14},warningTitle:{color:'#facc15',fontWeight:'800',marginBottom:4},filters:{flexDirection:'row',gap:8},filterInput:{flex:1,minWidth:0,backgroundColor:'#18181b',borderWidth:1,borderColor:'#27272a',borderRadius:12,padding:11,color:'#fff'},summary:{flexDirection:'row',gap:8},summaryCard:{flex:1,backgroundColor:'#18181b',borderWidth:1,borderColor:'#27272a',borderRadius:14,padding:13},summaryValue:{fontSize:24,fontWeight:'800',color:'#fff'},deviceCard:{backgroundColor:'#18181b',borderWidth:1,borderColor:'#27272a',borderRadius:16,padding:15,gap:10},selectedCard:{borderColor:'#7c3aed'},cardHeader:{flexDirection:'row',alignItems:'center'},deviceName:{color:'#fff',fontSize:18,fontWeight:'800'},status:{flexDirection:'row',alignItems:'center',gap:6},dot:{width:8,height:8,borderRadius:8},statusText:{color:'#d4d4d8',fontSize:11,fontWeight:'800'},tags:{flexDirection:'row',flexWrap:'wrap',gap:6},tag:{color:'#c4b5fd',backgroundColor:'#2e1065',paddingHorizontal:7,paddingVertical:3,borderRadius:8,fontSize:11},metrics:{flexDirection:'row',justifyContent:'space-between',gap:8},metricValue:{color:'#fff',fontWeight:'800'},firmware:{color:'#71717a',fontSize:12},panel:{backgroundColor:'#111113',borderWidth:1,borderColor:'#27272a',borderRadius:16,padding:15,gap:9},input:{backgroundColor:'#18181b',borderWidth:1,borderColor:'#27272a',borderRadius:12,padding:12,color:'#fff'},row:{flexDirection:'row',gap:8},primary:{flex:1,padding:14,backgroundColor:'#7c3aed',borderRadius:12,alignItems:'center'},primarySmall:{paddingHorizontal:14,paddingVertical:10,backgroundColor:'#7c3aed',borderRadius:11},primaryText:{color:'#fff',fontWeight:'800'},secondary:{flex:1,padding:14,backgroundColor:'#18181b',borderRadius:12,borderWidth:1,borderColor:'#3f3f46',alignItems:'center'},secondarySmall:{paddingHorizontal:12,paddingVertical:11,backgroundColor:'#18181b',borderRadius:11,borderWidth:1,borderColor:'#3f3f46'},secondaryText:{color:'#fff',fontWeight:'700'},danger:{flex:1,padding:14,backgroundColor:'#2a1215',borderRadius:12,borderWidth:1,borderColor:'#5b2027',alignItems:'center'},dangerText:{color:'#fca5a5',fontWeight:'800'}
});
