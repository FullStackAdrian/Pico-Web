import type { Device, Script } from './models';

const timeout = 6000;

async function request(url: string, init?: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
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

export const backendCapabilities = {
  list: true,
  execute: true,
  read: false,
  upload: false,
  delete: false,
  telemetry: false,
  wifi: false,
  auth: false,
  websocket: false,
};
