import { backendCapabilities, checkDevice, executeOnPico, listRemoteScripts } from '../src/api';
import type { Device } from '../src/models';

const device: Device = { id: 'd1', name: 'Test Pico', picoUrl: 'http://pico.local', apiUrl: 'http://api.local', status: 'unknown' };
const mockFetch = (globalThis as unknown as { fetch: jest.Mock }).fetch = jest.fn();

describe('api', () => {
  beforeEach(() => mockFetch.mockReset());

  it('lists remote scripts and maps them to typed scripts', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ['hello.txt', 'wifi.ducky'] });
    const scripts = await listRemoteScripts(device);
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/list-files'), expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(scripts.map(s => s.name)).toEqual(['hello.txt', 'wifi.ducky']);
    expect(scripts.every(s => s.source === 'pico')).toBe(true);
  });

  it('executes encoded script content with GET', async () => {
    mockFetch.mockResolvedValue({ ok: true });
    await executeOnPico(device, 'STRING hello world');
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/msg=STRING%20hello%20world'), expect.objectContaining({ method: 'GET' }));
  });

  it('rejects non-success HTTP responses', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 503 });
    await expect(listRemoteScripts(device)).rejects.toThrow('HTTP 503');
  });

  it('reports a reachable device', async () => {
    mockFetch.mockResolvedValue({ ok: true });
    await expect(checkDevice(device)).resolves.toBe(true);
  });

  it('reports an unreachable device when fetch fails', async () => {
    mockFetch.mockRejectedValue(new Error('network'));
    await expect(checkDevice(device)).resolves.toBe(false);
  });

  it('reports an unreachable device on HTTP failure', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 });
    await expect(checkDevice(device)).resolves.toBe(false);
  });

  it('documents the minimal Pico capability boundary', () => {
    expect(backendCapabilities).toEqual({ list: true, execute: true, read: false, upload: false, delete: false, telemetry: false, wifi: false, auth: false, websocket: false });
  });
});
