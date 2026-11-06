import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export type AccountRole = 'customer' | 'chef' | 'farmer';
export type AccountSession = {
  id: string; token: string; name: string; email: string;
  role: AccountRole | 'admin'; requiresRoleSelection: boolean;
  expiresIn: number; refreshToken?: string;
};

const refreshKey = 'afrochop.cognito-refresh';
const legacyKey = 'afrochop.auth-token';
let apiBase = '';
let current: AccountSession | null = null;
let expiresAt = 0;
let refreshing: Promise<AccountSession | null> | null = null;
let generation = 0;

export class SessionExpiredError extends Error {}

export function isAccountSession(value: unknown): value is AccountSession {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === 'string' && typeof item.token === 'string' &&
    typeof item.email === 'string' && typeof item.name === 'string' &&
    ['customer', 'chef', 'farmer', 'admin'].includes(String(item.role)) &&
    (item.role !== 'admin' || item.requiresRoleSelection === false) &&
    typeof item.requiresRoleSelection === 'boolean' &&
    typeof item.expiresIn === 'number' && item.expiresIn > 0 &&
    (item.refreshToken === undefined || typeof item.refreshToken === 'string');
}

export async function authRequest<T>(base: string, path: string, body: object): Promise<T> {
  const response = await globalThis.fetch(`${base}/auth/${path}`, {
    method: 'POST', credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-AfroChop-Client': Platform.OS === 'web' ? 'web' : 'native',
    },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) {
    const message = Array.isArray(result.message) ? result.message.join(' ') : result.message;
    throw new Error(message || `Authentication request failed (${response.status}).`);
  }
  return result;
}

async function save(session: AccountSession) {
  if (!isAccountSession(session)) throw new Error('The server returned an invalid marketplace session.');
  if (Platform.OS !== 'web') {
    if (!session.refreshToken) throw new Error('The server did not return a native refresh token.');
    await SecureStore.setItemAsync(refreshKey, session.refreshToken);
  }
  if (current?.token !== session.token) expiresAt = Date.now() + session.expiresIn * 1000;
  current = session;
}

async function refresh(): Promise<AccountSession | null> {
  if (refreshing) return refreshing;
  const startGeneration = generation;
  refreshing = (async () => {
    const refreshToken = Platform.OS === 'web' ? undefined : await SecureStore.getItemAsync(refreshKey);
    if (Platform.OS !== 'web' && !refreshToken) return null;
    const response = await globalThis.fetch(`${apiBase}/auth/refresh`, {
      method: 'POST', credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-AfroChop-Client': Platform.OS === 'web' ? 'web' : 'native',
      },
      body: JSON.stringify(refreshToken ? { refreshToken } : {}),
    });
    if (startGeneration !== generation) return null;
    if (response.status === 401) {
      current = null;
      if (Platform.OS !== 'web') await SecureStore.deleteItemAsync(refreshKey);
      return null;
    }
    const result: unknown = await response.json();
    if (!response.ok) throw new Error('Could not renew your session. Check your connection and try again.');
    if (!isAccountSession(result)) throw new Error('The server returned an invalid renewed session.');
    await save(result);
    return result;
  })().finally(() => { refreshing = null; });
  return refreshing;
}

export const authTokenStorage = {
  async get(base: string): Promise<string | null> {
    apiBase = base.replace(/\/$/, '');
    if (Platform.OS !== 'web') await SecureStore.deleteItemAsync(legacyKey);
    const session = await refresh();
    return session ? JSON.stringify(session) : null;
  },
  async set(serialized: string) {
    const session: unknown = JSON.parse(serialized);
    if (!isAccountSession(session)) throw new Error('The sign-in response is invalid. Please sign in again.');
    if (refreshing) await refreshing;
    generation += 1;
    await save(session);
  },
  async remove() {
    if (refreshing) await refreshing;
    const refreshToken = Platform.OS === 'web' ? undefined : await SecureStore.getItemAsync(refreshKey);
    const response = await globalThis.fetch(`${apiBase}/auth/logout`, {
      method: 'POST', credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-AfroChop-Client': Platform.OS === 'web' ? 'web' : 'native',
        ...(current ? { Authorization: `Bearer ${current.token}` } : {}),
      },
      body: JSON.stringify(refreshToken ? { refreshToken } : {}),
    });
    if (!response.ok && response.status !== 401) {
      throw new Error('Could not revoke your session. Check your connection and try signing out again.');
    }
    generation += 1;
    current = null;
    expiresAt = 0;
    if (Platform.OS !== 'web') {
      await SecureStore.deleteItemAsync(refreshKey);
      await SecureStore.deleteItemAsync(legacyKey);
    }
  },
};

export async function getAccessToken(): Promise<string> {
  if (!current) throw new SessionExpiredError('Your session expired. Sign out and sign in again.');
  if (expiresAt <= Date.now() + 60_000) {
    const renewed = await refresh();
    if (!renewed) throw new SessionExpiredError('Your session expired. Sign out and sign in again.');
  }
  if (!current) throw new SessionExpiredError('Your session expired. Sign in again.');
  return current.token;
}

export async function getCurrentSession(): Promise<AccountSession> {
  await getAccessToken();
  if (!current) throw new SessionExpiredError('Your session expired. Sign in again.');
  return { ...current };
}

export async function authenticatedFetch(input: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  if (!headers.has('Authorization')) return globalThis.fetch(input, init);
  if (!apiBase || !input.startsWith(`${apiBase}/`)) throw new Error('Refusing to send session credentials to a different API.');
  const token = await getAccessToken();
  headers.set('Authorization', `Bearer ${token}`);
  const response = await globalThis.fetch(input, { ...init, headers });
  if (response.status !== 401) return response;
  // Another request may already have renewed this token.
  if (current?.token === token && !await refresh()) {
    throw new SessionExpiredError('Your session expired. Sign out and sign in again.');
  }
  headers.set('Authorization', `Bearer ${await getAccessToken()}`);
  return globalThis.fetch(input, { ...init, headers });
}
