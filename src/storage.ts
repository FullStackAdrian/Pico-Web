import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AppState, Script } from './models';

const KEY = 'pico-web-state-v1';

const initial: AppState = {
  scripts: [],
  executions: [],
  payloads: [],
  devices: [{ id: 'pico-local', name: 'Pico W', picoUrl: 'http://192.168.4.1', apiUrl: 'http://192.168.4.16:8080', status: 'unknown' }],
  activeDeviceId: 'pico-local',
};

export async function loadState(): Promise<AppState> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return initial;
  try { return { ...initial, ...JSON.parse(raw) }; } catch { return initial; }
}

export async function saveState(state: AppState) {
  await AsyncStorage.setItem(KEY, JSON.stringify(state));
}

export function newScript(name = 'New payload'): Script {
  const now = new Date().toISOString();
  return { id: `local-${Date.now()}`, name, content: '', tags: [], category: 'Uncategorized', createdAt: now, updatedAt: now, source: 'local' };
}
