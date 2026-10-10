import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  ChefVerificationStatus,
  UserRole,
  UserVerificationType,
  VerificationStatus,
} from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { SafetyService } from './safety.service.js';

describe('SafetyService verification workflow', () => {
  const transaction = {
    user: { update: vi.fn() },
    userVerification: { upsert: vi.fn() },
    customerServiceAddress: { create: vi.fn(), update: vi.fn() },
    verificationAuditLog: { create: vi.fn() },
    chefCredential: { update: vi.fn() },
    chefServiceApproval: { upsert: vi.fn() },
    chefProfile: { update: vi.fn() },
    adminAuditLog: { create: vi.fn() },
  };
  const prisma = {
    user: { findUnique: vi.fn() },
    userVerification: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    customerServiceAddress: { create: vi.fn(), findUnique: vi.fn() },
    chefProfile: { findUnique: vi.fn() },
    chefCredential: { create: vi.fn(), findUnique: vi.fn(), findMany: vi.fn() },
    chefPermit: { findMany: vi.fn(), findUnique: vi.fn() },
    chefServiceApproval: { findMany: vi.fn(), findUnique: vi.fn() },
    backgroundScreeningRecord: { findMany: vi.fn() },
    verificationDocument: { findMany: vi.fn() },
    complianceRule: { findFirst: vi.fn() },
    stripeConnectedAccount: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  };
  const config = {
    get: vi.fn((key: string) =>
      key === 'VERIFICATION_ENCRYPTION_KEY'
        ? Buffer.from('12345678901234567890123456789012').toString('base64')
        : undefined,
    ),
  };
  let service: SafetyService;

  beforeEach(async () => {
    vi.clearAllMocks();
    config.get.mockImplementation((key: string) =>
      key === 'VERIFICATION_ENCRYPTION_KEY'
        ? Buffer.from('12345678901234567890123456789012').toString('base64')
        : undefined,
    );
    prisma.$transaction.mockImplementation(
      (callback: (tx: typeof transaction) => unknown) => callback(transaction),
    );
    const module = await Test.createTestingModule({
      providers: [
        SafetyService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();
    service = module.get(SafetyService);
  });

  it('resets phone verification to pending when a customer changes phone number', async () => {
    transaction.user.update.mockResolvedValue({ phoneNumberLast4: '0123' });
    transaction.userVerification.upsert.mockResolvedValue({
      type: UserVerificationType.phone,
      status: VerificationStatus.pending,
    });

    const result = await service.updateMyPhoneNumber('customer-id', {
      phoneNumber: '+14155550123',
    });

    expect(result.verification.status).toBe(VerificationStatus.pending);
    const userUpdate = transaction.user.update.mock.calls[0][0];
    expect(userUpdate.data.phoneNumberEncrypted).not.toContain('+14155550123');
    expect(userUpdate.data.phoneNumberEncrypted).toMatch(/^v1\./);
    expect(userUpdate.data.phoneNumberHash).not.toContain('+14155550123');
    expect(transaction.userVerification.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          status: VerificationStatus.pending,
          verifiedAt: null,
        }),
      }),
    );
  });

  it('stores customer service addresses encrypted and returns only the verification reference', async () => {
    transaction.customerServiceAddress.create.mockResolvedValue({
      id: 'service-address-id',
      countryCode: 'US',
      jurisdictionCode: 'US-NY',
      status: VerificationStatus.pending,
      createdAt: new Date(),
    });
    transaction.verificationAuditLog.create.mockResolvedValue({});

    const result = await service.createMyServiceAddress('customer-id', {
      line1: '123 Main Street',
      city: 'Brooklyn',
      region: 'NY',
      postalCode: '11201',
      countryCode: 'us',
      jurisdictionCode: 'us-ny',
    });

    expect(result.status).toBe(VerificationStatus.pending);
    const stored = transaction.customerServiceAddress.create.mock.calls[0][0].data;
    expect(stored.encryptedAddress).not.toContain('123 Main Street');
    expect(stored.addressHash).not.toContain('123 Main Street');
    expect(transaction.verificationAuditLog.create).toHaveBeenCalled();
  });

  it('keeps address verification disabled until an approved provider is configured', async () => {
    await expect(
      service.reviewServiceAddress('admin-id', 'address-id', {
        status: VerificationStatus.verified,
        provider: 'test-provider',
        providerReference: 'address-123',
      }),
    ).rejects.toThrow('Address verification is disabled');
    expect(prisma.customerServiceAddress.findUnique).not.toHaveBeenCalled();
  });

  it('records administrator verification decisions in the audit log', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'customer-id', role: UserRole.customer });
    transaction.userVerification.upsert.mockResolvedValue({
      id: 'verification-id',
      type: UserVerificationType.email,
      status: VerificationStatus.verified,
      verifiedAt: new Date(),
      expiresAt: null,
    });
    transaction.verificationAuditLog.create.mockResolvedValue({});

    const result = await service.reviewUserVerification(
      'admin-id',
      'customer-id',
      UserVerificationType.email,
      {
        status: VerificationStatus.verified,
        provider: 'manual-reviewed',
        providerReference: 'support-case-123',
      },
    );

    expect(result.status).toBe(VerificationStatus.verified);
    expect(transaction.verificationAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorId: 'admin-id',
          subjectId: 'customer-id',
          targetType: 'user_verification',
        }),
      }),
    );
  });

  it('requires provider evidence before an administrator can mark a user verified', async () => {
    await expect(
      service.reviewUserVerification('admin-id', 'customer-id', UserVerificationType.email, {
        status: VerificationStatus.verified,
      }),
    ).rejects.toThrow('require a provider and an evidence reference');
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('records administrative rejection decisions without exposing sensitive verification data', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'customer-id', role: UserRole.customer });
    transaction.userVerification.upsert.mockResolvedValue({
      id: 'verification-id',
      type: UserVerificationType.phone,
      status: VerificationStatus.rejected,
      verifiedAt: null,
      expiresAt: null,
    });
    transaction.verificationAuditLog.create.mockResolvedValue({});

    const result = await service.reviewUserVerification(
      'admin-id',
      'customer-id',
      UserVerificationType.phone,
      { status: VerificationStatus.rejected, reviewerNotes: 'Unable to verify ownership.' },
    );

    expect(result.status).toBe(VerificationStatus.rejected);
    expect(transaction.verificationAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'user_phone_verification_rejected' }),
      }),
    );
  });

  it('keeps third-party identity verification disabled until provider review is enabled', async () => {
    await expect(
      service.reviewUserVerification('admin-id', 'chef-user-id', UserVerificationType.identity, {
        status: VerificationStatus.verified,
        provider: 'test-provider',
        providerReference: 'verification-123',
      }),
    ).rejects.toThrow('disabled until an approved provider');
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('prevents administrator chef approval when core verification or Stripe onboarding is missing', async () => {
    prisma.chefProfile.findUnique.mockResolvedValue({
      id: 'chef-id',
      userId: 'chef-user-id',
      verificationStatus: ChefVerificationStatus.pending,
    });
    prisma.userVerification.findMany.mockResolvedValue([]);
    prisma.stripeConnectedAccount.findUnique.mockResolvedValue(null);

    await expect(
      service.updateChefStatus('admin-id', 'chef-id', {
        verificationStatus: ChefVerificationStatus.approved,
      }),
    ).rejects.toThrow('verified email, verified phone, identity verification, eligible Stripe Connect account');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('fails closed when service approval requirements are not configured', async () => {
    prisma.chefProfile.findUnique.mockResolvedValue({ id: 'chef-id' });
    prisma.complianceRule.findFirst.mockResolvedValue(null);

    await expect(
      service.reviewChefServiceApproval('admin-id', 'chef-id', {
        serviceType: 'in_home_cooking',
        jurisdictionCode: 'us-ny',
        status: VerificationStatus.verified,
      }),
    ).rejects.toThrow('No active verification requirements are configured');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('does not verify an expired credential', async () => {
    prisma.chefCredential.findUnique.mockResolvedValue({
      id: 'credential-id',
      chefId: 'chef-id',
      expiresAt: new Date(Date.now() - 60_000),
      issuer: 'Food Safety Board',
      providerReference: null,
      status: VerificationStatus.pending,
    });

    await expect(
      service.reviewChefCredential('admin-id', 'credential-id', {
        status: VerificationStatus.verified,
      }),
    ).rejects.toThrow('expired credential cannot be verified');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
