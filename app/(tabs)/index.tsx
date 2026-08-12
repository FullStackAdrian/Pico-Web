import { useEffect, useState } from 'react';
import { ScrollView, Text, View, StyleSheet, Pressable } from 'react-native';
import { router } from 'expo-router';
import { loadState } from '../../src/storage';
import { checkDevice } from '../../src/api';
import type { AppState } from '../../src/models';

export default function Dashboard() {
  const [state, setState] = useState<AppState | null>(null);
  const [online, setOnline] = useState(false);
  useEffect(() => { (async () => { const s = await loadState(); setState(s); const d = s.devices.find(x => x.id === s.activeDeviceId); if (d) setOnline(await checkDevice(d)); })(); }, []);
  if (!state) return <View style={styles.center}><Text style={styles.muted}>Loading…</Text></View>;
  const successful = state.executions.filter(x => x.success).length;
  return <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
    <Text style={styles.kicker}>PICO WEB</Text><Text style={styles.title}>Control center</Text>
    <View style={styles.status}><View style={[styles.dot, { backgroundColor: online ? '#4ade80' : '#f87171' }]} /><Text style={styles.statusText}>{online ? 'Pico reachable' : 'Pico offline'}</Text></View>
    <View style={styles.grid}>{[
      ['Scripts', String(state.scripts.length)], ['Executions', String(state.executions.length)], ['Successful', String(successful)], ['Payloads', String(state.payloads.length)]
    ].map(([label,value]) => <View key={label} style={styles.card}><Text style={styles.value}>{value}</Text><Text style={styles.muted}>{label}</Text></View>)}</View>
    <Text style={styles.section}>Quick actions</Text>
    <Pressable style={styles.primary} onPress={() => router.push('/editor')}><Text style={styles.primaryText}>＋ Create script</Text></Pressable>
    <Pressable style={styles.action} onPress={() => router.push('/scripts')}><Text style={styles.actionText}>Manage scripts and payloads</Text></Pressable>
    <Pressable style={styles.action} onPress={() => router.push('/device')}><Text style={styles.actionText}>Configure device</Text></Pressable>
    <View style={styles.notice}><Text style={styles.noticeTitle}>Backend-first boundary</Text><Text style={styles.muted}>The app exposes the complete management UI, while unsupported operations remain local until the Pico backend gains the corresponding endpoints.</Text></View>
  </ScrollView>;
}
const styles=StyleSheet.create({screen:{flex:1,backgroundColor:'#09090b'},content:{padding:22,gap:14},center:{flex:1,alignItems:'center',justifyContent:'center',backgroundColor:'#09090b'},kicker:{color:'#a78bfa',fontSize:12,fontWeight:'800',letterSpacing:2},title:{color:'#fafafa',fontSize:34,fontWeight:'800'},status:{flexDirection:'row',alignItems:'center',gap:8,marginTop:4},dot:{width:9,height:9,borderRadius:9},statusText:{color:'#d4d4d8'},grid:{flexDirection:'row',flexWrap:'wrap',gap:10},card:{backgroundColor:'#18181b',borderWidth:1,borderColor:'#27272a',borderRadius:16,padding:16,width:'48%'},value:{fontSize:26,fontWeight:'800',color:'#fff'},muted:{color:'#a1a1aa',lineHeight:20},section:{color:'#fff',fontSize:20,fontWeight:'700',marginTop:12},primary:{backgroundColor:'#7c3aed',padding:16,borderRadius:14,alignItems:'center'},primaryText:{color:'#fff',fontSize:16,fontWeight:'700'},action:{backgroundColor:'#18181b',padding:16,borderRadius:14,borderWidth:1,borderColor:'#27272a'},actionText:{color:'#e4e4e7',fontSize:15,fontWeight:'600'},notice:{padding:16,borderRadius:14,backgroundColor:'#111113',borderWidth:1,borderColor:'#27272a',marginTop:8},noticeTitle:{color:'#fff',fontWeight:'700',marginBottom:6}});
