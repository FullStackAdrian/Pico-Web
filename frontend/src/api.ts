import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Device, Script } from './models';

const timeout = 6000;
const BACKEND_URL = (process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000/api/v1').replace(/\/$/, '');
const TOKEN_KEY = 'pico-web-access-token';

export async function setBackendAccessToken(token: string) { await AsyncStorage.setItem(TOKEN_KEY, token); }
export async function clearBackendAccessToken() { await AsyncStorage.removeItem(TOKEN_KEY); }

async function request(url: string, init?: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    const headers = new Headers(init?.headers);
    if (!headers.has('Accept')) headers.set('Accept', 'application/json');
    if (init?.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    if (token) headers.set('Authorization', `Bearer ${token}`);
    const response = await fetch(url, { ...init, headers, signal: controller.signal });
    if (!response.ok) {
      let message = `HTTP ${response.status}`;
      try { const body = await response.json(); message = body?.error?.message || message; } catch { /* non-JSON error */ }
      throw new Error(message);
    }
    return response;
  } finally { clearTimeout(timer); }
}

export async function listRemoteScripts(device: Device): Promise<Script[]> {
  const response = await request(`${device.apiUrl}/list-files`);
  const files = await response.json() as string[];
  return files.map((name) => ({ id: `remote-${name}`, name, content: '', tags: [], category: 'Remote', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), source: 'pico' }));
}

export async function executeOnPico(device: Device, content: string) {
  const url = `${device.picoUrl}/msg=${encodeURIComponent(content)}`;
  await request(url, { method: 'GET' });
}

export async function checkDevice(device: Device): Promise<boolean> {
  try { await request(device.picoUrl, { method: 'GET' }); return true; } catch { return false; }
}

export type ManagedDevice = Device & {
  groupName?: string | null;
  tags: string[];
  lastSeen?: string | null;
  firmware?: string | null;
};

export type DeviceMetrics = {
  status: 'online' | 'offline' | 'unknown';
  firmware?: string | null;
  last_seen?: string | null;
  uptime_seconds?: number;
  free_memory?: number;
  temperature_c?: number;
  wifi_rssi?: number;
};

export async function listManagedDevices(filters?: { status?: string; group?: string; tag?: string; search?: string }): Promise<ManagedDevice[]> {
  const params = new URLSearchParams();
  Object.entries(filters || {}).forEach(([key, value]) => { if (value) params.set(key, value); });
  const query = params.toString();
  const response = await request(`${BACKEND_URL}/devices${query ? `?${query}` : ''}`);
  const data = await response.json() as Array<Record<string, unknown>>;
  return data.map((item) => ({
    id: String(item.id), name: String(item.name), picoUrl: String(item.pico_url), apiUrl: String(item.api_url),
    status: item.status as ManagedDevice['status'], groupName: item.group_name as string | null,
    tags: Array.isArray(item.tags) ? item.tags.map(String) : [], lastSeen: item.last_seen as string | null,
    firmware: item.firmware as string | null,
  }));
}

export async function getDeviceMetrics(deviceId: string): Promise<DeviceMetrics> {
  const response = await request(`${BACKEND_URL}/devices/${encodeURIComponent(deviceId)}/metrics`);
  return response.json() as Promise<DeviceMetrics>;
}

export async function createManagedDevice(input: { name: string; picoUrl: string; apiUrl: string; groupName?: string; tags?: string[] }) {
  const response = await request(`${BACKEND_URL}/devices`, { method: 'POST', body: JSON.stringify({ name: input.name, pico_url: input.picoUrl, api_url: input.apiUrl, group_name: input.groupName || null, tags: input.tags || [] }) });
  return response.json() as Promise<ManagedDevice>;
}

export async function updateManagedDevice(deviceId: string, input: Partial<{ name: string; picoUrl: string; apiUrl: string; groupName: string | null; tags: string[] }>) {
  const response = await request(`${BACKEND_URL}/devices/${encodeURIComponent(deviceId)}`, { method: 'PATCH', body: JSON.stringify({ name: input.name, pico_url: input.picoUrl, api_url: input.apiUrl, group_name: input.groupName, tags: input.tags }) });
  return response.json() as Promise<ManagedDevice>;
}

export async function deleteManagedDevice(deviceId: string) { await request(`${BACKEND_URL}/devices/${encodeURIComponent(deviceId)}`, { method: 'DELETE' }); }

export const backendCapabilities = {
  list: true, execute: true, read: false, upload: false, delete: false, telemetry: true, wifi: false,
  auth: true, websocket: false, deviceManagement: true, heartbeat: true, metrics: true, groups: true,
};
