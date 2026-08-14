import { Alert } from 'react-native';
import { render, waitFor, fireEvent } from '@testing-library/react-native';
import Dashboard from '../app/(tabs)/index';
import History from '../app/(tabs)/history';
import DeviceScreen from '../app/(tabs)/device';
import { loadState } from '../src/storage';
import { checkDevice, listManagedDevices, getDeviceMetrics, createManagedDevice, updateManagedDevice, deleteManagedDevice } from '../src/api';

jest.mock('../src/storage', () => ({ loadState: jest.fn(), saveState: jest.fn() }));
jest.mock('../src/api', () => ({
  checkDevice: jest.fn(), listRemoteScripts: jest.fn(), executeOnPico: jest.fn(),
  listManagedDevices: jest.fn(), getDeviceMetrics: jest.fn(), createManagedDevice: jest.fn(),
  updateManagedDevice: jest.fn(), deleteManagedDevice: jest.fn(),
}));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

const mockedLoad = loadState as jest.Mock;
const mockedCheck = checkDevice as jest.Mock;
const mockedListDevices = listManagedDevices as jest.Mock;
const mockedMetrics = getDeviceMetrics as jest.Mock;
const mockedCreate = createManagedDevice as jest.Mock;
const mockedUpdate = updateManagedDevice as jest.Mock;
const mockedDelete = deleteManagedDevice as jest.Mock;

const state = {
  scripts: [{ id: 's1', name: 'Payload', content: 'STRING hi', tags: ['demo'], category: 'Test', createdAt: '2026-01-01', updatedAt: '2026-01-01', source: 'local' }],
  executions: [{ id: 'e1', scriptId: 's1', scriptName: 'Payload', startedAt: '2026-01-01T12:00:00Z', durationMs: 42, success: true }],
  payloads: [{ id: 'p1', name: 'Demo', description: 'demo', tags: ['demo'] }],
  devices: [{ id: 'pico-local', name: 'Pico W', picoUrl: 'http://pico', apiUrl: 'http://api', status: 'unknown' }],
  activeDeviceId: 'pico-local',
};

const managedDevice = {
  id: 'd1', name: 'Lab Pico', picoUrl: 'http://pico', apiUrl: 'http://api', status: 'online',
  groupName: 'lab', tags: ['test'], lastSeen: '2026-08-14T10:00:00Z', firmware: '1.2.0',
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

describe('Device dashboard', () => {
  beforeEach(() => {
    mockedListDevices.mockReset();
    mockedMetrics.mockReset();
    mockedCreate.mockReset();
    mockedUpdate.mockReset();
    mockedDelete.mockReset();
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders the fleet and loads metrics for the selected device', async () => {
    mockedListDevices.mockResolvedValue([managedDevice]);
    mockedMetrics.mockResolvedValue({ status: 'online', temperature_c: 41, free_memory: 12000, wifi_rssi: -48, uptime_seconds: 120 });
    const { getByText } = render(<DeviceScreen />);
    await waitFor(() => expect(getByText('Device dashboard')).toBeTruthy());
    expect(getByText('Lab Pico')).toBeTruthy();
    expect(getByText('ONLINE')).toBeTruthy();
    expect(getByText('#test')).toBeTruthy();
    await waitFor(() => expect(mockedMetrics).toHaveBeenCalledWith('d1'));
    expect(getByText('41°C')).toBeTruthy();
    expect(getByText('12000 B')).toBeTruthy();
    expect(getByText('-48 dBm')).toBeTruthy();
  });

  it('falls back to local devices when the backend is unavailable', async () => {
    mockedListDevices.mockRejectedValue(new Error('HTTP 503'));
    mockedLoad.mockResolvedValue(state);
    const { getByText } = render(<DeviceScreen />);
    await waitFor(() => expect(getByText('Backend unavailable')).toBeTruthy());
    expect(getByText('Pico W')).toBeTruthy();
    expect(getByText(/HTTP 503/)).toBeTruthy();
  });

  it('creates a device through the dashboard form', async () => {
    mockedListDevices.mockResolvedValue([]);
    mockedCreate.mockResolvedValue(managedDevice);
    const { getByText, getByPlaceholderText, getAllByPlaceholderText } = render(<DeviceScreen />);
    await waitFor(() => expect(getByText('Device dashboard')).toBeTruthy());
    fireEvent.press(getByText('＋ Add'));
    fireEvent.changeText(getByPlaceholderText('Name'), 'Lab Pico');
    fireEvent.changeText(getByPlaceholderText('Pico URL'), 'http://pico');
    fireEvent.changeText(getByPlaceholderText('API URL'), 'http://api');
    const groupInputs = getAllByPlaceholderText('Group');
    expect(groupInputs).toHaveLength(2);
    fireEvent.changeText(groupInputs[1], 'lab');
    fireEvent.changeText(getByPlaceholderText('Tags (comma separated)'), 'test, lab');
    fireEvent.press(getByText('Save'));
    await waitFor(() => expect(mockedCreate).toHaveBeenCalledWith(expect.objectContaining({ name: 'Lab Pico', groupName: 'lab', tags: ['test', 'lab'] })));
  });

  it('edits and deletes the selected device after confirming the destructive action', async () => {
    mockedListDevices.mockResolvedValue([managedDevice]);
    mockedMetrics.mockResolvedValue({ status: 'online' });
    mockedUpdate.mockResolvedValue({ ...managedDevice, name: 'Updated Pico' });
    mockedDelete.mockResolvedValue(undefined);
    const { getByText, getByDisplayValue } = render(<DeviceScreen />);
    await waitFor(() => expect(getByText('Lab Pico')).toBeTruthy());
    fireEvent.press(getByText('Edit'));
    expect(getByDisplayValue('Lab Pico')).toBeTruthy();
    fireEvent.changeText(getByDisplayValue('Lab Pico'), 'Updated Pico');
    fireEvent.press(getByText('Save'));
    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledWith('d1', expect.objectContaining({ name: 'Updated Pico' })));

    fireEvent.press(getByText('Delete'));
    const alertCalls = (Alert.alert as jest.Mock).mock.calls;
    const alertCall = alertCalls[alertCalls.length - 1];
    expect(alertCall?.[0]).toBe('Delete device');
    const actions = alertCall?.[2] as Array<{ text: string; onPress?: () => void }>;
    expect(actions?.map((action) => action.text)).toEqual(['Cancel', 'Delete']);
    await actions[1].onPress?.();
    await waitFor(() => expect(mockedDelete).toHaveBeenCalledWith('d1'));
  });
});
