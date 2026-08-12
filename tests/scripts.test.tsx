import { fireEvent, render, waitFor } from '@testing-library/react-native';
import Scripts from '../app/(tabs)/scripts';
import { loadState, saveState, newScript } from '../src/storage';
import { executeOnPico, listRemoteScripts } from '../src/api';

jest.mock('../src/storage', () => ({ loadState: jest.fn(), saveState: jest.fn(), newScript: jest.fn(() => ({ id: 'new', name: 'New payload', content: '', tags: [], category: 'Uncategorized', createdAt: '2026-01-01', updatedAt: '2026-01-01', source: 'local' })) }));
jest.mock('../src/api', () => ({ executeOnPico: jest.fn(), listRemoteScripts: jest.fn() }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

const base = { scripts: [{ id: 's1', name: 'WiFi setup', content: 'STRING wifi', tags: ['wifi', 'setup'], category: 'Network', createdAt: '2026-01-01', updatedAt: '2026-01-01', source: 'local' }, { id: 's2', name: 'Remote payload', content: 'STRING remote', tags: ['remote'], category: 'Remote', createdAt: '2026-01-01', updatedAt: '2026-01-01', source: 'pico' }], executions: [], payloads: [], devices: [{ id: 'd1', name: 'Pico', picoUrl: 'http://pico', apiUrl: 'http://api', status: 'online' }], activeDeviceId: 'd1' };
const mockedLoad = loadState as jest.Mock;
const mockedSave = saveState as jest.Mock;

const remotePayload = { id: 'remote-x', name: 'Remote x', content: '', tags: [], category: 'Remote', createdAt: '2026', updatedAt: '2026', source: 'pico' };

describe('Scripts library', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedLoad.mockResolvedValue(structuredClone(base));
    (listRemoteScripts as jest.Mock).mockResolvedValue([]);
  });

  it('loads remote scripts and displays local and remote entries', async () => {
    (listRemoteScripts as jest.Mock).mockResolvedValue([remotePayload]);
    const { getByText } = render(<Scripts />);
    await waitFor(() => {
      expect(getByText('WiFi setup')).toBeTruthy();
      expect(getByText('Remote x')).toBeTruthy();
    });
    expect(mockedSave).toHaveBeenCalled();
  });

  it('filters scripts by name and tags', async () => {
    const { getByPlaceholderText, findByText, queryByText, getByText } = render(<Scripts />);
    expect(await findByText('WiFi setup')).toBeTruthy();
    fireEvent.changeText(getByPlaceholderText('Search scripts, tags…'), 'wifi');
    expect(getByText('WiFi setup')).toBeTruthy();
    expect(queryByText('Remote payload')).toBeNull();
  });

  it('creates and saves a local script', async () => {
    const { findByText, getByText } = render(<Scripts />);
    expect(await findByText('WiFi setup')).toBeTruthy();
    fireEvent.press(getByText('＋'));
    await waitFor(() => expect(newScript).toHaveBeenCalled());
    expect(mockedSave).toHaveBeenCalled();
  });

  it('records a successful execution', async () => {
    (executeOnPico as jest.Mock).mockResolvedValue(undefined);
    const { findByText, getByText } = render(<Scripts />);
    expect(await findByText('WiFi setup')).toBeTruthy();
    fireEvent.press(getByText('▶'));
    await waitFor(() => expect(executeOnPico).toHaveBeenCalledWith(expect.objectContaining({ id: 'd1' }), 'STRING wifi'));
    const saved = mockedSave.mock.calls.at(-1)[0];
    expect(saved.executions[0]).toMatchObject({ scriptId: 's1', success: true, scriptName: 'WiFi setup' });
  });

  it('records a failed execution', async () => {
    (executeOnPico as jest.Mock).mockRejectedValue(new Error('offline'));
    const { findByText, getByText } = render(<Scripts />);
    expect(await findByText('WiFi setup')).toBeTruthy();
    fireEvent.press(getByText('▶'));
    await waitFor(() => expect(executeOnPico).toHaveBeenCalled());
    const saved = mockedSave.mock.calls.at(-1)[0];
    expect(saved.executions[0]).toMatchObject({ success: false, error: 'Error: offline' });
  });

  it('does not execute an empty script', async () => {
    mockedLoad.mockResolvedValue({ ...structuredClone(base), scripts: [{ ...base.scripts[0], content: '' }] });
    const { findByText, getByText } = render(<Scripts />);
    expect(await findByText('WiFi setup')).toBeTruthy();
    fireEvent.press(getByText('▶'));
    expect(executeOnPico).not.toHaveBeenCalled();
  });

  it('does not delete remote scripts', async () => {
    (listRemoteScripts as jest.Mock).mockResolvedValue([{ ...base.scripts[1] }]);
    const { findByText, getAllByText } = render(<Scripts />);
    expect(await findByText('Remote payload')).toBeTruthy();
    const deleteButtons = getAllByText('×');
    fireEvent.press(deleteButtons[1]);
    expect(mockedSave).toHaveBeenCalledTimes(1);
  });
});
