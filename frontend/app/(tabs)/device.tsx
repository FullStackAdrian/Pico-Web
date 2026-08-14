import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { checkDevice } from '../../src/api';
import { loadState, saveState } from '../../src/storage';
import type { AppState, Device } from '../../src/models';

export default function DeviceScreen() {
  const [state, setState] = useState<AppState | null>(null);
  const [device, setDevice] = useState<Device | null>(null);
  const [checking, setChecking] = useState(false);
  const [ssid, setSsid] = useState('');
  const [wifiPassword, setWifiPassword] = useState('');

  useEffect(() => {
    loadState().then((loaded) => {
      setState(loaded);
      setDevice(loaded.devices.find((item) => item.id === loaded.activeDeviceId) ?? null);
    });
  }, []);

  async function check() {
    if (!device || !state) return;
    setChecking(true);
    try {
      const ok = await checkDevice(device);
      const devices: Device[] = state.devices.map((item) =>
        item.id === device.id
          ? { ...item, status: ok ? ('online' as const) : ('offline' as const), lastSeen: ok ? new Date().toISOString() : item.lastSeen }
          : item,
      );
      const next: AppState = { ...state, devices };
      await saveState(next);
      setState(next);
      setDevice(devices.find((item) => item.id === device.id) ?? null);
    } finally {
      setChecking(false);
    }
  }

  async function save() {
    if (!state || !device) return;
    const next: AppState = { ...state, devices: state.devices.map((item) => item.id === device.id ? device : item) };
    await saveState(next);
    setState(next);
    Alert.alert('Saved', 'Device settings stored locally.');
  }

  if (!device) return <View style={styles.center}><Text style={styles.muted}>Loading…</Text></View>;
  return <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
    <Text style={styles.kicker}>DEVICE</Text><Text style={styles.title}>{device.name}</Text>
    <View style={styles.status}><View style={[styles.dot, { backgroundColor: device.status === 'online' ? '#4ade80' : '#f87171' }]} /><Text style={styles.statusText}>{device.status.toUpperCase()}</Text>{device.lastSeen && <Text style={styles.meta}>Last seen {new Date(device.lastSeen).toLocaleTimeString()}</Text>}</View>
    <Text style={styles.section}>Connection</Text><Text style={styles.label}>Pico URL</Text><TextInput value={device.picoUrl} onChangeText={(value) => setDevice({ ...device, picoUrl: value })} style={styles.input} autoCapitalize="none" />
    <Text style={styles.label}>API URL</Text><TextInput value={device.apiUrl} onChangeText={(value) => setDevice({ ...device, apiUrl: value })} style={styles.input} autoCapitalize="none" />
    <Pressable style={styles.primary} onPress={check}><Text style={styles.primaryText}>{checking ? 'Checking…' : 'Check device'}</Text></Pressable>
    <Text style={styles.section}>Wi‑Fi configuration</Text><TextInput value={ssid} onChangeText={setSsid} placeholder="SSID" placeholderTextColor="#71717a" style={styles.input} /><TextInput value={wifiPassword} onChangeText={setWifiPassword} placeholder="Password" placeholderTextColor="#71717a" style={styles.input} secureTextEntry />
    <Text style={styles.hint}>The form is ready, but applying Wi‑Fi changes requires a Pico endpoint. Nothing is sent to the device yet.</Text><Pressable style={styles.secondary} onPress={save}><Text style={styles.secondaryText}>Save device settings</Text></Pressable>
    <Text style={styles.section}>Monitoring</Text><View style={styles.panel}><Text style={styles.panelTitle}>Polling fallback</Text><Text style={styles.muted}>Realtime telemetry/WebSocket support is reserved for a future backend. The app currently uses lightweight reachability checks.</Text></View>
  </ScrollView>;
}
const styles=StyleSheet.create({screen:{flex:1,backgroundColor:'#09090b'},content:{padding:20,gap:10},center:{flex:1,alignItems:'center',justifyContent:'center',backgroundColor:'#09090b'},kicker:{color:'#a78bfa',fontSize:11,fontWeight:'800',letterSpacing:2},title:{color:'#fff',fontSize:32,fontWeight:'800'},status:{flexDirection:'row',alignItems:'center',gap:8,marginBottom:8},dot:{width:9,height:9,borderRadius:9},statusText:{color:'#e4e4e7',fontWeight:'800'},meta:{color:'#71717a',fontSize:12},section:{color:'#fff',fontSize:19,fontWeight:'700',marginTop:14},label:{color:'#a1a1aa',fontSize:12,marginTop:3},input:{backgroundColor:'#18181b',borderWidth:1,borderColor:'#27272a',borderRadius:12,padding:13,color:'#fff'},primary:{padding:15,backgroundColor:'#7c3aed',borderRadius:12,alignItems:'center',marginTop:4},primaryText:{color:'#fff',fontWeight:'800'},secondary:{padding:15,backgroundColor:'#18181b',borderRadius:12,borderWidth:1,borderColor:'#27272a',alignItems:'center'},secondaryText:{color:'#fff',fontWeight:'700'},panel:{backgroundColor:'#18181b',borderWidth:1,borderColor:'#27272a',borderRadius:14,padding:15},panelTitle:{color:'#fff',fontWeight:'700',marginBottom:5},muted:{color:'#a1a1aa',lineHeight:20},hint:{color:'#71717a',lineHeight:19}});
