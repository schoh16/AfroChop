import { Test } from '@nestjs/testing';
import {
  Prisma,
  StripeConnectedAccountStatus,
} from '@prisma/client';
import Stripe from 'stripe';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service.js';
import { PaymentsService, STRIPE_CLIENT } from './payments.service.js';
import { BookingMoneyService } from './booking-money.service.js';

describe('PaymentsService Connect onboarding and configuration', () => {
  const transaction = {
    paymentConfiguration: { upsert: vi.fn() },
    adminAuditLog: { create: vi.fn() },
    paymentWebhookEvent: { create: vi.fn() },
    stripeConnectedAccount: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  };
  const prisma = {
    paymentConfiguration: { findUnique: vi.fn(), create: vi.fn() },
    chefProfile: { findUnique: vi.fn() },
    stripeConnectedAccount: {
      upsert: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
    paymentWebhookEvent: { create: vi.fn() },
    $transaction: vi.fn(),
  };
  const stripeMock = {
    v2: {
      core: {
        accounts: { create: vi.fn() },
        accountLinks: { create: vi.fn() },
      },
    },
    webhooks: { constructEvent: vi.fn() },
  };
  const stripe = stripeMock as unknown as Stripe;
  const environment: Record<string, string> = {
    STRIPE_CONNECT_RETURN_URL: 'https://afrochop.example/payments/return',
    STRIPE_CONNECT_REFRESH_URL: 'https://api.afrochop.example/api/payments/chef/connect/refresh',
    STRIPE_WEBHOOK_SECRET: 'whsec_test',
    NODE_ENV: 'test',
  };
  const config = {
    get: vi.fn((key: string) => environment[key]),
  };
  let service: PaymentsService;

  beforeEach(async () => {
    vi.clearAllMocks();
    config.get.mockImplementation((key: string) => environment[key]);
    prisma.$transaction.mockImplementation(
      (callback: (tx: typeof transaction) => unknown) => callback(transaction),
    );
    const module = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: BookingMoneyService, useValue: { handleEvent: vi.fn().mockResolvedValue(false) } },
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: config },
        { provide: STRIPE_CLIENT, useValue: stripe },
      ],
    }).compile();
    service = module.get(PaymentsService);
  });

  it('creates a recipient Account v2 and single-use onboarding link for the chef profile country', async () => {
    prisma.chefProfile.findUnique.mockResolvedValue({
      id: 'chef-profile-id',
      displayName: 'Chef Amara',
      countryCode: 'US',
      user: { email: 'chef@example.com' },
      stripeConnectedAccount: null,
    });
    stripeMock.v2.core.accounts.create.mockResolvedValue({ id: 'acct_test123' });
    prisma.stripeConnectedAccount.upsert.mockResolvedValue({ chefId: 'chef-profile-id' });
    stripeMock.v2.core.accountLinks.create.mockResolvedValue({
      url: 'https://accounts.stripe.com/onboarding/one-time',
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    });
    prisma.stripeConnectedAccount.update.mockResolvedValue({});

    const result = await service.createOnboardingLink('chef-user-id');

    expect(stripeMock.v2.core.accounts.create).toHaveBeenCalledWith(
      expect.objectContaining({
        contact_email: 'chef@example.com',
        display_name: 'Chef Amara',
        dashboard: 'express',
        identity: { country: 'us' },
        configuration: {
          recipient: {
            capabilities: {
              stripe_balance: { stripe_transfers: { requested: true } },
            },
          },
        },
      }),
      { idempotencyKey: 'afrochop-connect-chef-chef-profile-id' },
    );
    expect(stripeMock.v2.core.accountLinks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        account: 'acct_test123',
        use_case: expect.objectContaining({
          type: 'account_onboarding',
          account_onboarding: expect.objectContaining({
            return_url: 'https://afrochop.example/payments/return',
            refresh_url: expect.stringContaining(
              'https://api.afrochop.example/api/payments/chef/connect/refresh?token=',
            ),
          }),
        }),
      }),
    );
    expect(result.url).toBe('https://accounts.stripe.com/onboarding/one-time');
    expect(JSON.stringify(prisma.stripeConnectedAccount.upsert.mock.calls))
      .not.toContain('bank');
  });

  it('requires a valid profile country before creating any Stripe account', async () => {
    prisma.chefProfile.findUnique.mockResolvedValue({
      id: 'chef-profile-id',
      displayName: 'Chef Amara',
      countryCode: null,
      user: { email: 'chef@example.com' },
      stripeConnectedAccount: null,
    });

    await expect(service.createOnboardingLink('chef-user-id')).rejects.toThrow(
      'valid two-letter country',
    );
    expect(stripeMock.v2.core.accounts.create).not.toHaveBeenCalled();
  });

  it('keeps Stripe transfer status pending until an account update confirms active capability', async () => {
    stripeMock.webhooks.constructEvent.mockReturnValue({
      id: 'evt_account_updated',
      type: 'account.updated',
      livemode: false,
      data: {
        object: {
          id: 'acct_test123',
          payouts_enabled: false,
          details_submitted: false,
          requirements: {
            currently_due: ['individual.verification.document'],
            past_due: [],
          },
          capabilities: { transfers: { status: 'pending' } },
        },
      },
    });
    transaction.paymentWebhookEvent.create.mockResolvedValue({});
    transaction.stripeConnectedAccount.findUnique.mockResolvedValue({ id: 'local-account-id' });
    transaction.stripeConnectedAccount.update.mockResolvedValue({});

    await service.handleStripeWebhook(Buffer.from('{}'), 'valid-signature');

    expect(transaction.stripeConnectedAccount.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'local-account-id' },
        data: expect.objectContaining({
          status: StripeConnectedAccountStatus.pending,
          transferCapabilityStatus: 'pending',
          detailsSubmitted: false,
          requirements: expect.objectContaining({
            currentlyDue: ['individual.verification.document'],
          }),
        }),
      }),
    );
  });

  it('only marks the connected account eligible after Stripe confirms active transfer capability', async () => {
    stripeMock.webhooks.constructEvent.mockReturnValue({
      id: 'evt_account_eligible',
      type: 'account.updated',
      livemode: false,
      data: {
        object: {
          id: 'acct_test123',
          payouts_enabled: true,
          requirements: { currently_due: [], past_due: [] },
          configuration: {
            recipient: {
              capabilities: {
                stripe_balance: { stripe_transfers: { status: 'active' } },
              },
            },
          },
        },
      },
    });
    transaction.paymentWebhookEvent.create.mockResolvedValue({});
    transaction.stripeConnectedAccount.findUnique.mockResolvedValue({ id: 'local-account-id' });
    transaction.stripeConnectedAccount.update.mockResolvedValue({});

    await service.handleStripeWebhook(Buffer.from('{}'), 'valid-signature');

    expect(transaction.stripeConnectedAccount.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: StripeConnectedAccountStatus.eligible,
          transferCapabilityStatus: 'active',
          payoutsEnabled: true,
          detailsSubmitted: true,
        }),
      }),
    );
  });

  it('rejects invalid webhook signatures and acknowledges duplicate deliveries idempotently', async () => {
    stripeMock.webhooks.constructEvent.mockImplementationOnce(() => {
      throw new Error('invalid signature');
    });
    await expect(
      service.handleStripeWebhook(Buffer.from('{}'), 'invalid'),
    ).rejects.toThrow('signature verification failed');

    stripeMock.webhooks.constructEvent.mockReturnValue({
      id: 'evt_duplicate',
      type: 'account.updated',
      livemode: false,
      data: { object: { id: 'acct_test123' } },
    });
    transaction.paymentWebhookEvent.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    await expect(
      service.handleStripeWebhook(Buffer.from('{}'), 'valid-signature'),
    ).resolves.toEqual({ received: true, duplicate: true });
    expect(transaction.stripeConnectedAccount.update).not.toHaveBeenCalled();
  });

  it('provides the customer marketplace fee but not chef commission in the public configuration', async () => {
    prisma.paymentConfiguration.findUnique.mockResolvedValue({
      id: 'default',
      chefCommissionBps: 1000,
      customerMarketplaceFeeBps: 250,
      updatedAt: new Date(),
    });

    await expect(service.getCustomerPaymentConfiguration()).resolves.toEqual({
      customerMarketplaceFeeBps: 250,
      customerMarketplaceFeePercent: 2.5,
    });
  });

  it('initializes payment configuration at 10% commission and zero customer fee', async () => {
    prisma.paymentConfiguration.findUnique.mockResolvedValueOnce(null);
    prisma.paymentConfiguration.create.mockResolvedValue({
      id: 'default',
      chefCommissionBps: 1000,
      customerMarketplaceFeeBps: 0,
      updatedAt: new Date(),
    });

    const result = await service.getAdminPaymentConfiguration();

    expect(prisma.paymentConfiguration.create).toHaveBeenCalledWith({
      data: {
        id: 'default',
        chefCommissionBps: 1000,
        customerMarketplaceFeeBps: 0,
      },
    });
    expect(result.chefCommissionPercent).toBe(10);
  });

  it('audits administrator changes to commission and customer fee settings', async () => {
    transaction.paymentConfiguration.upsert.mockResolvedValue({
      id: 'default',
      chefCommissionBps: 1000,
      customerMarketplaceFeeBps: 300,
      updatedAt: new Date(),
    });
    transaction.adminAuditLog.create.mockResolvedValue({});

    await service.updatePaymentConfiguration('admin-id', {
      chefCommissionBps: 1000,
      customerMarketplaceFeeBps: 300,
    });

    expect(transaction.adminAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: 'admin-id',
        action: 'payment_configuration_updated',
        targetType: 'payment_configuration',
        details: {
          chefCommissionBps: 1000,
          customerMarketplaceFeeBps: 300,
        },
      }),
    });
  });

  it('consumes a hashed onboarding refresh token once and redirects through a new Stripe link', async () => {
    const token = 'a'.repeat(64);
    prisma.stripeConnectedAccount.findFirst.mockResolvedValue({
      id: 'local-account-id',
      chefId: 'chef-profile-id',
      stripeAccountId: 'acct_test123',
    });
    prisma.stripeConnectedAccount.updateMany.mockResolvedValue({ count: 1 });
    stripeMock.v2.core.accountLinks.create.mockResolvedValue({
      url: 'https://accounts.stripe.com/onboarding/refreshed',
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    });
    prisma.stripeConnectedAccount.update.mockResolvedValue({});

    const url = await service.refreshOnboardingLink(token);

    expect(prisma.stripeConnectedAccount.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'local-account-id',
          connectRefreshTokenHash: expect.not.stringContaining(token),
          connectRefreshTokenUsedAt: null,
        }),
      }),
    );
    expect(url).toBe('https://accounts.stripe.com/onboarding/refreshed');
  });
});
