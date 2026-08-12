import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadState, newScript, saveState } from '../src/storage';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

const storage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

describe('storage', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns the default state when nothing is stored', async () => {
    storage.getItem.mockResolvedValue(null);
    const state = await loadState();
    expect(state.scripts).toEqual([]);
    expect(state.executions).toEqual([]);
    expect(state.payloads).toEqual([]);
    expect(state.activeDeviceId).toBe('pico-local');
    expect(state.devices[0].status).toBe('unknown');
  });

  it('merges persisted state with defaults', async () => {
    storage.getItem.mockResolvedValue(JSON.stringify({ scripts: [{ id: '1' }], activeDeviceId: 'other' }));
    const state = await loadState();
    expect(state.scripts).toHaveLength(1);
    expect(state.activeDeviceId).toBe('other');
    expect(state.devices).toHaveLength(1);
  });

  it('falls back safely for malformed JSON', async () => {
    storage.getItem.mockResolvedValue('{broken');
    const state = await loadState();
    expect(state.scripts).toEqual([]);
    expect(state.activeDeviceId).toBe('pico-local');
  });

  it('persists complete state as JSON', async () => {
    const state = await loadState();
    await saveState(state);
    expect(storage.setItem).toHaveBeenCalledWith('pico-web-state-v1', JSON.stringify(state));
  });

  it('creates a local script with defaults', () => {
    const script = newScript();
    expect(script.name).toBe('New payload');
    expect(script.id).toMatch(/^local-/);
    expect(script.source).toBe('local');
    expect(script.category).toBe('Uncategorized');
    expect(script.content).toBe('');
    expect(script.createdAt).toBe(script.updatedAt);
  });

  it('accepts a custom script name', () => {
    expect(newScript('WiFi setup').name).toBe('WiFi setup');
  });
});
