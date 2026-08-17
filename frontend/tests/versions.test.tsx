import { fireEvent, render, waitFor } from '@testing-library/react-native';
import Versions from '../app/versions';
import { diffScriptVersions, listScriptVersions, rollbackScript } from '../src/api';

jest.mock('../src/api', () => ({
  listScriptVersions: jest.fn(),
  getScriptVersion: jest.fn(),
  diffScriptVersions: jest.fn(),
  rollbackScript: jest.fn(),
}));
jest.mock('expo-router', () => ({ useLocalSearchParams: jest.fn(() => ({ id: 's1' })), router: { back: jest.fn(), push: jest.fn() } }));

const versions = [
  { id: 'version-1', scriptId: 's1', version: 1, content: 'one\n', tags: [], category: 'cat', createdAt: '2026-08-17T10:00:00Z' },
  { id: 'version-2', scriptId: 's1', version: 2, content: 'one\ntwo\n', tags: [], category: 'cat', createdAt: '2026-08-17T11:00:00Z' },
];
const mockedList = listScriptVersions as jest.Mock;
const mockedDiff = diffScriptVersions as jest.Mock;
const mockedRollback = rollbackScript as jest.Mock;

describe('Versions screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedList.mockResolvedValue(structuredClone(versions));
  });

  it('lists script versions with their numbers', async () => {
    const { findByText } = render(<Versions />);
    expect(await findByText('Version 1')).toBeTruthy();
    expect(await findByText('Version 2')).toBeTruthy();
    expect(mockedList).toHaveBeenCalledWith('s1');
  });

  it('shows an error message when versions cannot be loaded', async () => {
    mockedList.mockRejectedValue(new Error('offline'));
    const { findByText } = render(<Versions />);
    expect(await findByText(/offline/)).toBeTruthy();
  });

  it('diffs two selected versions and renders added and removed lines', async () => {
    mockedDiff.mockResolvedValue({
      old: 'one\n', new: 'one\ntwo\n', changed: true,
      hunks: [{ type: 'insert', oldStart: 1, oldEnd: 1, newStart: 2, newEnd: 3, oldLines: [], newLines: ['two'] }],
    });
    const { findByText, getByText } = render(<Versions />);
    fireEvent.press(await findByText('Version 1'));
    fireEvent.press(getByText('Compare with version 2'));
    await waitFor(() => expect(mockedDiff).toHaveBeenCalledWith('s1', 1, 2));
    expect(await findByText('+ two')).toBeTruthy();
  });

  it('rolls back to the selected version', async () => {
    mockedRollback.mockResolvedValue({ id: 's1', currentVersion: 3 });
    const { findByText, getByText } = render(<Versions />);
    fireEvent.press(await findByText('Version 1'));
    fireEvent.press(getByText('Rollback'));
    await waitFor(() => expect(mockedRollback).toHaveBeenCalledWith('s1', 1));
  });
});