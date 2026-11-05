import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  platform: { OS: 'web' },
  get: vi.fn(), set: vi.fn(), remove: vi.fn(),
}));
vi.mock('react-native', () => ({ Platform: mocks.platform }));
vi.mock('expo-secure-store', () => ({
  getItemAsync: mocks.get, setItemAsync: mocks.set, deleteItemAsync: mocks.remove,
}));

const base = 'https://api.example.test/api';
const session = {
  id: 'user-id', name: 'Cook', email: 'cook@example.test', role: 'chef',
  requiresRoleSelection: false, token: 'access', expiresIn: 900,
};
const json = (body: object, status = 200) => Response.json(body, { status });
let fetchMock = vi.fn<typeof fetch>();

async function setup(os = 'web') {
  mocks.platform.OS = os;
  const module = await import('./session');
  fetchMock.mockResolvedValueOnce(json({ message: 'No saved session' }, 401));
  if (os !== 'web') mocks.get.mockResolvedValue(null);
  await module.authTokenStorage.get(base);
  fetchMock.mockReset();
  return module;
}

describe('persistent Cognito sessions', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.set.mockResolvedValue(undefined);
    mocks.remove.mockResolvedValue(undefined);
    fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

  it('restores a browser session by refreshing its HttpOnly cookie without reading browser token storage', async () => {
    mocks.platform.OS = 'web';
    const { authTokenStorage } = await import('./session');
    fetchMock.mockResolvedValue(json(session));
    expect(JSON.parse((await authTokenStorage.get(base))!)).toMatchObject(session);
    expect(fetchMock).toHaveBeenCalledWith(`${base}/auth/refresh`, expect.objectContaining({
      credentials: 'include', body: '{}',
      headers: expect.objectContaining({ 'X-AfroChop-Client': 'web' }),
    }));
    expect(mocks.get).not.toHaveBeenCalled();
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it('persists only the refresh token on native devices, never passwords or access tokens', async () => {
    const { authTokenStorage } = await setup('ios');
    await authTokenStorage.set(JSON.stringify({ ...session, refreshToken: 'native-refresh' }));
    expect(mocks.set).toHaveBeenCalledExactlyOnceWith('afrochop.cognito-refresh', 'native-refresh');
  });

  it('restores native sessions from SecureStore and persists the rotated token', async () => {
    mocks.platform.OS = 'android';
    const { authTokenStorage } = await import('./session');
    mocks.get.mockResolvedValue('stored-refresh');
    fetchMock.mockResolvedValue(json({ ...session, refreshToken: 'rotated-refresh' }));
    await authTokenStorage.get(base);
    expect(fetchMock).toHaveBeenCalledWith(`${base}/auth/refresh`, expect.objectContaining({
      body: JSON.stringify({ refreshToken: 'stored-refresh' }),
    }));
    expect(mocks.set).toHaveBeenCalledWith('afrochop.cognito-refresh', 'rotated-refresh');
    expect(mocks.remove).toHaveBeenCalledWith('afrochop.auth-token');
  });

  it('does not make a native refresh call if no refresh token is saved', async () => {
    const { authTokenStorage } = await setup('ios');
    expect(await authTokenStorage.get(base)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refreshes before expiry and coalesces concurrent protected requests', async () => {
    const { authTokenStorage, authenticatedFetch } = await setup();
    vi.useFakeTimers();
    await authTokenStorage.set(JSON.stringify(session));
    vi.setSystemTime(Date.now() + 850_000);
    fetchMock.mockImplementation(async (input) => String(input).endsWith('/auth/refresh')
      ? json({ ...session, token: 'renewed' }) : json({ ok: true }));
    await Promise.all([1, 2, 3].map(() => authenticatedFetch(`${base}/chefs/me/menu`, {
      headers: { Authorization: 'Bearer access' },
    })));
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/auth/refresh'))).toHaveLength(1);
    const protectedCalls = fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/menu'));
    expect(protectedCalls).toHaveLength(3);
    for (const [, init] of protectedCalls) {
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer renewed');
    }
  });

  it('renews and retries a rejected access token exactly once', async () => {
    const { authTokenStorage, authenticatedFetch } = await setup();
    await authTokenStorage.set(JSON.stringify(session));
    fetchMock.mockResolvedValueOnce(json({}, 401))
      .mockResolvedValueOnce(json({ ...session, token: 'renewed' }))
      .mockResolvedValueOnce(json({ ok: true }));
    expect((await authenticatedFetch(`${base}/messages`, { headers: { Authorization: 'Bearer old' } })).status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('keeps rotated credentials when a delayed role selection updates the account', async () => {
    const { authTokenStorage, authenticatedFetch, getCurrentSession } = await setup('ios');
    await authTokenStorage.set(JSON.stringify({ ...session, requiresRoleSelection: true, refreshToken: 'original-refresh' }));
    mocks.get.mockResolvedValue('original-refresh');
    fetchMock.mockResolvedValueOnce(json({}, 401))
      .mockResolvedValueOnce(json({ ...session, token: 'renewed', refreshToken: 'rotated-refresh' }))
      .mockResolvedValueOnce(json({ requiresRoleSelection: false }));
    await authenticatedFetch(`${base}/auth/me/role`, {
      method: 'POST', headers: { Authorization: 'Bearer access' },
    });
    await authTokenStorage.set(JSON.stringify({ ...await getCurrentSession(), requiresRoleSelection: false }));
    expect(await getCurrentSession()).toMatchObject({ token: 'renewed', refreshToken: 'rotated-refresh', requiresRoleSelection: false });
    expect(mocks.set).toHaveBeenLastCalledWith('afrochop.cognito-refresh', 'rotated-refresh');
  });

  it('does not retry or discard credentials when refresh fails due to a network/server error', async () => {
    const { authTokenStorage, authenticatedFetch } = await setup('ios');
    await authTokenStorage.set(JSON.stringify({ ...session, refreshToken: 'refresh' }));
    mocks.get.mockResolvedValue('refresh');
    mocks.remove.mockClear();
    fetchMock.mockResolvedValueOnce(json({}, 401)).mockResolvedValueOnce(json({}, 503));
    await expect(authenticatedFetch(`${base}/messages`, { headers: { Authorization: 'Bearer old' } }))
      .rejects.toThrow('Could not renew');
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it('clears a rejected native refresh session and does not issue the protected request again', async () => {
    const { authTokenStorage, authenticatedFetch } = await setup('ios');
    await authTokenStorage.set(JSON.stringify({ ...session, refreshToken: 'refresh' }));
    mocks.get.mockResolvedValue('refresh');
    fetchMock.mockResolvedValueOnce(json({}, 401)).mockResolvedValueOnce(json({}, 401));
    await expect(authenticatedFetch(`${base}/messages`, { headers: { Authorization: 'Bearer access' } }))
      .rejects.toThrow('session expired');
    expect(mocks.remove).toHaveBeenCalledWith('afrochop.cognito-refresh');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('refuses to send bearer credentials to another API', async () => {
    const { authTokenStorage, authenticatedFetch } = await setup();
    await authTokenStorage.set(JSON.stringify(session));
    await expect(authenticatedFetch('https://evil.example/api/messages', { headers: { Authorization: 'Bearer access' } }))
      .rejects.toThrow('different API');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('signs out remotely, clears native storage, and blocks further authenticated requests', async () => {
    const { authTokenStorage, getAccessToken } = await setup('ios');
    await authTokenStorage.set(JSON.stringify({ ...session, refreshToken: 'refresh' }));
    mocks.get.mockResolvedValue('refresh');
    fetchMock.mockResolvedValue(json({ message: 'Signed out' }));
    await authTokenStorage.remove();
    expect(fetchMock).toHaveBeenCalledWith(`${base}/auth/logout`, expect.objectContaining({
      body: JSON.stringify({ refreshToken: 'refresh' }),
    }));
    expect(mocks.remove).toHaveBeenCalledWith('afrochop.cognito-refresh');
    await expect(getAccessToken()).rejects.toThrow('session expired');
  });

  it('surfaces sign-out failure without claiming successful remote revocation', async () => {
    const { authTokenStorage } = await setup('ios');
    await authTokenStorage.set(JSON.stringify({ ...session, refreshToken: 'refresh' }));
    mocks.get.mockResolvedValue('refresh');
    mocks.remove.mockClear();
    fetchMock.mockResolvedValue(json({}, 503));
    await expect(authTokenStorage.remove()).rejects.toThrow('Could not revoke');
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it('rejects malformed or legacy login responses', async () => {
    const { authTokenStorage } = await setup();
    await expect(authTokenStorage.set(JSON.stringify({ token: 'legacy' }))).rejects.toThrow('invalid');
  });
});
