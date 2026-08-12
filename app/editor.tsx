import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { loadState, newScript, saveState } from '../src/storage';
import type { AppState, Script } from '../src/models';

export default function Editor() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [state, setState] = useState<AppState | null>(null);
  const [name, setName] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('Uncategorized');
  const [tags, setTags] = useState('');

  useEffect(() => {
    void (async () => {
      const loaded = await loadState();
      let selected = loaded.scripts.find((item) => item.id === id);
      if (!selected) {
        selected = newScript();
        loaded.scripts = [selected, ...loaded.scripts];
        await saveState(loaded);
      }
      setState(loaded);
      setName(selected.name);
      setContent(selected.content);
      setCategory(selected.category);
      setTags(selected.tags.join(', '));
    })();
  }, [id]);

  if (!state) {
    return <View style={styles.center}><Text style={styles.muted}>Loading…</Text></View>;
  }

  const current: AppState = state;
  const script: Script | undefined = current.scripts.find((item) => item.id === id) ?? current.scripts[0];
  if (!script) {
    return <View style={styles.center}><Text style={styles.muted}>No script selected.</Text></View>;
  }

  async function save() {
    const updated: Script = {
      ...script,
      name: name.trim() || 'Untitled',
      content,
      category: category.trim() || 'Uncategorized',
      tags: tags.split(',').map((item) => item.trim()).filter(Boolean),
      updatedAt: new Date().toISOString(),
      source: 'local',
    };
    const next: AppState = {
      ...current,
      scripts: current.scripts.map((item) => item.id === script.id ? updated : item),
    };
    await saveState(next);
    setState(next);
    Alert.alert('Saved', 'Stored locally on this device.');
  }

  return <ScrollView style={styles.screen} contentContainerStyle={styles.content}><Text style={styles.kicker}>EDITOR</Text><Text style={styles.title}>{name || 'New script'}</Text><TextInput value={name} onChangeText={setName} placeholder="Script name" placeholderTextColor="#71717a" style={styles.input}/><View style={styles.line}><TextInput value={category} onChangeText={setCategory} placeholder="Category" placeholderTextColor="#71717a" style={[styles.input, { flex: 1 }]}/><TextInput value={tags} onChangeText={setTags} placeholder="tags, comma separated" placeholderTextColor="#71717a" style={[styles.input, { flex: 1 }]}/></View><Text style={styles.label}>Script content</Text><TextInput value={content} onChangeText={setContent} multiline autoCapitalize="none" autoCorrect={false} textAlignVertical="top" placeholder="Write your script here…" placeholderTextColor="#52525b" style={styles.code}/><View style={styles.actions}><Pressable style={styles.primary} onPress={() => void save()}><Text style={styles.primaryText}>Save locally</Text></Pressable><Pressable style={styles.secondary} onPress={() => Alert.alert('Upload unavailable', 'The current backend has no upload endpoint. The UI is ready for that endpoint later.')}><Text style={styles.secondaryText}>Upload</Text></Pressable></View><Text style={styles.hint}>Local editing, tagging and categorisation work without server changes. Remote upload is intentionally deferred until the backend exposes it.</Text><Pressable onPress={() => router.back()}><Text style={styles.back}>Close</Text></Pressable></ScrollView>;
}

const styles=StyleSheet.create({screen:{flex:1,backgroundColor:'#09090b'},content:{padding:20,gap:12},center:{flex:1,alignItems:'center',justifyContent:'center',backgroundColor:'#09090b'},kicker:{color:'#a78bfa',fontSize:11,fontWeight:'800',letterSpacing:2},title:{color:'#fff',fontSize:30,fontWeight:'800'},input:{backgroundColor:'#18181b',borderColor:'#27272a',borderWidth:1,borderRadius:12,padding:13,color:'#fff'},line:{flexDirection:'row',gap:8},label:{color:'#a1a1aa',fontSize:13},code:{minHeight:360,backgroundColor:'#050506',borderColor:'#27272a',borderWidth:1,borderRadius:14,padding:15,color:'#e4e4e7',fontFamily:'monospace',fontSize:13,lineHeight:20},actions:{flexDirection:'row',gap:8},primary:{flex:1,padding:15,borderRadius:12,backgroundColor:'#7c3aed',alignItems:'center'},primaryText:{color:'#fff',fontWeight:'800'},secondary:{flex:1,padding:15,borderRadius:12,backgroundColor:'#18181b',alignItems:'center',borderWidth:1,borderColor:'#27272a'},secondaryText:{color:'#e4e4e7',fontWeight:'700'},hint:{color:'#71717a',lineHeight:19},muted:{color:'#a1a1aa'},back:{color:'#a78bfa',textAlign:'center',padding:12,fontWeight:'700'}});
