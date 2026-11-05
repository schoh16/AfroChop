import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { StaffApplicationNotificationService } from './staff-application-notification.service.js';

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  destroy: vi.fn(),
  createMessage: vi.fn(),
}));

vi.mock('@aws-sdk/client-sesv2', () => ({
  SESv2Client: class {
    send = mocks.send;
    destroy = mocks.destroy;
  },
  SendEmailCommand: class {
    constructor(public input: unknown) {}
  },
}));
vi.mock('twilio', () => ({
  default: () => ({ messages: { create: mocks.createMessage } }),
}));

describe('staff cook application alerts', () => {
  let settings: Record<string, string>;
  let service: StaffApplicationNotificationService;
  const logs = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const application = {
    id: '00000000-0000-4000-8000-000000000001',
    submittedAt: new Date('2026-11-05T18:00:00Z'),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    settings = {
      STAFF_APPLICATION_EMAILS:
        'team@afrochop.example, operations@afrochop.example',
      STAFF_ALERTS_FROM_EMAIL: 'alerts@afrochop.example',
      AWS_REGION: 'us-east-2',
      STAFF_APPLICATION_SMS_NUMBERS: '+14155550123,+14155550124',
      TWILIO_ACCOUNT_SID: 'test-account',
      TWILIO_AUTH_TOKEN: 'test-token',
      TWILIO_MESSAGING_SERVICE_SID: 'test-service',
    };
    service = new StaffApplicationNotificationService(
      new ConfigService(settings),
    );
    mocks.send.mockResolvedValue({ MessageId: 'email-id' });
    mocks.createMessage.mockResolvedValue({ sid: 'sms-id' });
    vi.spyOn(Logger.prototype, 'log').mockImplementation(logs.log);
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(logs.warn);
    vi.spyOn(Logger.prototype, 'error').mockImplementation(logs.error);
  });

  afterEach(() => vi.restoreAllMocks());

  it('sends individual emails and texts to each configured staff recipient', async () => {
    await service.notifySubmitted(application);
    expect(mocks.send).toHaveBeenCalledTimes(2);
    expect(mocks.send.mock.calls[0][0].input).toMatchObject({
      FromEmailAddress: settings.STAFF_ALERTS_FROM_EMAIL,
      Destination: { ToAddresses: ['team@afrochop.example'] },
      Content: {
        Simple: {
          Subject: { Data: 'AfroChop: New cook application' },
          Body: { Text: { Data: expect.stringContaining(application.id) } },
        },
      },
    });
    const email =
      mocks.send.mock.calls[0][0].input.Content.Simple.Body.Text.Data;
    expect(email).toContain(application.submittedAt.toISOString());
    expect(email).not.toContain('encryptedHomeAddress');
    expect(mocks.createMessage).toHaveBeenCalledTimes(2);
    expect(mocks.createMessage).toHaveBeenCalledWith({
      messagingServiceSid: settings.TWILIO_MESSAGING_SERVICE_SID,
      to: '+14155550123',
      body: expect.stringContaining(application.id),
    });
    expect(mocks.destroy).toHaveBeenCalledOnce();
  });

  it('deduplicates recipients and ignores empty list entries', async () => {
    settings.STAFF_APPLICATION_EMAILS =
      ' team@afrochop.example, ,team@afrochop.example ';
    settings.STAFF_APPLICATION_SMS_NUMBERS = ' +14155550123,,+14155550123 ';
    await service.notifySubmitted(application);
    expect(mocks.send).toHaveBeenCalledOnce();
    expect(mocks.createMessage).toHaveBeenCalledOnce();
  });

  it('logs missing configuration rather than claiming delivery', async () => {
    settings.STAFF_APPLICATION_EMAILS = '';
    settings.STAFF_APPLICATION_SMS_NUMBERS = '';
    await service.notifySubmitted(application);
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.createMessage).not.toHaveBeenCalled();
    expect(logs.warn).toHaveBeenCalledTimes(2);
    expect(logs.log).not.toHaveBeenCalled();
  });

  it('rejects invalid recipient formats without calling providers', async () => {
    settings.STAFF_APPLICATION_EMAILS = 'not-an-email';
    settings.STAFF_APPLICATION_SMS_NUMBERS = '4155550123';
    await service.notifySubmitted(application);
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.createMessage).not.toHaveBeenCalled();
    expect(logs.error).toHaveBeenCalledTimes(2);
  });

  it('still sends texts and other emails when one email fails', async () => {
    mocks.send.mockRejectedValueOnce(new Error('Private provider error'));
    await expect(service.notifySubmitted(application)).resolves.toBeUndefined();
    expect(mocks.send).toHaveBeenCalledTimes(2);
    expect(mocks.createMessage).toHaveBeenCalledTimes(2);
    expect(logs.error).toHaveBeenCalledOnce();
    expect(JSON.stringify(logs.error.mock.calls)).not.toContain(
      'Private provider error',
    );
  });

  it('still sends emails and other texts when one SMS fails', async () => {
    mocks.createMessage.mockRejectedValueOnce({
      code: 21610,
      message: 'Recipient +14155550123 opted out; secret token',
    });
    await expect(service.notifySubmitted(application)).resolves.toBeUndefined();
    expect(mocks.send).toHaveBeenCalledTimes(2);
    expect(mocks.createMessage).toHaveBeenCalledTimes(2);
    const errors = JSON.stringify(logs.error.mock.calls);
    expect(errors).toContain('code=21610');
    expect(errors).not.toContain('+14155550123');
    expect(errors).not.toContain('secret token');
  });

  it('keeps submissions successful if both delivery channels fail', async () => {
    mocks.send.mockRejectedValue(new Error('Email unavailable'));
    mocks.createMessage.mockRejectedValue(new Error('SMS unavailable'));
    await expect(service.notifySubmitted(application)).resolves.toBeUndefined();
    expect(logs.error).toHaveBeenCalledTimes(4);
    expect(logs.log).not.toHaveBeenCalled();
  });
});
