import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Prisma,
  StripeConnectedAccountStatus,
} from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service.js';
import { PaymentConfigurationDto } from './dto/payment-configuration.dto.js';

export const STRIPE_CLIENT = Symbol('STRIPE_CLIENT');
const PAYMENT_CONFIGURATION_ID = 'default';
const INITIAL_CHEF_COMMISSION_BPS = 1_500;
const INITIAL_CUSTOMER_FEE_BPS = 0;
const REFRESH_TOKEN_LIFETIME_MS = 60 * 60 * 1000;
const LOGGER = new Logger('PaymentsService');

type StripeAccountSnapshot = {
  id?: string;
  payouts_enabled?: boolean;
  details_submitted?: boolean;
  requirements?: {
    currently_due?: string[];
    eventually_due?: string[];
    past_due?: string[];
    disabled_reason?: string | null;
    entries?: unknown[];
  };
  disabled_reason?: string | null;
  capabilities?: { transfers?: { status?: string } };
  configuration?: {
    recipient?: {
      capabilities?: {
        stripe_balance?: {
          stripe_transfers?: { status?: string };
        };
      };
    };
  };
};

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(STRIPE_CLIENT) private readonly stripeClient: Stripe | null,
  ) {}

  async getCustomerPaymentConfiguration() {
    const configuration = await this.ensurePaymentConfiguration();
    return {
      customerMarketplaceFeeBps: configuration.customerMarketplaceFeeBps,
      customerMarketplaceFeePercent: configuration.customerMarketplaceFeeBps / 100,
    };
  }

  async getAdminPaymentConfiguration() {
    const configuration = await this.ensurePaymentConfiguration();
    return {
      chefCommissionBps: configuration.chefCommissionBps,
      chefCommissionPercent: configuration.chefCommissionBps / 100,
      customerMarketplaceFeeBps: configuration.customerMarketplaceFeeBps,
      customerMarketplaceFeePercent: configuration.customerMarketplaceFeeBps / 100,
      updatedAt: configuration.updatedAt,
    };
  }

  async updatePaymentConfiguration(adminId: string, dto: PaymentConfigurationDto) {
    return this.prisma.$transaction(async (transaction) => {
      const configuration = await transaction.paymentConfiguration.upsert({
        where: { id: PAYMENT_CONFIGURATION_ID },
        create: {
          id: PAYMENT_CONFIGURATION_ID,
          chefCommissionBps: dto.chefCommissionBps,
          customerMarketplaceFeeBps: dto.customerMarketplaceFeeBps,
        },
        update: {
          chefCommissionBps: dto.chefCommissionBps,
          customerMarketplaceFeeBps: dto.customerMarketplaceFeeBps,
        },
      });
      await transaction.adminAuditLog.create({
        data: {
          actorId: adminId,
          action: 'payment_configuration_updated',
          targetType: 'payment_configuration',
          targetId: configuration.id,
          details: {
            chefCommissionBps: configuration.chefCommissionBps,
            customerMarketplaceFeeBps: configuration.customerMarketplaceFeeBps,
          },
        },
      });
      return {
        chefCommissionBps: configuration.chefCommissionBps,
        chefCommissionPercent: configuration.chefCommissionBps / 100,
        customerMarketplaceFeeBps: configuration.customerMarketplaceFeeBps,
        customerMarketplaceFeePercent: configuration.customerMarketplaceFeeBps / 100,
        updatedAt: configuration.updatedAt,
      };
    });
  }

  async getChefConnectStatus(userId: string) {
    const account = await this.prisma.stripeConnectedAccount.findFirst({
      where: { chef: { userId } },
      select: {
        status: true,
        countryCode: true,
        transferCapabilityStatus: true,
        payoutsEnabled: true,
        detailsSubmitted: true,
        requirements: true,
        disabledReason: true,
        onboardingCompletedAt: true,
        lastSyncedAt: true,
      },
    });
    const configuration = await this.ensurePaymentConfiguration();
    return {
      connected: Boolean(account),
      status: account?.status ?? StripeConnectedAccountStatus.pending,
      countryCode: account?.countryCode ?? null,
      eligibleToReceiveTransfers:
        account?.status === StripeConnectedAccountStatus.eligible,
      transferCapabilityStatus: account?.transferCapabilityStatus ?? null,
      payoutsEnabled: account?.payoutsEnabled ?? false,
      detailsSubmitted: account?.detailsSubmitted ?? false,
      requirements: account?.requirements ?? null,
      disabledReason: account?.disabledReason ?? null,
      onboardingCompletedAt: account?.onboardingCompletedAt ?? null,
      lastSyncedAt: account?.lastSyncedAt ?? null,
      chefCommissionBps: configuration.chefCommissionBps,
      chefCommissionPercent: configuration.chefCommissionBps / 100,
    };
  }

  async createOnboardingLink(chefUserId: string) {
    const stripe = this.requireStripe();
    const account = await this.ensureConnectedAccount(chefUserId);
    return this.createAccountLink(stripe, account.chefId, account.stripeAccountId);
  }

  async ensureConnectedAccount(chefUserId: string) {
    const stripe = this.requireStripe();
    const chef = await this.prisma.chefProfile.findUnique({
      where: { userId: chefUserId },
      select: {
        id: true,
        displayName: true,
        countryCode: true,
        user: { select: { email: true } },
        stripeConnectedAccount: { select: { stripeAccountId: true, countryCode: true } },
      },
    });
    if (!chef) throw new NotFoundException('Create a chef profile before setting up payouts.');

    let accountId = chef.stripeConnectedAccount?.stripeAccountId;
    const countryCode = chef.countryCode?.trim().toUpperCase();
    if (!accountId && (!countryCode || !/^[A-Z]{2}$/.test(countryCode))) {
      throw new BadRequestException(
        'Set a valid two-letter country on your chef profile before Stripe payout setup.',
      );
    }
    if (!accountId) {
      const stripeAccount = await stripe.v2.core.accounts.create(
        {
          contact_email: chef.user.email,
          display_name: chef.displayName,
          dashboard: 'express',
          identity: { country: countryCode!.toLowerCase() },
          defaults: {
            responsibilities: {
              fees_collector: 'application',
              losses_collector: 'application',
            },
          },
          configuration: {
            recipient: {
              capabilities: {
                stripe_balance: {
                  stripe_transfers: { requested: true },
                },
              },
            },
          },
          include: ['configuration.recipient', 'identity', 'requirements'],
        },
        { idempotencyKey: `afrochop-connect-chef-${chef.id}` },
      );
      accountId = stripeAccount.id;
      const accountStatus = this.accountStatusUpdate(
        stripeAccount as unknown as StripeAccountSnapshot,
      );
      await this.prisma.stripeConnectedAccount.upsert({
        where: { chefId: chef.id },
        create: {
          chefId: chef.id,
          stripeAccountId: accountId,
          countryCode: countryCode!,
          ...accountStatus,
        },
        update: {
          stripeAccountId: accountId,
          countryCode: countryCode!,
          ...accountStatus,
        },
      });
    }

    return {
      chefId: chef.id,
      stripeAccountId: accountId,
      countryCode: chef.stripeConnectedAccount?.countryCode ?? countryCode ?? null,
    };
  }

  async refreshOnboardingLink(token: string) {
    if (!token || token.length !== 64 || !/^[a-f0-9]+$/i.test(token)) {
      throw new NotFoundException('This payout onboarding refresh link is invalid or expired.');
    }
    const tokenHash = this.hashRefreshToken(token);
    const account = await this.prisma.stripeConnectedAccount.findFirst({
      where: {
        connectRefreshTokenHash: tokenHash,
        connectRefreshTokenUsedAt: null,
        connectRefreshTokenExpiresAt: { gt: new Date() },
      },
      select: { id: true, chefId: true, stripeAccountId: true },
    });
    if (!account) {
      throw new NotFoundException('This payout onboarding refresh link is invalid or expired.');
    }
    const stripe = this.requireStripe();

    const consumed = await this.prisma.stripeConnectedAccount.updateMany({
      where: {
        id: account.id,
        connectRefreshTokenHash: tokenHash,
        connectRefreshTokenUsedAt: null,
        connectRefreshTokenExpiresAt: { gt: new Date() },
      },
      data: { connectRefreshTokenUsedAt: new Date() },
    });
    if (consumed.count !== 1) {
      throw new ConflictException('This payout onboarding refresh link has already been used.');
    }

    const link = await this.createAccountLink(
      stripe,
      account.chefId,
      account.stripeAccountId,
    );
    return link.url;
  }

  async handleStripeWebhook(rawBody: Buffer | undefined, signature: string | undefined) {
    const stripe = this.requireStripe();
    const webhookSecret = this.config.get<string>('STRIPE_WEBHOOK_SECRET');
    if (!webhookSecret) {
      throw new ServiceUnavailableException('Stripe webhook verification is not configured.');
    }
    if (!rawBody || !signature) {
      throw new BadRequestException('A raw request body and Stripe signature are required.');
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch {
      throw new UnauthorizedException('Stripe webhook signature verification failed.');
    }

    if (event.type !== 'account.updated') {
      return { received: true, ignored: true };
    }

    const accountSnapshot = event.data.object as unknown as StripeAccountSnapshot;
    const accountId = accountSnapshot.id;
    if (!accountId) {
      throw new BadRequestException('Stripe account update event has no account ID.');
    }

    try {
      await this.prisma.$transaction(async (transaction) => {
        await transaction.paymentWebhookEvent.create({
          data: {
            stripeEventId: event.id,
            eventType: event.type,
            livemode: event.livemode,
          },
        });

        const account = await transaction.stripeConnectedAccount.findUnique({
          where: { stripeAccountId: accountId },
          select: { id: true },
        });
        if (!account) {
          LOGGER.warn(`Received a Stripe account update for an unlinked account.`);
          return;
        }
        await transaction.stripeConnectedAccount.update({
          where: { id: account.id },
          data: this.accountStatusUpdate(accountSnapshot),
        });
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return { received: true, duplicate: true };
      }
      throw error;
    }

    return { received: true };
  }

  private async createAccountLink(
    stripe: Stripe,
    chefId: string,
    stripeAccountId: string,
  ) {
    const token = randomBytes(32).toString('hex');
    const tokenHash = this.hashRefreshToken(token);
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_LIFETIME_MS);
    const link = await stripe.v2.core.accountLinks.create({
      account: stripeAccountId,
      use_case: {
        type: 'account_onboarding',
        account_onboarding: {
          return_url: this.getRequiredUrl('STRIPE_CONNECT_RETURN_URL'),
          refresh_url: this.buildRefreshUrl(token),
        },
      },
    });
    if (!this.isStripeHostedUrl(link.url)) {
      throw new ServiceUnavailableException('Stripe returned an invalid onboarding URL.');
    }

    await this.prisma.stripeConnectedAccount.update({
      where: { chefId },
      data: {
        connectRefreshTokenHash: tokenHash,
        connectRefreshTokenExpiresAt: expiresAt,
        connectRefreshTokenUsedAt: null,
      },
    });
    return { url: link.url, expiresAt: link.expires_at };
  }

  private buildRefreshUrl(token: string) {
    const refreshBase = this.getRequiredUrl('STRIPE_CONNECT_REFRESH_URL');
    const url = new URL(refreshBase);
    url.searchParams.set('token', token);
    return url.toString();
  }

  private getRequiredUrl(key: string) {
    const rawUrl = this.config.get<string>(key);
    if (!rawUrl) throw new ServiceUnavailableException(`${key} is not configured.`);
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      throw new ServiceUnavailableException(`${key} must be a valid absolute URL.`);
    }
    const allowLocalHttp =
      this.config.get<string>('NODE_ENV') !== 'production' &&
      url.protocol === 'http:' &&
      ['localhost', '127.0.0.1'].includes(url.hostname);
    if (url.protocol !== 'https:' && !allowLocalHttp) {
      throw new ServiceUnavailableException(`${key} must use HTTPS.`);
    }
    if (url.username || url.password) {
      throw new ServiceUnavailableException(`${key} must not contain URL credentials.`);
    }
    return url.toString();
  }

  private isStripeHostedUrl(rawUrl: string) {
    try {
      const url = new URL(rawUrl);
      return (
        url.protocol === 'https:' &&
        ['accounts.stripe.com', 'connect.stripe.com'].includes(url.hostname)
      );
    } catch {
      return false;
    }
  }

  private accountStatusUpdate(account: StripeAccountSnapshot) {
    const requirements = account.requirements ?? {};
    const transferCapabilityStatus =
      account.configuration?.recipient?.capabilities?.stripe_balance
        ?.stripe_transfers?.status ??
      account.capabilities?.transfers?.status ??
      null;
    const currentlyDue = requirements.currently_due ?? [];
    const pastDue = requirements.past_due ?? [];
    const disabledReason =
      requirements.disabled_reason ?? account.disabled_reason ?? null;
    const status =
      transferCapabilityStatus === 'active'
        ? StripeConnectedAccountStatus.eligible
        : disabledReason || pastDue.length > 0
          ? StripeConnectedAccountStatus.restricted
          : StripeConnectedAccountStatus.pending;

    return {
      status,
      transferCapabilityStatus,
      payoutsEnabled: account.payouts_enabled ?? false,
      detailsSubmitted:
        account.details_submitted ?? (currentlyDue.length === 0 && status === StripeConnectedAccountStatus.eligible),
      requirements: {
        currentlyDue,
        eventuallyDue: requirements.eventually_due ?? [],
        pastDue,
        entries: requirements.entries ?? [],
      } as Prisma.InputJsonValue,
      disabledReason,
      ...(status === StripeConnectedAccountStatus.eligible
        ? { onboardingCompletedAt: new Date() }
        : {}),
      lastSyncedAt: new Date(),
    };
  }

  private async ensurePaymentConfiguration() {
    const existing = await this.prisma.paymentConfiguration.findUnique({
      where: { id: PAYMENT_CONFIGURATION_ID },
    });
    if (existing) return existing;

    try {
      return await this.prisma.paymentConfiguration.create({
        data: {
          id: PAYMENT_CONFIGURATION_ID,
          chefCommissionBps: INITIAL_CHEF_COMMISSION_BPS,
          customerMarketplaceFeeBps: INITIAL_CUSTOMER_FEE_BPS,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const configuration = await this.prisma.paymentConfiguration.findUnique({
          where: { id: PAYMENT_CONFIGURATION_ID },
        });
        if (configuration) return configuration;
      }
      throw error;
    }
  }

  private requireStripe() {
    if (!this.stripeClient) {
      throw new ServiceUnavailableException('Stripe is not configured on the server.');
    }
    return this.stripeClient;
  }

  private hashRefreshToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }
}
