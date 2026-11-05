import { ServiceUnavailableException, UnauthorizedException, ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { CognitoService } from './cognito.service.js';
import { MarketingContactService } from './marketing-contact.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';

const tokens = { id: 'local-id', role: 'customer', token: 'access', refreshToken: 'refresh', expiresIn: 900 };

describe('Cognito auth HTTP contract', () => {
  let app: INestApplication<App>;
  const auth = { login: vi.fn(), refresh: vi.fn(), register: vi.fn() };
  const cognito = { confirm: vi.fn(), resend: vi.fn(), forgotPassword: vi.fn(), resetPassword: vi.fn(), logout: vi.fn() };

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('CORS_ORIGINS', 'https://app.example.test');
    auth.login.mockResolvedValue(tokens);
    auth.refresh.mockResolvedValue({ ...tokens, refreshToken: 'rotated' });
    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: CognitoService, useValue: cognito },
        { provide: MarketingContactService, useValue: {} },
      ],
    }).overrideGuard(JwtAuthGuard).useValue({ canActivate: () => true }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterEach(async () => { await app?.close(); vi.unstubAllEnvs(); });

  it('logs browsers in with an HttpOnly cookie and never returns the refresh token in JSON', async () => {
    const result = await request(app.getHttpServer()).post('/api/auth/login')
      .set('Origin', 'https://app.example.test').set('X-AfroChop-Client', 'web')
      .send({ email: 'user@example.test', password: 'Password123!' }).expect(201);
    expect(result.body).toMatchObject({ token: 'access', id: 'local-id' });
    expect(result.body).not.toHaveProperty('refreshToken');
    expect(result.headers['cache-control']).toBe('no-store');
    expect(result.headers['set-cookie'][0]).toMatch(/afrochop\.refresh=refresh;.*HttpOnly; Secure; SameSite=Lax/);
  });

  it('returns native refresh tokens for SecureStore without creating cookies', async () => {
    const result = await request(app.getHttpServer()).post('/api/auth/login')
      .set('X-AfroChop-Client', 'native')
      .send({ email: 'user@example.test', password: 'Password123!' }).expect(201);
    expect(result.body.refreshToken).toBe('refresh');
    expect(result.headers['set-cookie']).toBeUndefined();
  });

  it('rejects hostile browser login before authenticating', async () => {
    await request(app.getHttpServer()).post('/api/auth/login')
      .set('Origin', 'https://evil.example').set('X-AfroChop-Client', 'native')
      .send({ email: 'user@example.test', password: 'Password123!' }).expect(403);
    expect(auth.login).not.toHaveBeenCalled();
  });

  it('rotates a browser cookie on refresh and ignores any token injected in its JSON body', async () => {
    const result = await request(app.getHttpServer()).post('/api/auth/refresh')
      .set('Origin', 'https://app.example.test').set('X-AfroChop-Client', 'web')
      .set('Cookie', 'afrochop.refresh=real-cookie')
      .send({ refreshToken: 'injected-body-token' }).expect(201);
    expect(auth.refresh).toHaveBeenCalledWith('real-cookie');
    expect(result.body).not.toHaveProperty('refreshToken');
    expect(result.headers['set-cookie'][0]).toContain('afrochop.refresh=rotated;');
  });

  it('clears rejected cookies without masking an expired session', async () => {
    auth.refresh.mockRejectedValue(new UnauthorizedException('Expired session'));
    const result = await request(app.getHttpServer()).post('/api/auth/refresh')
      .set('Origin', 'https://app.example.test').set('X-AfroChop-Client', 'web')
      .set('Cookie', 'afrochop.refresh=expired').send({}).expect(401);
    expect(result.headers['set-cookie'][0]).toContain('afrochop.refresh=;');
  });

  it('revokes a native refresh token on logout', async () => {
    await request(app.getHttpServer()).post('/api/auth/logout')
      .set('X-AfroChop-Client', 'native').set('Authorization', 'Bearer access')
      .send({ refreshToken: 'refresh' }).expect(201);
    expect(cognito.logout).toHaveBeenCalledWith('refresh', 'access');
  });

  it('retains the browser cookie when remote revocation fails so sign-out can be retried', async () => {
    cognito.logout.mockRejectedValueOnce(new ServiceUnavailableException('Cognito unavailable'));
    const result = await request(app.getHttpServer()).post('/api/auth/logout')
      .set('Origin', 'https://app.example.test').set('X-AfroChop-Client', 'web')
      .set('Cookie', 'afrochop.refresh=refresh').send({}).expect(503);
    expect(result.headers['set-cookie']).toBeUndefined();
  });

  it('rejects invalid confirmation and reset input before calling Cognito', async () => {
    await request(app.getHttpServer()).post('/api/auth/confirm')
      .send({ email: 'user@example.test', code: 'bad' }).expect(400);
    await request(app.getHttpServer()).post('/api/auth/reset-password')
      .send({ email: 'user@example.test', code: '123456', password: 'short' }).expect(400);
    expect(cognito.confirm).not.toHaveBeenCalled();
    expect(cognito.resetPassword).not.toHaveBeenCalled();
  });

  it('confirms email without issuing a sign-in session', async () => {
    cognito.confirm.mockResolvedValue({ message: 'Verified' });
    const result = await request(app.getHttpServer()).post('/api/auth/confirm')
      .send({ email: 'USER@example.test', code: '123456' }).expect(201);
    expect(cognito.confirm).toHaveBeenCalledWith('user@example.test', '123456');
    expect(result.headers['set-cookie']).toBeUndefined();
    expect(result.body).not.toHaveProperty('token');
  });
});
