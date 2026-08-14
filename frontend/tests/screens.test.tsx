import { render, waitFor } from '@testing-library/react-native';
import Dashboard from '../app/(tabs)/index';
import History from '../app/(tabs)/history';
import DeviceScreen from '../app/(tabs)/device';
import { loadState } from '../src/storage';
import { checkDevice } from '../src/api';

jest.mock('../src/storage', () => ({ loadState: jest.fn(), saveState: jest.fn() }));
jest.mock('../src/api', () => ({ checkDevice: jest.fn(), listRemoteScripts: jest.fn(), executeOnPico: jest.fn() }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

const mockedLoad = loadState as jest.Mock;
const mockedCheck = checkDevice as jest.Mock;

const state = {
  scripts: [{ id: 's1', name: 'Payload', content: 'STRING hi', tags: ['demo'], category: 'Test', createdAt: '2026-01-01', updatedAt: '2026-01-01', source: 'local' }],
  executions: [{ id: 'e1', scriptId: 's1', scriptName: 'Payload', startedAt: '2026-01-01T12:00:00Z', durationMs: 42, success: true }],
  payloads: [{ id: 'p1', name: 'Demo', description: 'demo', tags: ['demo'] }],
  devices: [{ id: 'pico-local', name: 'Pico W', picoUrl: 'http://pico', apiUrl: 'http://api', status: 'unknown' }],
  activeDeviceId: 'pico-local',
};

describe('Dashboard', () => {
  it('renders loading before state is available', () => {
    mockedLoad.mockReturnValue(new Promise(() => undefined));
    const { getByText } = render(<Dashboard />);
    expect(getByText('Loading…')).toBeTruthy();
  });

  it('renders metrics and navigation actions', async () => {
    mockedLoad.mockResolvedValue(state);
    mockedCheck.mockResolvedValue(true);
    const { getByText } = render(<Dashboard />);
    await waitFor(() => expect(getByText('Control center')).toBeTruthy());
    expect(getByText('Pico reachable')).toBeTruthy();
    expect(getByText('Scripts')).toBeTruthy();
    expect(getByText('Executions')).toBeTruthy();
    expect(getByText('Successful')).toBeTruthy();
    expect(getByText('Payloads')).toBeTruthy();
  });
});

describe('History', () => {
  it('renders empty history', async () => {
    mockedLoad.mockResolvedValue({ ...state, executions: [] });
    const { getByText } = render(<History />);
    await waitFor(() => expect(getByText('No executions yet.')).toBeTruthy());
  });

  it('renders successful executions', async () => {
    mockedLoad.mockResolvedValue(state);
    const { getByText } = render(<History />);
    await waitFor(() => expect(getByText('Payload')).toBeTruthy());
    expect(getByText('OK')).toBeTruthy();
  });
});

describe('Device screen', () => {
  it('renders device connection controls', async () => {
    mockedLoad.mockResolvedValue(state);
    const { getByText, getByDisplayValue } = render(<DeviceScreen />);
    await waitFor(() => expect(getByText('Pico W')).toBeTruthy());
    expect(getByDisplayValue('http://pico')).toBeTruthy();
    expect(getByDisplayValue('http://api')).toBeTruthy();
    expect(getByText('Wi‑Fi configuration')).toBeTruthy();
    expect(getByText('Monitoring')).toBeTruthy();
  });
});
