import type { AppState, Device, Execution, Payload, Script } from '../src/models';

describe('domain models', () => {
  it('accepts a complete local script', () => {
    const script: Script = { id: 's', name: 'demo', content: 'STRING hi', tags: ['demo'], category: 'Test', createdAt: '2026-01-01', updatedAt: '2026-01-01', source: 'local' };
    expect(script.source).toBe('local');
  });

  it('supports Pico and local devices', () => {
    const device: Device = { id: 'd', name: 'Pico', picoUrl: 'http://pico', apiUrl: 'http://api', status: 'online' };
    expect(['online', 'offline', 'unknown']).toContain(device.status);
  });

  it('models successful and failed executions', () => {
    const ok: Execution = { id: 'e1', scriptId: 's', scriptName: 'demo', startedAt: '2026-01-01', durationMs: 10, success: true };
    const failed: Execution = { ...ok, id: 'e2', success: false, error: 'offline' };
    expect(ok.success).toBe(true);
    expect(failed.error).toBe('offline');
  });

  it('models payload metadata', () => {
    const payload: Payload = { id: 'p', name: 'Demo', description: 'test', tags: ['demo'] };
    expect(payload.tags).toContain('demo');
  });

  it('models the complete application state', () => {
    const state: AppState = { scripts: [], executions: [], payloads: [], devices: [], activeDeviceId: 'd' };
    expect(state.scripts).toEqual([]);
  });
});
