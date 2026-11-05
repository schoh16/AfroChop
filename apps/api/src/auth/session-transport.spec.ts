import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSessionCookie, isBrowserSession, readRefreshToken, sendSession } from './session-transport.js';
import type { Request, Response } from 'express';

function request(headers: Record<string, string | undefined>): Request { return { headers } as never; }
function response() {
  const mock = { cookie: vi.fn(), clearCookie: vi.fn(), setHeader: vi.fn() };
  const res: Response = mock as never;
  return { mock, res };
}
const tokens = { token: 'access', refreshToken: 'private-refresh', expiresIn: 900 };

describe('session transport', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('CORS_ORIGINS', 'https://app.example.test');
  });
  afterEach(() => vi.unstubAllEnvs());

  it('keeps browser refresh tokens out of JSON and writes a secure HttpOnly cookie', () => {
    const { mock, res } = response();
    const result = sendSession(request({ 'x-afrochop-client': 'web', origin: 'https://app.example.test' }), res, tokens);
    expect(result).toEqual({ token: 'access', expiresIn: 900 });
    expect(mock.cookie).toHaveBeenCalledWith('afrochop.refresh', 'private-refresh', expect.objectContaining({
      httpOnly: true, secure: true, sameSite: 'lax', path: '/api/auth',
    }));
    expect(mock.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
  });

  it('returns refresh tokens to approved native clients without setting cookies', () => {
    const { mock, res } = response();
    expect(sendSession(request({ 'x-afrochop-client': 'native' }), res, tokens)).toEqual(tokens);
    expect(mock.cookie).not.toHaveBeenCalled();
  });

  it.each([
    { 'x-afrochop-client': 'web', origin: 'https://evil.example' },
    { 'x-afrochop-client': 'native', origin: 'https://app.example.test' },
    { 'x-afrochop-client': 'web' },
    {},
  ])('rejects unapproved origins and browser attempts to request native tokens', (headers) => {
    expect(() => isBrowserSession(request(headers))).toThrow();
  });

  it('ignores a browser body refresh token and reads only the HttpOnly cookie', () => {
    const req = request({
      'x-afrochop-client': 'web', origin: 'https://app.example.test',
      cookie: 'other=value; afrochop.refresh=real%2Btoken',
    });
    expect(readRefreshToken(req, 'attacker-token')).toBe('real+token');
  });

  it('requires a saved cookie for browser refresh', () => {
    expect(() => readRefreshToken(request({ 'x-afrochop-client': 'web', origin: 'https://app.example.test' }), 'body-token'))
      .toThrow('No saved browser session');
  });

  it('requires a native refresh token', () => {
    expect(() => readRefreshToken(request({ 'x-afrochop-client': 'native' }))).toThrow('required');
  });

  it('clears exactly the same cookie path and security attributes on sign-out', () => {
    const { mock, res } = response();
    clearSessionCookie(res);
    expect(mock.clearCookie).toHaveBeenCalledWith('afrochop.refresh', expect.objectContaining({
      path: '/api/auth', secure: true, httpOnly: true, sameSite: 'lax',
    }));
  });
});
