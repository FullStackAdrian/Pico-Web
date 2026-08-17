import AsyncStorage from '@react-native-async-storage/async-storage';
import { backendCapabilities, cancelJob, checkDevice, clearBackendAccessToken, createApiKey, createJob, createJobs, createManagedDevice, deleteManagedDevice, diffScriptVersions, executeOnPico, executeScriptVersion, getAuditLog, getDeviceMetrics, getJob, getMe, getScriptVersion, listApiKeys, listJobs, listManagedDevices, listPermissions, listRemoteScripts, listRoles, listSessions, listScriptVersions, listUsers, revokeAllSessions, revokeApiKey, revokeSession, rollbackScript, setBackendAccessToken, updateManagedDevice, updateUserRole } from '../src/api';
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
    const job = { id: 'job-1', script_id: 'script-1', device_id: null, script_version: null, status: 'queued', created_at: '2026-08-17T10:00:00Z', started_at: null, finished_at: null, error: null };
    mockFetch.mockResolvedValue(okJson(job));
    await expect(createJob({ scriptId: 'script-1' })).resolves.toEqual({ id: 'job-1', scriptId: 'script-1', deviceId: null, scriptVersion: null, status: 'queued', createdAt: '2026-08-17T10:00:00Z', startedAt: null, finishedAt: null, error: null });
    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({ script_id: 'script-1', device_id: null });
  });

  it('creates a batch of jobs', async () => {
    const jobs = [{ id: 'job-1', script_id: 's1', status: 'queued' }, { id: 'job-2', script_id: 's2', status: 'queued' }];
    mockFetch.mockResolvedValue(okJson({ jobs }));
    await expect(createJobs(['s1', 's2'], 'd1')).resolves.toMatchObject([{ id: 'job-1', scriptId: 's1', status: 'queued' }, { id: 'job-2', scriptId: 's2', status: 'queued' }]);
    expect(mockFetch.mock.calls[0][0]).toContain('/jobs/batch');
  });

  it('lists and retrieves jobs', async () => {
    const job = { id: 'job-1', script_id: 's1', status: 'succeeded', started_at: '2026-08-17T10:00:00Z' };
    mockFetch.mockResolvedValueOnce(okJson([job])).mockResolvedValueOnce(okJson(job));
    await expect(listJobs()).resolves.toMatchObject([{ id: 'job-1', scriptId: 's1', status: 'succeeded', startedAt: '2026-08-17T10:00:00Z' }]);
    await expect(getJob('job/1')).resolves.toMatchObject({ id: 'job-1', scriptId: 's1', startedAt: '2026-08-17T10:00:00Z' });
    expect(mockFetch.mock.calls[1][0]).toContain('/jobs/job%2F1');
  });

  it('cancels a job', async () => {
    const job = { id: 'job-1', script_id: 's1', status: 'cancelled' };
    mockFetch.mockResolvedValue(okJson(job));
    await expect(cancelJob('job-1')).resolves.toMatchObject({ id: 'job-1', scriptId: 's1', status: 'cancelled' });
    expect(mockFetch.mock.calls[0][1]).toEqual(expect.objectContaining({ method: 'POST' }));
  });

  it('lists and retrieves script versions', async () => {
    const version = { id: 'version-2', scriptId: 's1', version: 2, content: 'v2', tags: ['a'], category: 'cat', createdAt: '2026-08-17T10:00:00Z' };
    mockFetch.mockResolvedValueOnce(okJson([{ ...version, version: 1 }, version])).mockResolvedValueOnce(okJson(version));
    const versions = await listScriptVersions('s1');
    expect(versions.map(v => v.version)).toEqual([1, 2]);
    expect(versions[0]).toMatchObject({ scriptId: 's1', content: 'v2', createdAt: '2026-08-17T10:00:00Z' });
    expect(mockFetch.mock.calls[0][0]).toContain('/scripts/s1/versions');
    const single = await getScriptVersion('s1', 2);
    expect(single).toMatchObject({ version: 2, scriptId: 's1', content: 'v2' });
    expect(mockFetch.mock.calls[1][0]).toContain('/scripts/s1/versions/2');
  });

  it('computes a diff between versions and against the current state', async () => {
    const diff = { old: 'one\n', new: 'one\ntwo\n', changed: true, hunks: [{ type: 'insert', old_start: 1, old_end: 1, new_start: 2, new_end: 3, old_lines: [], new_lines: ['two'] }] };
    mockFetch.mockResolvedValueOnce(okJson(diff)).mockResolvedValueOnce(okJson(diff));
    const between = await diffScriptVersions('s1', 1, 2);
    expect(between.changed).toBe(true);
    expect(between.hunks[0].newLines).toEqual(['two']);
    expect(mockFetch.mock.calls[0][0]).toContain('/scripts/s1/diff?from=1&to=2');
    await diffScriptVersions('s1', 1);
    expect(mockFetch.mock.calls[1][0]).toContain('/scripts/s1/diff?from=1');
  });

  it('rolls a script back to a previous version', async () => {
    const rolled = { id: 's1', name: 'demo', content: 'v1', currentVersion: 3, tags: [], category: 'cat', source: 'local' };
    mockFetch.mockResolvedValue(okJson(rolled));
    const result = await rollbackScript('s1', 1);
    expect(result.currentVersion).toBe(3);
    expect(result.source).toBe('local');
    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({ version: 1 });
    expect(mockFetch.mock.calls[0][1].method).toBe('POST');
    expect(mockFetch.mock.calls[0][0]).toContain('/scripts/s1/rollback');
  });

  it('maps version snapshots with missing optional fields', async () => {
    mockFetch.mockResolvedValue(okJson([{ id: 'v1', scriptId: 's1', version: 1, content: 'c', tags: null, category: 'cat', createdAt: '2026-08-17T10:00:00Z' }]));
    const [version] = await listScriptVersions('s1');
    expect(version.tags).toEqual([]);
  });

  it('maps diffs with missing hunks and line arrays', async () => {
    mockFetch
      .mockResolvedValueOnce(okJson({ old: 'a', new: 'b', changed: true, hunks: null }))
      .mockResolvedValueOnce(okJson({ old: 'a', new: 'b', changed: true, hunks: [{ type: 'replace', old_start: 1, old_end: 1, new_start: 1, new_end: 1, old_lines: null, new_lines: null }] }));
    await expect(diffScriptVersions('s1', 1)).resolves.toMatchObject({ hunks: [] });
    const diff = await diffScriptVersions('s1', 1, 2);
    expect(diff.hunks[0]).toMatchObject({ oldLines: [], newLines: [] });
  });

  it('maps a pico-sourced script rollback without a current version', async () => {
    mockFetch.mockResolvedValue(okJson({ id: 's1', name: 'n', content: 'c', tags: null, category: 'cat', source: 'pico' }));
    const script = await rollbackScript('s1', 1);
    expect(script.source).toBe('pico');
    expect(script.tags).toEqual([]);
    expect(script.currentVersion).toBeUndefined();
  });

  it('executes a script with an optional pinned version', async () => {
    const job = { id: 'job-1', script_id: 's1', script_version: 1, status: 'queued' };
    mockFetch.mockResolvedValueOnce(okJson(job)).mockResolvedValueOnce(okJson({ ...job, script_version: null }));
    const pinned = await executeScriptVersion('s1', 1);
    expect(pinned.scriptVersion).toBe(1);
    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({ version: 1 });
    const latest = await executeScriptVersion('s1');
    expect(latest.scriptVersion).toBeNull();
    expect(JSON.parse(mockFetch.mock.calls[1][1].body)).toEqual({ version: null });
  });

  it('documents the device and job capability boundary', () => {
    expect(backendCapabilities).toMatchObject({
      list: true, execute: true, telemetry: true, auth: true, websocket: true,
      jobs: true, queue: true, multipleExecution: true, jobHistory: true,
      scriptVersions: true, scriptDiff: true, scriptRollback: true, scriptVersionExecution: true,
      rbac: true, sessions: true, apiKeys: true, audit: true, rateLimiting: true,
      deviceManagement: true, heartbeat: true, metrics: true, groups: true,
    });
  });

  it('returns the authenticated principal with permissions', async () => {
    mockFetch.mockResolvedValue(okJson({ id: 7, username: 'alice', role: 'admin', permissions: ['devices.read', 'devices.write'] }));
    const me = await getMe();
    expect(me).toEqual({ id: 7, username: 'alice', role: 'admin', permissions: ['devices.read', 'devices.write'] });
  });

  it('maps missing optional security fields to nulls and empty arrays', async () => {
    mockFetch
      .mockResolvedValueOnce(okJson({ id: 7, username: 'alice', role: 'user' }))
      .mockResolvedValueOnce(okJson([{ id: 's1', user_id: 7, created_at: null, expires_at: null, last_used_at: null, ip: null, user_agent: null, active: false }]))
      .mockResolvedValueOnce(okJson([{ id: 'k1', name: 'k', description: null, prefix: null, scopes: null, created_at: null, expires_at: null, last_used_at: null, revoked_at: null }]))
      .mockResolvedValueOnce(okJson([{ id: 1, username: 'u', role: 'v', roles: null, is_active: false, created_at: null }]))
      .mockResolvedValueOnce(okJson({ entries: [{ id: 1, user: null, api_key_id: null, action: 'X', resource: null, resource_id: null, success: false, ip: null, user_agent: null, created_at: null }], total: 0, limit: 10, offset: 0 }));
    const me = await getMe();
    expect(me.permissions).toEqual([]);
    const [session] = await listSessions();
    expect(session.createdAt).toBeNull();
    expect(session.active).toBe(false);
    const [key] = await listApiKeys();
    expect(key.scopes).toEqual([]);
    expect(key.prefix).toBe('');
    const [user] = await listUsers();
    expect(user.roles).toEqual([]);
    expect(user.isActive).toBe(false);
    const audit = await getAuditLog(10, 0);
    expect(audit.entries[0].user).toBeNull();
    expect(audit.total).toBe(0);
    expect(audit.offset).toBe(0);
  });

  it('maps a user with active status and full audit fields', async () => {
    mockFetch
      .mockResolvedValueOnce(okJson([{ id: 2, username: 'carol', role: 'operator', roles: ['operator'], is_active: true, created_at: '2026-08-17T10:00:00Z' }]))
      .mockResolvedValueOnce(okJson({ entries: [{ id: 2, user: 'carol', api_key_id: 'k1', action: 'API_KEY_CREATED', resource: 'api_keys', resource_id: 'k1', success: true, ip: '1.2.3.4', user_agent: 'jest', created_at: '2026-08-17T10:00:00Z' }], total: 1, limit: 10, offset: 0 }));
    const [user] = await listUsers();
    expect(user).toMatchObject({ id: 2, role: 'operator', roles: ['operator'], isActive: true });
    const audit = await getAuditLog();
    expect(audit.entries[0]).toMatchObject({ apiKeyId: 'k1', resourceId: 'k1', ip: '1.2.3.4', userAgent: 'jest' });
    expect(audit.limit).toBe(10);
  });

  it('lists and revokes sessions', async () => {
    const session = { id: 'session-1', user_id: 7, created_at: '2026-08-17T10:00:00Z', expires_at: '2026-09-01T10:00:00Z', last_used_at: '2026-08-17T10:05:00Z', ip: '127.0.0.1', user_agent: 'jest', active: true };
    mockFetch.mockResolvedValueOnce(okJson([session])).mockResolvedValueOnce({ ok: true, status: 204 }).mockResolvedValueOnce({ ok: true, status: 204 });
    const sessions = await listSessions();
    expect(sessions[0]).toMatchObject({ id: 'session-1', userId: 7, active: true, ip: '127.0.0.1' });
    await revokeSession('session-1');
    expect(mockFetch.mock.calls[1][0]).toContain('/auth/sessions/session-1');
    await revokeAllSessions();
    expect(mockFetch.mock.calls[2][0]).toContain('/auth/sessions/revoke-all');
  });

  it('creates, lists and revokes API keys without leaking the secret in listings', async () => {
    const created = { id: 'apikey-1', name: 'CI', description: '', prefix: 'pk_live_abc', scopes: ['scripts.read'], created_at: '2026-08-17T10:00:00Z', expires_at: null, last_used_at: null, revoked_at: null, key: 'pk_live_secret' };
    const listed = { ...created, key: undefined };
    mockFetch.mockResolvedValueOnce(okJson(created)).mockResolvedValueOnce(okJson([listed]));
    const apiKey = await createApiKey({ name: 'CI', scopes: ['scripts.read'] });
    expect(apiKey.key).toBe('pk_live_secret');
    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({ name: 'CI', description: '', scopes: ['scripts.read'] });
    const keys = await listApiKeys();
    expect(keys[0]).toMatchObject({ id: 'apikey-1', name: 'CI', scopes: ['scripts.read'] });
    mockFetch.mockResolvedValueOnce({ ok: true, status: 204 });
    await revokeApiKey('apikey-1');
    expect(mockFetch.mock.calls[2][0]).toContain('/api-keys/apikey-1');
  });

  it('lists and updates users', async () => {
    const user = { id: 3, username: 'bob', role: 'viewer', roles: [], is_active: true, created_at: '2026-08-17T10:00:00Z' };
    mockFetch.mockResolvedValueOnce(okJson([user])).mockResolvedValueOnce(okJson({ ...user, role: 'admin' }));
    const users = await listUsers();
    expect(users[0]).toMatchObject({ id: 3, username: 'bob', role: 'viewer', isActive: true });
    const updated = await updateUserRole(3, 'admin');
    expect(updated.role).toBe('admin');
    expect(JSON.parse(mockFetch.mock.calls[1][1].body)).toEqual({ role: 'admin' });
  });

  it('lists roles, permissions and the audit log', async () => {
    mockFetch
      .mockResolvedValueOnce(okJson([{ name: 'viewer', description: 'read only', permissions: ['devices.read'] }]))
      .mockResolvedValueOnce(okJson(['devices.read', 'devices.write']))
      .mockResolvedValueOnce(okJson({ entries: [{ id: 1, user: 'alice', action: 'DEVICE_CREATED', resource: 'devices', resource_id: 'device-1', success: true, ip: '127.0.0.1', user_agent: null, created_at: '2026-08-17T10:00:00Z' }], total: 1, limit: 50, offset: 0 }));
    const roles = await listRoles();
    expect(roles[0]).toMatchObject({ name: 'viewer', permissions: ['devices.read'] });
    expect(await listPermissions()).toEqual(['devices.read', 'devices.write']);
    const audit = await getAuditLog();
    expect(audit.entries[0]).toMatchObject({ id: 1, action: 'DEVICE_CREATED', resourceId: 'device-1' });
    expect(audit.total).toBe(1);
  });
});
