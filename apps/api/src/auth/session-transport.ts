import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { CognitoTokens } from './cognito.service.js';

const cookieName = 'afrochop.refresh';
const cookieOptions = () => ({
  httpOnly: true, secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const, path: '/api/auth',
});

export function isBrowserSession(request: Request) {
  const client = request.headers['x-afrochop-client'];
  const origin = request.headers.origin;
  if (client === 'web' && origin) {
    const allowed = (process.env.CORS_ORIGINS ?? (
      process.env.NODE_ENV === 'production' ? '' : 'http://localhost:8082,http://localhost:8081,http://localhost:19006'
    )).split(',').map((value) => value.trim()).filter(Boolean);
    if (!allowed.includes(origin)) throw new ForbiddenException('This browser origin is not allowed to manage sessions.');
    return true;
  }
  if (client === 'native' && !origin) return false;
  throw new ForbiddenException('An approved web or native session client is required.');
}

export function readRefreshToken(request: Request, bodyToken?: string) {
  if (!isBrowserSession(request)) {
    if (!bodyToken) throw new UnauthorizedException('A refresh token is required.');
    return bodyToken;
  }
  const cookie = request.headers.cookie?.split(';').map((value) => value.trim())
    .find((value) => value.startsWith(`${cookieName}=`));
  if (!cookie) throw new UnauthorizedException('No saved browser session.');
  try { return decodeURIComponent(cookie.slice(cookieName.length + 1)); }
  catch { throw new UnauthorizedException('The saved browser session is invalid.'); }
}

export function sendSession<T extends CognitoTokens>(request: Request, response: Response, session: T) {
  response.setHeader('Cache-Control', 'no-store');
  if (!isBrowserSession(request)) return session;
  response.cookie(cookieName, session.refreshToken, {
    ...cookieOptions(), maxAge: 30 * 24 * 60 * 60 * 1000,
  });
  const { refreshToken: _refreshToken, ...browserSession } = session;
  return browserSession;
}

export function clearSessionCookie(response: Response) {
  response.setHeader('Cache-Control', 'no-store');
  response.clearCookie(cookieName, cookieOptions());
}
