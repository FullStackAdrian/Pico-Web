import AsyncStorage from '@react-native-async-storage/async-storage';
import { backendCapabilities, cancelJob, checkDevice, clearBackendAccessToken, createJob, createJobs, createManagedDevice, deleteManagedDevice, executeOnPico, getDeviceMetrics, getJob, listJobs, listManagedDevices, listRemoteScripts, setBackendAccessToken, updateManagedDevice } from '../src/api';
import type { Device } from '../src/models';

const device: Device = { id: 'd1', name: 'Test Pico', picoUrl: 'http://pico.local', apiUrl: 'http://api.local', status: 'unknown' };
const mockFetch = (globalThis as unknown as { fetch: jest.Mock }).fetch = jest.fn();

function okJson(body: unknown) { return { ok: true, status: 200, json: async () => body }; }

describe('api', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
    (AsyncStorage.removeItem as jest.Mock).mockResolvedValue(undefined);
  });

  it('stores and clears the backend access token', async () => {
    await setBackendAccessToken('token-123');
    await clearBackendAccessToken();
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('pico-web-access-token', 'token-123');
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('pico-web-access-token');
  });

  it('adds authentication and JSON headers to backend requests', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue('token-123');
    mockFetch.mockResolvedValue(okJson([]));
    await listManagedDevices();
    const options = mockFetch.mock.calls[0][1];
    expect(options.headers.get('Authorization')).toBe('Bearer token-123');
    expect(options.headers.get('Accept')).toBe('application/json');
  });

  it('adds content type when a request has a body', async () => {
    mockFetch.mockResolvedValue(okJson({ id: 'job-1', status: 'queued' }));
    await createJob({ scriptId: 'script-1', deviceId: 'd1' });
    const options = mockFetch.mock.calls[0][1];
    expect(options.method).toBe('POST');
    expect(options.headers.get('Content-Type')).toBe('application/json');
    expect(JSON.parse(options.body)).toEqual({ script_id: 'script-1', device_id: 'd1' });
  });

  it('lists remote scripts and maps them to typed scripts', async () => {
    mockFetch.mockResolvedValue(okJson(['hello.txt', 'wifi.ducky']));
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

  it('rejects non-success HTTP responses using the API error message', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 503, json: async () => ({ error: { message: 'Service unavailable' } }) });
    await expect(listRemoteScripts(device)).rejects.toThrow('Service unavailable');
  });

  it('falls back to the HTTP status when an error response is not JSON', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 503, json: async () => { throw new Error('not json'); } });
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

  it('maps managed devices, filters, metrics and malformed tags', async () => {
    mockFetch
      .mockResolvedValueOnce(okJson([{ id: 'd2', name: 'Lab', pico_url: 'http://pico', api_url: 'http://api', status: 'online', group_name: 'lab', tags: ['test'], last_seen: '2026-08-14T10:00:00Z', firmware: '1.2.0' }]))
      .mockResolvedValueOnce(okJson({ status: 'online', temperature_c: 40.5, free_memory: 12000, wifi_rssi: -50, uptime_seconds: 12 }));
    const devices = await listManagedDevices({ status: 'online', group: 'lab', tag: 'test', search: 'Lab' });
    expect(devices[0]).toMatchObject({ id: 'd2', groupName: 'lab', tags: ['test'], firmware: '1.2.0' });
    expect(await getDeviceMetrics('d2')).toMatchObject({ temperature_c: 40.5, free_memory: 12000 });
    expect(mockFetch.mock.calls[0][0]).toContain('status=online');
    expect(mockFetch.mock.calls[0][0]).toContain('tag=test');
  });

  it('lists managed devices without filters', async () => {
    mockFetch.mockResolvedValue(okJson([]));
    await expect(listManagedDevices()).resolves.toEqual([]);
    expect(mockFetch.mock.calls[0][0]).toBe('http://localhost:8000/api/v1/devices');
  });

  it('maps missing backend tags to an empty list', async () => {
    mockFetch.mockResolvedValue(okJson([{ id: 'd4', name: 'No tags', pico_url: 'http://pico', api_url: 'http://api', status: 'unknown', tags: null }]));
    await expect(listManagedDevices()).resolves.toEqual([expect.objectContaining({ tags: [] })]);
  });

  it('creates, updates and deletes managed devices', async () => {
    mockFetch
      .mockResolvedValueOnce(okJson({ id: 'd3', name: 'New', pico_url: 'http://pico', api_url: 'http://api', status: 'unknown', tags: [], group_name: null }))
      .mockResolvedValueOnce(okJson({ id: 'd3', name: 'Updated', pico_url: 'http://pico', api_url: 'http://api', status: 'unknown', tags: ['lab'], group_name: 'lab' }))
      .mockResolvedValueOnce({ ok: true, status: 204 });
    expect((await createManagedDevice({ name: 'New', picoUrl: 'http://pico', apiUrl: 'http://api' })).id).toBe('d3');
    expect((await updateManagedDevice('d3', { name: 'Updated', groupName: 'lab', tags: ['lab'] })).name).toBe('Updated');
    await expect(deleteManagedDevice('d3')).resolves.toBeUndefined();
  });

  it('creates a single job and normalizes an omitted device id', async () => {
    const job = { id: 'job-1', script_id: 'script-1', device_id: null, status: 'queued' };
    mockFetch.mockResolvedValue(okJson(job));
    await expect(createJob({ scriptId: 'script-1' })).resolves.toEqual(job);
    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({ script_id: 'script-1', device_id: null });
  });

  it('creates a batch of jobs', async () => {
    const jobs = [{ id: 'job-1', script_id: 's1', status: 'queued' }, { id: 'job-2', script_id: 's2', status: 'queued' }];
    mockFetch.mockResolvedValue(okJson({ jobs }));
    await expect(createJobs(['s1', 's2'], 'd1')).resolves.toEqual(jobs);
    expect(mockFetch.mock.calls[0][0]).toContain('/jobs/batch');
  });

  it('lists and retrieves jobs', async () => {
    const job = { id: 'job-1', script_id: 's1', status: 'succeeded' };
    mockFetch.mockResolvedValueOnce(okJson([job])).mockResolvedValueOnce(okJson(job));
    await expect(listJobs()).resolves.toEqual([job]);
    await expect(getJob('job/1')).resolves.toEqual(job);
    expect(mockFetch.mock.calls[1][0]).toContain('/jobs/job%2F1');
  });

  it('cancels a job', async () => {
    const job = { id: 'job-1', script_id: 's1', status: 'cancelled' };
    mockFetch.mockResolvedValue(okJson(job));
    await expect(cancelJob('job-1')).resolves.toEqual(job);
    expect(mockFetch.mock.calls[0][1]).toEqual(expect.objectContaining({ method: 'POST' }));
  });

  it('documents the device and job capability boundary', () => {
    expect(backendCapabilities).toMatchObject({
      list: true, execute: true, telemetry: true, auth: true, websocket: true,
      jobs: true, queue: true, multipleExecution: true, jobHistory: true,
      deviceManagement: true, heartbeat: true, metrics: true, groups: true,
    });
  });
});
