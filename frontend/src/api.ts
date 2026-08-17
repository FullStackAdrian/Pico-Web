import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Device, DiffHunk, Job, Script, ScriptDiff, ScriptVersion } from './models';

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

function mapJob(item: Record<string, unknown>): Job {
  return {
    id: String(item.id),
    scriptId: String(item.script_id),
    deviceId: item.device_id == null ? null : String(item.device_id),
    scriptVersion: item.script_version == null ? null : Number(item.script_version),
    status: item.status as Job['status'],
    createdAt: String(item.created_at),
    startedAt: item.started_at == null ? null : String(item.started_at),
    finishedAt: item.finished_at == null ? null : String(item.finished_at),
    error: item.error == null ? null : String(item.error),
  };
}

export async function createJob(input: { scriptId: string; deviceId?: string | null }): Promise<Job> {
  const response = await request(`${BACKEND_URL}/jobs`, { method: 'POST', body: JSON.stringify({ script_id: input.scriptId, device_id: input.deviceId || null }) });
  return mapJob(await response.json() as Record<string, unknown>);
}

export async function createJobs(scriptIds: string[], deviceId?: string | null): Promise<Job[]> {
  const response = await request(`${BACKEND_URL}/jobs/batch`, { method: 'POST', body: JSON.stringify({ script_ids: scriptIds, device_id: deviceId || null }) });
  const body = await response.json() as { jobs: Array<Record<string, unknown>> };
  return body.jobs.map(mapJob);
}

export async function listJobs(): Promise<Job[]> {
  const response = await request(`${BACKEND_URL}/jobs`);
  const data = await response.json() as Array<Record<string, unknown>>;
  return data.map(mapJob);
}

export async function getJob(jobId: string): Promise<Job> {
  const response = await request(`${BACKEND_URL}/jobs/${encodeURIComponent(jobId)}`);
  return mapJob(await response.json() as Record<string, unknown>);
}

export async function cancelJob(jobId: string): Promise<Job> {
  const response = await request(`${BACKEND_URL}/jobs/${encodeURIComponent(jobId)}/cancel`, { method: 'POST' });
  return mapJob(await response.json() as Record<string, unknown>);
}

function mapScriptVersion(item: Record<string, unknown>): ScriptVersion {
  return {
    id: String(item.id),
    scriptId: String(item.scriptId),
    version: Number(item.version),
    content: String(item.content),
    tags: Array.isArray(item.tags) ? item.tags.map(String) : [],
    category: String(item.category),
    createdAt: String(item.createdAt),
  };
}

function mapScript(item: Record<string, unknown>): Script {
  return {
    id: String(item.id),
    name: String(item.name),
    content: String(item.content),
    tags: Array.isArray(item.tags) ? item.tags.map(String) : [],
    category: String(item.category),
    currentVersion: item.currentVersion === undefined ? undefined : Number(item.currentVersion),
    createdAt: String(item.createdAt),
    updatedAt: String(item.updatedAt),
    source: item.source === 'pico' ? 'pico' : 'local',
  };
}

function mapDiffHunk(item: Record<string, unknown>): DiffHunk {
  return {
    type: item.type as DiffHunk['type'],
    oldStart: Number(item.old_start),
    oldEnd: Number(item.old_end),
    newStart: Number(item.new_start),
    newEnd: Number(item.new_end),
    oldLines: Array.isArray(item.old_lines) ? item.old_lines.map(String) : [],
    newLines: Array.isArray(item.new_lines) ? item.new_lines.map(String) : [],
  };
}

export async function listScriptVersions(scriptId: string): Promise<ScriptVersion[]> {
  const response = await request(`${BACKEND_URL}/scripts/${encodeURIComponent(scriptId)}/versions`);
  const data = await response.json() as Array<Record<string, unknown>>;
  return data.map(mapScriptVersion);
}

export async function getScriptVersion(scriptId: string, version: number): Promise<ScriptVersion> {
  const response = await request(`${BACKEND_URL}/scripts/${encodeURIComponent(scriptId)}/versions/${version}`);
  return mapScriptVersion(await response.json() as Record<string, unknown>);
}

export async function diffScriptVersions(scriptId: string, fromVersion: number, toVersion?: number): Promise<ScriptDiff> {
  const query = toVersion === undefined ? `?from=${fromVersion}` : `?from=${fromVersion}&to=${toVersion}`;
  const response = await request(`${BACKEND_URL}/scripts/${encodeURIComponent(scriptId)}/diff${query}`);
  const data = await response.json() as Record<string, unknown>;
  return {
    old: String(data.old),
    new: String(data.new),
    changed: Boolean(data.changed),
    hunks: Array.isArray(data.hunks) ? data.hunks.map((hunk) => mapDiffHunk(hunk as Record<string, unknown>)) : [],
  };
}

export async function rollbackScript(scriptId: string, version: number): Promise<Script> {
  const response = await request(`${BACKEND_URL}/scripts/${encodeURIComponent(scriptId)}/rollback`, { method: 'POST', body: JSON.stringify({ version }) });
  return mapScript(await response.json() as Record<string, unknown>);
}

export async function executeScriptVersion(scriptId: string, version?: number): Promise<Job> {
  const response = await request(`${BACKEND_URL}/scripts/${encodeURIComponent(scriptId)}/execute`, { method: 'POST', body: JSON.stringify({ version: version ?? null }) });
  return mapJob(await response.json() as Record<string, unknown>);
}

export const backendCapabilities = {
  list: true, execute: true, read: false, upload: false, delete: false, telemetry: true, wifi: false,
  auth: true, websocket: true, jobs: true, queue: true, multipleExecution: true, jobHistory: true,
  scriptVersions: true, scriptDiff: true, scriptRollback: true, scriptVersionExecution: true,
  deviceManagement: true, heartbeat: true, metrics: true, groups: true,
};
