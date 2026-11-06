import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  ChefApplicationStatus,
  Prisma,
  ChefVerificationStatus,
  UserRole,
  UserVerificationType,
  VerificationStatus,
} from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { SafetyService } from './safety.service.js';
import { StaffApplicationNotificationService } from '../notifications/staff-application-notification.service.js';

describe('SafetyService verification workflow', () => {
  const transaction = {
    user: { update: vi.fn() },
    userVerification: { upsert: vi.fn() },
    customerServiceAddress: { create: vi.fn(), update: vi.fn() },
    chefApplication: { create: vi.fn(), update: vi.fn() },
    verificationAuditLog: { create: vi.fn() },
    chefCredential: { update: vi.fn() },
    chefServiceApproval: { upsert: vi.fn() },
    chefProfile: { update: vi.fn() },
    adminAuditLog: { create: vi.fn() },
  };
  const prisma = {
    bookingRequest: { findUnique: vi.fn() },
    verificationAuditLog: { create: vi.fn() },
    user: { findUnique: vi.fn() },
    userVerification: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    customerServiceAddress: { create: vi.fn(), findUnique: vi.fn() },
    chefProfile: { findUnique: vi.fn() },
    chefApplication: { findMany: vi.fn(), findUnique: vi.fn() },
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
  const staffNotifications = {
    notifySubmitted: vi.fn().mockResolvedValue(undefined),
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
        {
          provide: StaffApplicationNotificationService,
          useValue: staffNotifications,
        },
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
    const stored =
      transaction.customerServiceAddress.create.mock.calls[0][0].data;
    expect(stored.encryptedAddress).not.toContain('123 Main Street');
    expect(stored.addressHash).not.toContain('123 Main Street');
    expect(transaction.verificationAuditLog.create).toHaveBeenCalled();
  });

  it('encrypts the cook visit address and keeps the profile private after application', async () => {
    prisma.chefProfile.findUnique.mockResolvedValue({
      id: 'chef-id',
      application: null,
    });
    transaction.chefApplication.create.mockResolvedValue({
      id: 'application-id',
      status: ChefApplicationStatus.submitted,
      submittedAt: new Date(),
      visitScheduledAt: null,
      interviewedAt: null,
      profileSetupAt: null,
    });

    const result = await service.submitChefApplication('chef-user-id', {
      phoneNumber: '+14155550123', experienceYears: 5,
      countryOfOrigin: 'Cameroon', meetingAvailability: 'Mondays 2–5 PM America/New_York',
      line1: '123 Main Street',
      city: 'Brooklyn',
      region: 'NY',
      postalCode: '11201',
      countryCode: 'us',
    });

    expect(result.status).toBe(ChefApplicationStatus.submitted);
    expect(staffNotifications.notifySubmitted).toHaveBeenCalledWith({
      id: result.id,
      submittedAt: result.submittedAt,
    });
    expect(prisma.$transaction.mock.invocationCallOrder[0]).toBeLessThan(
      staffNotifications.notifySubmitted.mock.invocationCallOrder[0],
    );
    const stored = transaction.chefApplication.create.mock.calls[0][0].data;
    expect(stored.encryptedHomeAddress).not.toContain('123 Main Street');
    expect(stored.encryptedHomeAddress).toMatch(/^v1\./);
    expect(stored.encryptedApplicantDetails).toMatch(/^v1\./);
    expect(stored.encryptedApplicantDetails).not.toContain('+14155550123');
    expect(JSON.stringify(transaction.verificationAuditLog.create.mock.calls)).not.toContain('+14155550123');
    expect(result).not.toHaveProperty('encryptedApplicantDetails');
    expect(transaction.chefProfile.update).toHaveBeenCalledWith({
      where: { id: 'chef-id' },
      data: { isPublic: false },
    });
    expect(transaction.verificationAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'chef_application_submitted',
          targetType: 'chef_application',
        }),
      }),
    );
    prisma.chefApplication.findUnique.mockResolvedValue({
      id: 'application-id',
      encryptedHomeAddress: stored.encryptedHomeAddress,
      encryptedApplicantDetails: stored.encryptedApplicantDetails,
      chef: { userId: 'chef-user-id' },
    });
    await expect(
      service.getChefApplicationAddress('admin-id', 'application-id'),
    ).resolves.toMatchObject({
      line1: '123 Main Street',
      city: 'Brooklyn',
      countryCode: 'US',
      applicantDetails: {
        phoneNumber: '+14155550123', experienceYears: 5,
        countryOfOrigin: 'Cameroon', meetingAvailability: 'Mondays 2–5 PM America/New_York',
      },
    });
    expect(prisma.verificationAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'chef_application_address_accessed',
          targetType: 'chef_application',
        }),
      }),
    );
    prisma.chefApplication.findUnique.mockResolvedValue({
      id: 'application-id',
      encryptedHomeAddress: stored.encryptedHomeAddress,
      encryptedApplicantDetails: null,
      chef: { userId: 'chef-user-id' },
    });
    await expect(service.getChefApplicationAddress('admin-id', 'application-id'))
      .resolves.toMatchObject({ line1: '123 Main Street', applicantDetails: null });
  });

  it('does not send duplicate alerts when an existing application is returned', async () => {
    const application = {
      id: 'existing-id',
      status: ChefApplicationStatus.submitted,
    };
    prisma.chefProfile.findUnique.mockResolvedValue({
      id: 'chef-id',
      application,
    });

    await expect(
      service.submitChefApplication('chef-user-id', {
        phoneNumber: '+14155550123', experienceYears: 0,
        countryOfOrigin: 'Ghana', meetingAvailability: 'Mondays 2–5 PM America/New_York',
        line1: '123 Main Street',
        city: 'Brooklyn',
        region: 'NY',
        postalCode: '11201',
        countryCode: 'US',
      }),
    ).resolves.toEqual(application);
    expect(staffNotifications.notifySubmitted).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('stores an empty application without inventing an address or zero years of experience', async () => {
    prisma.chefProfile.findUnique.mockResolvedValue({ id: 'chef-id', application: null });
    transaction.chefApplication.create.mockResolvedValue({
      id: 'empty-application', status: ChefApplicationStatus.submitted, submittedAt: new Date(),
    });
    await service.submitChefApplication('chef-user-id', {});
    const stored = transaction.chefApplication.create.mock.calls[0][0].data;
    prisma.chefApplication.findUnique.mockResolvedValue({
      id: 'empty-application', ...stored, chef: { userId: 'chef-user-id' },
    });
    await expect(service.getChefApplicationAddress('admin-id', 'empty-application'))
      .resolves.toMatchObject({
        line1: '', city: '', region: '', postalCode: '', countryCode: '',
        applicantDetails: {
          phoneNumber: '', experienceYears: null, countryOfOrigin: '', meetingAvailability: '',
        },
      });
  });

  it('does not notify staff when the application transaction fails', async () => {
    prisma.chefProfile.findUnique.mockResolvedValue({
      id: 'chef-id',
      application: null,
    });
    prisma.$transaction.mockRejectedValueOnce(
      new Error('Database unavailable'),
    );
    await expect(
      service.submitChefApplication('chef-user-id', {
        phoneNumber: '+14155550123', experienceYears: 5,
        countryOfOrigin: 'Ghana', meetingAvailability: 'Mondays 2–5 PM America/New_York',
        line1: '123 Main Street',
        city: 'Brooklyn',
        region: 'NY',
        postalCode: '11201',
        countryCode: 'US',
      }),
    ).rejects.toThrow('Database unavailable');
    expect(staffNotifications.notifySubmitted).not.toHaveBeenCalled();
  });

  it('waits for the transaction to commit before notifying staff', async () => {
    prisma.chefProfile.findUnique.mockResolvedValue({
      id: 'chef-id',
      application: null,
    });
    const application = {
      id: 'application-id',
      status: ChefApplicationStatus.submitted,
      submittedAt: new Date(),
    };
    let commit: (value: typeof application) => void = () => {
      throw new Error('Transaction has not started');
    };
    prisma.$transaction.mockImplementationOnce(
      () =>
        new Promise<typeof application>((resolve) => {
          commit = resolve;
        }),
    );
    const submission = service.submitChefApplication('chef-user-id', {
      phoneNumber: '+14155550123', experienceYears: 5,
      countryOfOrigin: 'Ghana', meetingAvailability: 'Mondays 2–5 PM America/New_York',
      line1: '123 Main Street',
      city: 'Brooklyn',
      region: 'NY',
      postalCode: '11201',
      countryCode: 'US',
    });
    await vi.waitFor(() => expect(prisma.$transaction).toHaveBeenCalledOnce());
    expect(staffNotifications.notifySubmitted).not.toHaveBeenCalled();
    commit(application);
    await expect(submission).resolves.toEqual(application);
    expect(staffNotifications.notifySubmitted).toHaveBeenCalledExactlyOnceWith({
      id: application.id,
      submittedAt: application.submittedAt,
    });
  });

  it('alerts staff again when a rejected application is resubmitted', async () => {
    prisma.chefProfile.findUnique.mockResolvedValue({
      id: 'chef-id',
      application: {
        id: 'existing-id',
        status: ChefApplicationStatus.rejected,
      },
    });
    transaction.chefApplication.update.mockResolvedValue({
      id: 'existing-id',
      status: ChefApplicationStatus.submitted,
      submittedAt: new Date(),
    });
    const result = await service.submitChefApplication('chef-user-id', {
      phoneNumber: '+14155550123', experienceYears: 5,
      countryOfOrigin: 'Ghana', meetingAvailability: 'Mondays 2–5 PM America/New_York',
      line1: '123 Main Street',
      city: 'Brooklyn',
      region: 'NY',
      postalCode: '11201',
      countryCode: 'US',
    });
    expect(staffNotifications.notifySubmitted).toHaveBeenCalledExactlyOnceWith({
      id: result.id,
      submittedAt: result.submittedAt,
    });
  });

  it('publishes the profile only after the interview and setup stages', async () => {
    prisma.chefApplication.findUnique.mockResolvedValue({
      id: 'application-id',
      status: ChefApplicationStatus.interviewed,
      chef: {
        id: 'chef-id',
        userId: 'chef-user-id',
        profileImageUrl: 'https://example.com/photo.jpg',
        _count: { menuEntries: 1 },
      },
    });
    transaction.chefApplication.update.mockResolvedValue({
      id: 'application-id',
      status: ChefApplicationStatus.profile_setup,
      submittedAt: new Date(),
      visitScheduledAt: new Date(),
      interviewedAt: new Date(),
      profileSetupAt: new Date(),
    });

    await service.reviewChefApplication('admin-id', 'application-id', {
      status: ChefApplicationStatus.profile_setup,
    });
    expect(transaction.chefProfile.update).toHaveBeenCalledWith({
      where: { id: 'chef-id' },
      data: { isPublic: true },
    });
    expect(transaction.adminAuditLog.create).toHaveBeenCalled();
    expect(transaction.verificationAuditLog.create).toHaveBeenCalled();
  });

  it('rejects a dashboard review based on stale application status', async () => {
    prisma.chefApplication.findUnique.mockResolvedValue({
      id: 'application-id',
      status: ChefApplicationStatus.interviewed,
      chef: {
        id: 'chef-id',
        userId: 'chef-user-id',
        profileImageUrl: 'photo',
        _count: { menuEntries: 1 },
      },
    });
    await expect(
      service.reviewChefApplication('admin-id', 'application-id', {
        status: ChefApplicationStatus.interviewed,
        expectedStatus: ChefApplicationStatus.visit_scheduled,
      }),
    ).rejects.toThrow('This application has changed');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('does not overwrite a status changed by another reviewer during save', async () => {
    prisma.chefApplication.findUnique.mockResolvedValue({
      id: 'application-id',
      status: ChefApplicationStatus.interviewed,
      chef: {
        id: 'chef-id',
        userId: 'chef-user-id',
        profileImageUrl: 'photo',
        _count: { menuEntries: 1 },
      },
    });
    transaction.chefApplication.update.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('Record changed', {
        code: 'P2025',
        clientVersion: '6.12.0',
      }),
    );
    await expect(
      service.reviewChefApplication('admin-id', 'application-id', {
        status: ChefApplicationStatus.profile_setup,
        expectedStatus: ChefApplicationStatus.interviewed,
      }),
    ).rejects.toThrow('This application has changed');
    expect(transaction.chefApplication.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'application-id',
          status: ChefApplicationStatus.interviewed,
        },
      }),
    );
    expect(transaction.chefProfile.update).not.toHaveBeenCalled();
  });

  it('includes profile readiness in the staff queue without the encrypted address', async () => {
    prisma.chefApplication.findMany.mockResolvedValue([]);
    await service.listChefApplications();
    const query = prisma.chefApplication.findMany.mock.calls[0][0];
    expect(query.select.chef.select).toMatchObject({
      id: true,
      profileImageUrl: true,
      menuEntries: { select: { id: true, name: true } },
    });
    expect(query.select).not.toHaveProperty('encryptedHomeAddress');
  });

  it('does not allow staff to publish before a visit and interview', async () => {
    prisma.chefApplication.findUnique.mockResolvedValue({
      id: 'application-id',
      status: ChefApplicationStatus.submitted,
      chef: {
        id: 'chef-id',
        userId: 'chef-user-id',
        profileImageUrl: 'https://example.com/photo.jpg',
        _count: { menuEntries: 1 },
      },
    });

    await expect(
      service.reviewChefApplication('admin-id', 'application-id', {
        status: ChefApplicationStatus.profile_setup,
      }),
    ).rejects.toThrow('follow the visit and interview workflow');
    expect(prisma.$transaction).not.toHaveBeenCalled();
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

  it('denies unpaid and nonparticipant access to private booking addresses', async () => {
    prisma.bookingRequest.findUnique.mockResolvedValue({
      customerId: 'customer-id',
      chef: { userId: 'chef-id' },
      status: 'awaiting_payment',
      depositPaidAt: null,
      serviceAddress: { encryptedAddress: 'private' },
    });
    await expect(
      service.getBookingServiceAddress('chef-id', UserRole.chef, 'b1'),
    ).rejects.toThrow('private');
    await expect(
      service.getBookingServiceAddress(
        'other-customer',
        UserRole.customer,
        'b1',
      ),
    ).rejects.toThrow('private');
    expect(prisma.verificationAuditLog.create).not.toHaveBeenCalled();
  });

  it('requires service-address jurisdictions to match the country', async () => {
    await expect(
      service.createMyServiceAddress('customer-id', {
        line1: '123 Main Street',
        city: 'Brooklyn',
        region: 'NY',
        postalCode: '11201',
        countryCode: 'US',
        jurisdictionCode: 'CA-ON',
      }),
    ).rejects.toThrow('country code');
    expect(transaction.customerServiceAddress.create).not.toHaveBeenCalled();
  });

  it('records administrator verification decisions in the audit log', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'customer-id',
      role: UserRole.customer,
    });
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
      service.reviewUserVerification(
        'admin-id',
        'customer-id',
        UserVerificationType.email,
        {
          status: VerificationStatus.verified,
        },
      ),
    ).rejects.toThrow('require a provider and an evidence reference');
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('records administrative rejection decisions without exposing sensitive verification data', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'customer-id',
      role: UserRole.customer,
    });
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
      {
        status: VerificationStatus.rejected,
        reviewerNotes: 'Unable to verify ownership.',
      },
    );

    expect(result.status).toBe(VerificationStatus.rejected);
    expect(transaction.verificationAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'user_phone_verification_rejected',
        }),
      }),
    );
  });

  it('keeps third-party identity verification disabled until provider review is enabled', async () => {
    await expect(
      service.reviewUserVerification(
        'admin-id',
        'chef-user-id',
        UserVerificationType.identity,
        {
          status: VerificationStatus.verified,
          provider: 'test-provider',
          providerReference: 'verification-123',
        },
      ),
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
    ).rejects.toThrow(
      'verified email, verified phone, identity verification, eligible Stripe Connect account',
    );
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
