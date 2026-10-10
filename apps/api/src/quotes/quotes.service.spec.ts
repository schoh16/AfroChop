import { Test } from '@nestjs/testing';
import { BookingStatus, ServiceType, UserRole } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { QuotesService } from './quotes.service.js';

describe('QuotesService food-safety gates', () => {
  const prisma = {
    chefProfile: {
      findFirst: vi.fn(),
    },
    bookingRequest: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
    complianceRule: {
      findFirst: vi.fn(),
    },
    chefPermit: {
      findMany: vi.fn(),
    },
    userVerification: { findMany: vi.fn() },
    customerServiceAddress: { findFirst: vi.fn() },
    chefCredential: { findFirst: vi.fn() },
    backgroundScreeningRecord: { findFirst: vi.fn() },
    chefServiceApproval: { findUnique: vi.fn() },
    stripeConnectedAccount: { findUnique: vi.fn() },
    quote: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  };
  let service: QuotesService;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        QuotesService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(QuotesService);
  });

  it('requires the current allergy notice acknowledgment before creating a request', async () => {
    await expect(
      service.createBookingRequest('customer-id', {
        chefId: 'chef-id',
        serviceType: ServiceType.prepared_meals,
        requestedDate: new Date(Date.now() + 48 * 60 * 60_000).toISOString(),
        jurisdictionCode: 'US-NY',
        durationMinutes: 60,
        disclosedAllergens: [],
        dietaryRestrictions: [],
        allergyNoticeAcknowledged: false,
        allergyNoticeVersion: 'old-version',
      }),
    ).rejects.toThrow('acknowledge the current food allergy notice');
    expect(prisma.chefProfile.findFirst).not.toHaveBeenCalled();
  });

  it('fails closed until an applicable jurisdiction service rule is configured', async () => {
    prisma.chefProfile.findFirst.mockResolvedValue({
      id: 'chef-profile-id',
      verificationStatus: 'approved',
    });
    prisma.complianceRule.findFirst.mockResolvedValue(null);

    await expect(
      service.createBookingRequest('customer-id', {
        chefId: 'chef-profile-id',
        serviceType: ServiceType.prepared_meals,
        requestedDate: new Date(Date.now() + 48 * 60 * 60_000).toISOString(),
        jurisdictionCode: 'US-NY',
        durationMinutes: 60,
        disclosedAllergens: [],
        dietaryRestrictions: [],
        allergyNoticeAcknowledged: true,
        allergyNoticeVersion: '2026-10-08-v1',
      }),
    ).rejects.toThrow('not configured for compliance review');
    expect(prisma.bookingRequest.create).not.toHaveBeenCalled();
  });

  it('blocks a customer with unverified email or phone from booking', async () => {
    prisma.chefProfile.findFirst.mockResolvedValue({
      id: 'chef-profile-id',
      verificationStatus: 'approved',
    });
    prisma.complianceRule.findFirst.mockResolvedValue({
      requiresApprovedProvider: true,
      requiresCustomerIdentityVerification: false,
      requiresServiceApproval: false,
      requiredPermitTypes: [],
    });
    prisma.userVerification.findMany.mockResolvedValue([]);

    await expect(
      service.createBookingRequest('customer-id', {
        chefId: 'chef-profile-id',
        serviceType: ServiceType.prepared_meals,
        requestedDate: new Date(Date.now() + 48 * 60 * 60_000).toISOString(),
        jurisdictionCode: 'US-NY',
        durationMinutes: 60,
        disclosedAllergens: [],
        dietaryRestrictions: [],
        allergyNoticeAcknowledged: true,
        allergyNoticeVersion: '2026-10-08-v1',
      }),
    ).rejects.toThrow('Verify your email and phone number');
    expect(prisma.bookingRequest.create).not.toHaveBeenCalled();
  });

  it('blocks bookings when the chef lacks approval for the requested service and jurisdiction', async () => {
    prisma.chefProfile.findFirst.mockResolvedValue({
      id: 'chef-profile-id',
      verificationStatus: 'approved',
    });
    prisma.complianceRule.findFirst.mockResolvedValue({
      requiresApprovedProvider: true,
      requiresCustomerIdentityVerification: false,
      requiresServiceApproval: true,
      requiredPermitTypes: [],
    });
    prisma.userVerification.findMany.mockResolvedValue([
      { type: 'email', status: 'verified', expiresAt: null },
      { type: 'phone', status: 'verified', expiresAt: null },
    ]);
    prisma.chefServiceApproval.findUnique.mockResolvedValue({ status: 'pending' });

    await expect(
      service.createBookingRequest('customer-id', {
        chefId: 'chef-profile-id',
        serviceType: ServiceType.prepared_meals,
        requestedDate: new Date(Date.now() + 48 * 60 * 60_000).toISOString(),
        jurisdictionCode: 'US-NY',
        durationMinutes: 60,
        disclosedAllergens: [],
        dietaryRestrictions: [],
        allergyNoticeAcknowledged: true,
        allergyNoticeVersion: '2026-10-08-v1',
      }),
    ).rejects.toThrow('not approved for this service type and jurisdiction');
    expect(prisma.bookingRequest.create).not.toHaveBeenCalled();
  });

  it('requires an owned, verified address for in-home appointments', async () => {
    prisma.chefProfile.findFirst.mockResolvedValue({
      id: 'chef-profile-id',
      verificationStatus: 'approved',
    });
    prisma.complianceRule.findFirst.mockResolvedValue({
      requiresApprovedProvider: true,
      requiresCustomerIdentityVerification: false,
      requiresServiceApproval: false,
      requiredPermitTypes: [],
    });
    prisma.userVerification.findMany.mockResolvedValue([
      { type: 'email', status: 'verified', expiresAt: null },
      { type: 'phone', status: 'verified', expiresAt: null },
    ]);

    await expect(
      service.createBookingRequest('customer-id', {
        chefId: 'chef-profile-id',
        serviceType: ServiceType.in_home_cooking,
        requestedDate: new Date(Date.now() + 48 * 60 * 60_000).toISOString(),
        jurisdictionCode: 'US-NY',
        durationMinutes: 60,
        disclosedAllergens: [],
        dietaryRestrictions: [],
        allergyNoticeAcknowledged: true,
        allergyNoticeVersion: '2026-10-08-v1',
      }),
    ).rejects.toThrow('verified service address is required');
    expect(prisma.bookingRequest.create).not.toHaveBeenCalled();
  });

  it('blocks booking when the jurisdiction rule requires a current food-safety credential', async () => {
    prisma.chefProfile.findFirst.mockResolvedValue({
      id: 'chef-profile-id',
      userId: 'chef-user-id',
      verificationStatus: 'approved',
    });
    prisma.complianceRule.findFirst.mockResolvedValue({
      requiresApprovedProvider: true,
      requiresCustomerIdentityVerification: false,
      requiresIdentityVerification: false,
      requiresFoodSafetyCredential: true,
      requiresBackgroundScreening: false,
      requiresServiceApproval: false,
      requiredPermitTypes: [],
    });
    prisma.userVerification.findMany.mockResolvedValue([
      { type: 'email', status: 'verified', expiresAt: null },
      { type: 'phone', status: 'verified', expiresAt: null },
    ]);
    prisma.chefCredential.findFirst.mockResolvedValue(null);

    await expect(
      service.createBookingRequest('customer-id', {
        chefId: 'chef-profile-id',
        serviceType: ServiceType.prepared_meals,
        requestedDate: new Date(Date.now() + 48 * 60 * 60_000).toISOString(),
        jurisdictionCode: 'US-NY',
        durationMinutes: 60,
        disclosedAllergens: [],
        dietaryRestrictions: [],
        allergyNoticeAcknowledged: true,
        allergyNoticeVersion: '2026-10-08-v1',
      }),
    ).rejects.toThrow('lacks a current food-safety credential');
    expect(prisma.bookingRequest.create).not.toHaveBeenCalled();
  });

  it('blocks chef quoting until a disclosed allergy has an explicit response', async () => {
    prisma.chefProfile.findFirst.mockResolvedValue({
      id: 'chef-profile-id',
    });
    prisma.bookingRequest.findUnique.mockResolvedValue({
      chefId: 'chef-profile-id',
      status: BookingStatus.requested,
      allergyReviewStatus: 'pending',
    });

    await expect(
      service.createChefQuote('chef-user-id', 'booking-id', { amount: 40 }),
    ).rejects.toThrow('respond to the customer’s allergy disclosure');
    expect(prisma.quote.create).not.toHaveBeenCalled();
  });

  it('records a cook decline and stops an allergy-disclosed request', async () => {
    prisma.chefProfile.findFirst.mockResolvedValue({ id: 'chef-profile-id' });
    prisma.bookingRequest.findUnique.mockResolvedValue({
      chefId: 'chef-profile-id',
      status: BookingStatus.requested,
      allergyReviewStatus: 'pending',
      disclosedAllergens: ['peanuts'],
    });
    prisma.bookingRequest.update.mockResolvedValue({
      id: 'booking-id',
      status: BookingStatus.cancelled,
      allergyReviewStatus: 'declined',
      allergyResponseNote: 'I cannot safely avoid peanut cross-contact.',
    });

    const result = await service.respondToAllergyRequest(
      'chef-user-id',
      'booking-id',
      {
        canAccommodate: false,
        responseNote: 'I cannot safely avoid peanut cross-contact.',
      },
    );

    expect(prisma.bookingRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'booking-id' },
        data: expect.objectContaining({
          allergyReviewStatus: 'declined',
          status: BookingStatus.cancelled,
        }),
      }),
    );
    expect(result.allergyReviewStatus).toBe('declined');
  });

  it('requires customer and assigned-chef completion confirmations before review eligibility', async () => {
    const customerConfirmationTime = new Date();
    prisma.bookingRequest.findUnique
      .mockResolvedValueOnce({
        id: 'booking-id',
        customerId: 'customer-id',
        chefId: 'chef-profile-id',
        status: BookingStatus.in_progress,
        chefCompletedAt: null,
        customerCompletedAt: null,
        chef: { userId: 'chef-user-id' },
      })
      .mockResolvedValueOnce({
        id: 'booking-id',
        customerId: 'customer-id',
        chefId: 'chef-profile-id',
        status: BookingStatus.in_progress,
        chefCompletedAt: null,
        customerCompletedAt: customerConfirmationTime,
        chef: { userId: 'chef-user-id' },
      });
    const transaction = {
      bookingRequest: {
        update: vi.fn(),
        updateMany: vi.fn(),
        findUniqueOrThrow: vi
          .fn()
          .mockResolvedValueOnce({ id: 'booking-id', status: BookingStatus.in_progress })
          .mockResolvedValueOnce({ id: 'booking-id', status: BookingStatus.completed }),
      },
    };
    prisma.$transaction.mockImplementation(
      (callback: (tx: typeof transaction) => unknown) => callback(transaction),
    );

    const customerResult = await service.confirmCompletion(
      'customer-id',
      UserRole.customer,
      'booking-id',
    );
    const chefResult = await service.confirmCompletion(
      'chef-user-id',
      UserRole.chef,
      'booking-id',
    );

    expect(customerResult.status).toBe(BookingStatus.in_progress);
    expect(chefResult.status).toBe(BookingStatus.completed);
    expect(transaction.bookingRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          chefCompletedAt: { not: null },
          customerCompletedAt: { not: null },
        }),
        data: { status: BookingStatus.completed },
      }),
    );
  });

  it('prevents a nonparticipant from confirming booking completion', async () => {
    prisma.bookingRequest.findUnique.mockResolvedValue({
      id: 'booking-id',
      customerId: 'customer-id',
      chefId: 'chef-profile-id',
      status: BookingStatus.confirmed,
      chefCompletedAt: null,
      customerCompletedAt: null,
      chef: { userId: 'chef-user-id' },
    });

    await expect(
      service.confirmCompletion('other-user', UserRole.customer, 'booking-id'),
    ).rejects.toThrow('cannot confirm another user’s booking');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
