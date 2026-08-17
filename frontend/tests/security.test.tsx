import { fireEvent, render, waitFor } from '@testing-library/react-native';
import Security from '../app/security';
import { createApiKey, getMe, listApiKeys, listSessions, revokeAllSessions, revokeSession, updateUserRole } from '../src/api';

jest.mock('../src/api', () => ({
  getMe: jest.fn(),
  listSessions: jest.fn(),
  revokeSession: jest.fn(),
  revokeAllSessions: jest.fn(),
  listApiKeys: jest.fn(),
  createApiKey: jest.fn(),
  revokeApiKey: jest.fn(),
  listUsers: jest.fn(),
  updateUserRole: jest.fn(),
  listRoles: jest.fn(),
  listPermissions: jest.fn(),
  getAuditLog: jest.fn(),
}));
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() } }));

const adminPrincipal = { id: 1, username: 'admin', role: 'admin', permissions: ['users.manage', 'audit.read', 'api_keys.manage'] };
const sessions = [{ id: 'session-1', userId: 1, createdAt: '2026-08-17T10:00:00Z', expiresAt: null, lastUsedAt: '2026-08-17T10:05:00Z', ip: '127.0.0.1', userAgent: 'MacBook', active: true }];
const apiKeys = [{ id: 'apikey-1', name: 'CI', description: '', prefix: 'pk_live_abc', scopes: ['scripts.read'], createdAt: '2026-08-17T10:00:00Z', expiresAt: null, lastUsedAt: null, revokedAt: null }];
const users = [{ id: 2, username: 'bob', role: 'viewer', roles: [], isActive: true, createdAt: null }];

describe('Security screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getMe as jest.Mock).mockResolvedValue(adminPrincipal);
    (listSessions as jest.Mock).mockResolvedValue(sessions);
    (listApiKeys as jest.Mock).mockResolvedValue(apiKeys);
  });

  it('renders the principal, sessions and API keys', async () => {
    const { findByText, getByText } = render(<Security />);
    expect(await findByText('admin')).toBeTruthy();
    expect(getByText(/Active role: admin/)).toBeTruthy();
    expect(getByText('MacBook')).toBeTruthy();
    expect(getByText('CI')).toBeTruthy();
  });

  it('revokes an active session', async () => {
    (revokeSession as jest.Mock).mockResolvedValue(undefined);
    const { findByText, getAllByText, getByText } = render(<Security />);
    await findByText('MacBook');
    fireEvent.press(getAllByText('Revoke')[0]);
    await waitFor(() => expect(revokeSession).toHaveBeenCalledWith('session-1'));
    expect(getByText('Revoke all sessions')).toBeTruthy();
  });

  it('revokes all sessions', async () => {
    (revokeAllSessions as jest.Mock).mockResolvedValue(undefined);
    const { findByText } = render(<Security />);
    fireEvent.press(await findByText('Revoke all sessions'));
    await waitFor(() => expect(revokeAllSessions).toHaveBeenCalled());
  });

  it('creates an API key with the typed name', async () => {
    (createApiKey as jest.Mock).mockResolvedValue({ ...apiKeys[0], key: 'pk_live_secret' });
    const { findByPlaceholderText, getByText } = render(<Security />);
    const input = await findByPlaceholderText('New API key name');
    fireEvent.changeText(input, 'Deploy key');
    fireEvent.press(getByText('Create API key'));
    await waitFor(() => expect(createApiKey).toHaveBeenCalledWith({ name: 'Deploy key', description: 'Created from the mobile app' }));
  });

  it('loads and edits users when the principal is an admin', async () => {
    const mockedApi = require('../src/api');
    (mockedApi.listUsers as jest.Mock).mockResolvedValue(users);
    (mockedApi.updateUserRole as jest.Mock).mockResolvedValue({ ...users[0], role: 'operator' });
    const { findByText, getByText, getByPlaceholderText } = render(<Security />);
    fireEvent.press(await findByText('Load users, roles, permissions and audit'));
    expect(await findByText('bob')).toBeTruthy();
    fireEvent.changeText(getByPlaceholderText('role'), 'operator');
    fireEvent.press(getByText('Set'));
    await waitFor(() => expect(updateUserRole).toHaveBeenCalledWith(2, 'operator'));
  });
});