import { afterEach, describe, expect, it, vi } from 'vitest';
import { UserVerificationType } from '@prisma/client';
import { VerificationCodeService } from './verification-code.service.js';

const provider = vi.hoisted(() => ({
  verifications: { create: vi.fn() },
  verificationChecks: { create: vi.fn() },
}));
vi.mock('twilio', () => ({ default: () => ({ verify: { v2: { services: () => provider } } }) }));

function build() {
  vi.clearAllMocks();
  provider.verifications.create.mockResolvedValue({ sid: 'VE_test', status: 'pending' });
  provider.verificationChecks.create.mockResolvedValue({ status: 'approved' });
  const user = { email: 'customer@example.com', phoneNumberEncrypted: null };
  let challenge: Record<string, unknown> | null = null;
  const tx = {
    user: { update: vi.fn(async () => user) },
    verificationChallenge: {
      findUnique: vi.fn(async () => challenge),
      upsert: vi.fn(async ({ create, update }) => {
        challenge = challenge ? { ...challenge, ...update } : { id: 'vc1', ...create }; return challenge;
      }),
      update: vi.fn(async ({ data }) => {
        if (challenge && data.attempts) challenge.attempts = Number(challenge.attempts) + data.attempts.increment;
        return challenge;
      }),
      updateMany: vi.fn(async ({ data }) => { Object.assign(challenge!, data); return { count: 1 }; }),
    },
    userVerification: { upsert: vi.fn() },
    verificationAuditLog: { create: vi.fn() },
  };
  const prisma = { ...tx, $transaction: vi.fn(async (callback) => callback(tx)) };
  const settings: Record<string, string> = {
    TWILIO_ACCOUNT_SID: 'AC_test', TWILIO_AUTH_TOKEN: 'test-token', TWILIO_VERIFY_SERVICE_SID: 'VA_test',
    VERIFICATION_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
  };
  const config = { get: vi.fn((key: string) => settings[key]) };
  const service = new VerificationCodeService(prisma as never, config as never);
  return { service, tx, user, settings, get challenge() { return challenge; } };
}

afterEach(() => vi.useRealTimers());

describe('contact verification codes', () => {
  it('sends email codes through the configured provider, without returning the code', async () => {
    const setup = build();
    const result = await setup.service.send('u1', UserVerificationType.email);
    expect(result).toMatchObject({ sent: true, expiresAt: expect.any(Date) });
    expect(result).not.toHaveProperty('code');
    expect(provider.verifications.create).toHaveBeenCalledWith({ to: 'customer@example.com', channel: 'email' });
  });

  it('verifies only after provider approval and audits the result', async () => {
    const setup = build();
    await setup.service.send('u1', UserVerificationType.email);
    await setup.service.check('u1', UserVerificationType.email, '123456');
    expect(provider.verificationChecks.create).toHaveBeenCalledWith({ verificationSid: 'VE_test', code: '123456' });
    expect(setup.tx.userVerification.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ type: 'email', status: 'verified', provider: 'twilio_verify' }) }),
    );
    expect(setup.tx.verificationAuditLog.create).toHaveBeenCalled();
  });

  it('fails closed when the verification provider is not configured', async () => {
    const setup = build();
    delete setup.settings.TWILIO_VERIFY_SERVICE_SID;
    await expect(setup.service.send('u1', UserVerificationType.email)).rejects.toThrow('not configured');
    expect(provider.verifications.create).not.toHaveBeenCalled();
  });

  it('rejects resends within 60 seconds', async () => {
    const setup = build();
    await setup.service.send('u1', UserVerificationType.email);
    await expect(setup.service.send('u1', UserVerificationType.email)).rejects.toThrow('60 seconds');
    expect(provider.verifications.create).toHaveBeenCalledTimes(1);
  });

  it('limits sends to five per hour', async () => {
    vi.useFakeTimers();
    const setup = build();
    for (let count = 0; count < 5; count++) {
      await setup.service.send('u1', UserVerificationType.email);
      vi.advanceTimersByTime(60_000);
    }
    await expect(setup.service.send('u1', UserVerificationType.email)).rejects.toThrow('send limit');
  });

  it('counts incorrect attempts and blocks a sixth provider check', async () => {
    const setup = build();
    await setup.service.send('u1', UserVerificationType.email);
    provider.verificationChecks.create.mockResolvedValue({ status: 'pending' });
    for (let attempt = 0; attempt < 5; attempt++) {
      await expect(setup.service.check('u1', UserVerificationType.email, '000000')).rejects.toThrow('Incorrect');
    }
    await expect(setup.service.check('u1', UserVerificationType.email, '000000')).rejects.toThrow('attempt limit');
    expect(provider.verificationChecks.create).toHaveBeenCalledTimes(5);
    expect(setup.tx.userVerification.upsert).not.toHaveBeenCalled();
  });

  it('does not let a code verify changed contact details', async () => {
    const setup = build();
    await setup.service.send('u1', UserVerificationType.email);
    setup.user.email = 'changed@example.com';
    await expect(setup.service.check('u1', UserVerificationType.email, '123456')).rejects.toThrow('expired');
    expect(provider.verificationChecks.create).not.toHaveBeenCalled();
  });

  it('does not let a consumed or expired code verify an account', async () => {
    vi.useFakeTimers();
    const setup = build();
    await setup.service.send('u1', UserVerificationType.email);
    vi.advanceTimersByTime(10 * 60_000);
    await expect(setup.service.check('u1', UserVerificationType.email, '123456')).rejects.toThrow('expired');
    expect(setup.tx.userVerification.upsert).not.toHaveBeenCalled();
  });

  it('does not offer self-service identity verification via contact codes', async () => {
    const setup = build();
    await expect(setup.service.send('u1', UserVerificationType.identity)).rejects.toThrow('Only email and phone');
  });
});
