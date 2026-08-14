import { backendCapabilities, checkDevice, createManagedDevice, deleteManagedDevice, executeOnPico, getDeviceMetrics, listManagedDevices, listRemoteScripts, updateManagedDevice } from '../src/api';
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

  it('maps managed devices and supports device metrics', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => [{ id: 'd2', name: 'Lab', pico_url: 'http://pico', api_url: 'http://api', status: 'online', group_name: 'lab', tags: ['test'], last_seen: '2026-08-14T10:00:00Z', firmware: '1.2.0' }] })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'online', temperature_c: 40.5, free_memory: 12000, wifi_rssi: -50, uptime_seconds: 12 }) });
    const devices = await listManagedDevices({ status: 'online', group: 'lab' });
    expect(devices[0]).toMatchObject({ id: 'd2', groupName: 'lab', tags: ['test'], firmware: '1.2.0' });
    expect(await getDeviceMetrics('d2')).toMatchObject({ temperature_c: 40.5, free_memory: 12000 });
    expect(mockFetch.mock.calls[0][0]).toContain('status=online');
  });

  it('creates, updates and deletes managed devices', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'd3', name: 'New', pico_url: 'http://pico', api_url: 'http://api', status: 'unknown', tags: [], group_name: null }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'd3', name: 'Updated', pico_url: 'http://pico', api_url: 'http://api', status: 'unknown', tags: ['lab'], group_name: 'lab' }) })
      .mockResolvedValueOnce({ ok: true });
    expect((await createManagedDevice({ name: 'New', picoUrl: 'http://pico', apiUrl: 'http://api' })).id).toBe('d3');
    expect((await updateManagedDevice('d3', { name: 'Updated', groupName: 'lab', tags: ['lab'] })).name).toBe('Updated');
    await expect(deleteManagedDevice('d3')).resolves.toBeUndefined();
  });

  it('documents the device-management capability boundary', () => {
    expect(backendCapabilities).toMatchObject({ list: true, execute: true, telemetry: true, auth: true, deviceManagement: true, heartbeat: true, metrics: true, groups: true });
  });
});
