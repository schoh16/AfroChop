import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SignUpCommand, ConfirmSignUpCommand, GetUserCommand, GetTokensFromRefreshTokenCommand,
  RevokeTokenCommand, GlobalSignOutCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { FetchError, JwtInvalidSignatureError } from 'aws-jwt-verify/error';
import { CognitoService } from './cognito.service.js';

const mocks = vi.hoisted(() => ({ send: vi.fn(), verify: vi.fn(), create: vi.fn() }));
vi.mock('@aws-sdk/client-cognito-identity-provider', async (original) => ({
  ...await original<typeof import('@aws-sdk/client-cognito-identity-provider')>(),
  CognitoIdentityProviderClient: class { send = mocks.send; },
}));
vi.mock('aws-jwt-verify', () => ({
  CognitoJwtVerifier: { create: mocks.create },
}));

const settings: Record<string, string> = { COGNITO_USER_POOL_ID: 'us-east-2_test', COGNITO_CLIENT_ID: 'client-id' };
const service = () => new CognitoService({ get: (name: string) => settings[name] } as never);
const awsError = (name: string) => Object.assign(new Error('Private provider details'), { name });

describe('Cognito provider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.create.mockReturnValue({ verify: mocks.verify });
    mocks.verify.mockResolvedValue({ sub: 'subject' });
    mocks.send.mockResolvedValue({});
  });

  it('fails explicitly without pool configuration', async () => {
    await expect(new CognitoService({ get: () => undefined } as never).login('a@example.test', 'Password123!'))
      .rejects.toThrow('not configured');
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('registers email/name without trusting an email_verified flag from the client', async () => {
    await service().register('a@example.test', 'Password123!', 'Cook');
    expect(mocks.send.mock.calls[0][0]).toBeInstanceOf(SignUpCommand);
    expect(mocks.send.mock.calls[0][0].input).toEqual({
      ClientId: 'client-id', Username: 'a@example.test', Password: 'Password123!',
      UserAttributes: [{ Name: 'email', Value: 'a@example.test' }, { Name: 'name', Value: 'Cook' }],
    });
  });

  it('never transfers an email alias from another identity during confirmation', async () => {
    await service().confirm('a@example.test', '123456');
    expect(mocks.send.mock.calls[0][0]).toBeInstanceOf(ConfirmSignUpCommand);
    expect(mocks.send.mock.calls[0][0].input.ForceAliasCreation).toBe(false);
  });

  it('validates issuer, client and access-token use, then checks revocation and email ownership', async () => {
    mocks.send.mockResolvedValue({ UserAttributes: [
      { Name: 'sub', Value: 'subject' }, { Name: 'email', Value: 'A@example.test' },
      { Name: 'email_verified', Value: 'true' }, { Name: 'name', Value: 'Cook' },
    ] });
    await expect(service().identity('access')).resolves.toEqual({ sub: 'subject', email: 'a@example.test', name: 'Cook' });
    expect(mocks.create).toHaveBeenCalledWith({ userPoolId: settings.COGNITO_USER_POOL_ID, clientId: 'client-id', tokenUse: 'access' });
    expect(mocks.send.mock.calls[0][0]).toBeInstanceOf(GetUserCommand);
  });

  it.each(['false', undefined])('rejects unverified email (%s)', async (verified) => {
    mocks.send.mockResolvedValue({ UserAttributes: [
      { Name: 'sub', Value: 'subject' }, { Name: 'email', Value: 'a@example.test' },
      { Name: 'email_verified', Value: verified },
    ] });
    await expect(service().identity('access')).rejects.toThrow('verified email');
  });

  it('rejects mismatched identity subjects', async () => {
    mocks.send.mockResolvedValue({ UserAttributes: [
      { Name: 'sub', Value: 'other' }, { Name: 'email', Value: 'a@example.test' },
      { Name: 'email_verified', Value: 'true' },
    ] });
    await expect(service().identity('access')).rejects.toThrow('verified email');
  });

  it('rejects a bad signature without calling user APIs', async () => {
    mocks.verify.mockRejectedValue(new JwtInvalidSignatureError('bad signature'));
    await expect(service().identity('invalid')).rejects.toThrow('invalid or expired');
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('rejects Cognito-revoked tokens even if signature verification succeeds', async () => {
    mocks.send.mockRejectedValue(awsError('NotAuthorizedException'));
    await expect(service().identity('revoked')).rejects.toThrow('expired session');
  });

  it('distinguishes a signing-key network outage from an expired session', async () => {
    mocks.verify.mockRejectedValue(new FetchError('https://cognito.example/jwks', 'Network unavailable'));
    await expect(service().identity('access')).rejects.toThrow('verification is temporarily unavailable');
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('uses the rotation-compatible refresh endpoint and returns the new refresh token', async () => {
    mocks.send.mockResolvedValue({ AuthenticationResult: { AccessToken: 'new-access', RefreshToken: 'rotated', ExpiresIn: 900 } });
    await expect(service().refresh('old')).resolves.toEqual({ token: 'new-access', refreshToken: 'rotated', expiresIn: 900 });
    expect(mocks.send.mock.calls[0][0]).toBeInstanceOf(GetTokensFromRefreshTokenCommand);
    expect(mocks.send.mock.calls[0][0].input).toEqual({ ClientId: 'client-id', RefreshToken: 'old' });
  });

  it('does not present an incomplete Cognito response as successful authentication', async () => {
    await expect(service().login('a@example.test', 'Password123!')).rejects.toThrow('complete session');
  });

  it('requires a rotated refresh token instead of silently retaining the old token', async () => {
    mocks.send.mockResolvedValue({ AuthenticationResult: { AccessToken: 'new-access', ExpiresIn: 900 } });
    await expect(service().refresh('old')).rejects.toThrow('complete session');
  });

  it.each(['UserNotFoundException', 'InvalidParameterException'])('does not reveal recovery account existence (%s)', async (name) => {
    mocks.send.mockRejectedValue(awsError(name));
    await expect(service().forgotPassword('a@example.test')).resolves.toHaveProperty('message', expect.stringContaining('If the account'));
  });

  it('surfaces delivery failures rather than pretending a reset code was sent', async () => {
    mocks.send.mockRejectedValue(awsError('CodeDeliveryFailureException'));
    await expect(service().forgotPassword('a@example.test')).rejects.toThrow('temporarily unavailable');
  });

  it.each([
    ['ExpiredCodeException', 'code is incorrect or expired'],
    ['InvalidPasswordException', 'uppercase'],
    ['UserNotConfirmedException', 'Verify your email'],
    ['TooManyRequestsException', 'Too many attempts'],
  ])('maps %s into actionable safe errors', async (name, message) => {
    mocks.send.mockRejectedValue(awsError(name));
    await expect(service().resetPassword('a@example.test', '123456', 'NewPassword123!')).rejects.toThrow(message);
  });

  it('revokes sessions before revoking the refresh token', async () => {
    await service().logout('refresh', 'access');
    expect(mocks.send.mock.calls[0][0]).toBeInstanceOf(GlobalSignOutCommand);
    expect(mocks.send.mock.calls[1][0]).toBeInstanceOf(RevokeTokenCommand);
  });
});
