import { fireEvent, render, waitFor } from '@testing-library/react-native';
import Editor from '../app/editor';
import { loadState, saveState, newScript } from '../src/storage';

jest.mock('../src/storage', () => ({ loadState: jest.fn(), saveState: jest.fn(), newScript: jest.fn(() => ({ id: 'local-new', name: 'New payload', content: '', tags: [], category: 'Uncategorized', createdAt: '2026-01-01', updatedAt: '2026-01-01', source: 'local' })) }));
jest.mock('expo-router', () => ({ useLocalSearchParams: jest.fn(() => ({ id: 's1' })), router: { back: jest.fn(), push: jest.fn() } }));

const state = { scripts: [{ id: 's1', name: 'Old name', content: 'STRING old', tags: ['old'], category: 'Demo', createdAt: '2026-01-01', updatedAt: '2026-01-01', source: 'local' }], executions: [], payloads: [], devices: [], activeDeviceId: '' };
const mockedLoad = loadState as jest.Mock;
const mockedSave = saveState as jest.Mock;

describe('Editor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedLoad.mockResolvedValue(structuredClone(state));
    (require('expo-router').useLocalSearchParams as jest.Mock).mockReturnValue({ id: 's1' });
  });

  it('renders the existing script', async () => {
    const { getByDisplayValue, getByText } = render(<Editor />);
    await waitFor(() => expect(getByText('Old name')).toBeTruthy());
    expect(getByDisplayValue('STRING old')).toBeTruthy();
    expect(getByDisplayValue('Demo')).toBeTruthy();
    expect(getByDisplayValue('old')).toBeTruthy();
  });

  it('updates name, category, tags and content and persists them', async () => {
    const { getByDisplayValue, getByText } = render(<Editor />);
    await waitFor(() => expect(getByText('Old name')).toBeTruthy());
    fireEvent.changeText(getByDisplayValue('Old name'), ' New name ');
    fireEvent.changeText(getByDisplayValue('Demo'), ' Utilities ');
    fireEvent.changeText(getByDisplayValue('old'), 'one, two, ');
    fireEvent.changeText(getByDisplayValue('STRING old'), 'STRING new');
    fireEvent.press(getByText('Save locally'));
    await waitFor(() => expect(mockedSave).toHaveBeenCalled());
    const saved = mockedSave.mock.calls.at(-1)[0];
    expect(saved.scripts[0]).toMatchObject({ name: 'New name', category: 'Utilities', tags: ['one', 'two'], content: 'STRING new', source: 'local' });
  });

  it('creates a script when the requested id does not exist', async () => {
    const router = require('expo-router');
    router.useLocalSearchParams.mockReturnValue({ id: 'missing' });
    mockedLoad.mockResolvedValue({ ...structuredClone(state), scripts: [] });
    render(<Editor />);
    await waitFor(() => expect(newScript).toHaveBeenCalled());
    expect(mockedSave).toHaveBeenCalled();
  });

  it('navigates to the versions screen for the current script', async () => {
    const { getByText } = render(<Editor />);
    await waitFor(() => expect(getByText('Old name')).toBeTruthy());
    fireEvent.press(getByText('Versions'));
    const router = require('expo-router');
    expect(router.router.push).toHaveBeenCalledWith({ pathname: '/versions', params: { id: 's1' } });
  });
});
