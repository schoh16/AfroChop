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
import { BookingMoneyService } from './booking-money.service.js';
import { STRIPE_CLIENT } from './payments.constants.js';
import { checkoutCurrencyForCountry } from './currency-policy.js';

export { STRIPE_CLIENT } from './payments.constants.js';
const PAYMENT_CONFIGURATION_ID = 'default';
const INITIAL_CHEF_COMMISSION_BPS = 1_000;
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
    private readonly money: BookingMoneyService,
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

    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.metadata?.groceryOrderId) return { received: true, ignored: true };
      if (session.payment_status === 'paid' && session.client_reference_id) {
        await this.markDepositPaid(session.client_reference_id, session.id);
      }
      return { received: true };
    }
    if (await this.money.handleEvent(event)) return { received: true };
    if (event.type === 'checkout.session.expired') {
      const session = event.data.object as Stripe.Checkout.Session;
      const bookingId = session.client_reference_id ?? session.metadata?.bookingId;
      const quoteId = session.metadata?.quoteId;
      if (bookingId && quoteId) {
        await this.markDepositExpired(bookingId, quoteId, session.id);
      }
      return { received: true };
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

  async createDepositCheckout(customerId: string, quoteId: string) {
    const stripe = this.requireStripe();
    this.money.assertLivePaymentsAllowed(
      this.config.get<string>('STRIPE_SECRET_KEY')?.startsWith('sk_live_') === true ||
      this.config.get<string>('STRIPE_SECRET_KEY')?.startsWith('rk_live_') === true,
    );
    const quote = await this.prisma.quote.findFirst({
      where: { id: quoteId, bookingRequest: { customerId } },
      include: { bookingRequest: true, chef: { select: { countryCode: true } } },
    });
    if (!quote) throw new NotFoundException('Quote not found.');
    const booking = quote.bookingRequest;
    if (quote.status !== 'accepted' || booking.status !== 'awaiting_payment') {
      throw new ConflictException('Accept the quote before paying.');
    }
    const now = new Date();
    if (booking.desiredDate && booking.desiredDate <= now) {
      throw new ConflictException('The requested service time has passed. Discuss a new date with the cook before paying.');
    }
    if (!booking.paymentHoldExpiresAt || booking.paymentHoldExpiresAt <= now) {
      throw new ConflictException('The 24-hour payment hold expired. Request a new quote to continue.');
    }
    const checkoutExpiresAt = booking.desiredDate && booking.desiredDate < booking.paymentHoldExpiresAt
      ? booking.desiredDate
      : booking.paymentHoldExpiresAt;
    if (checkoutExpiresAt.getTime() < now.getTime() + 30 * 60 * 1000) {
      throw new ConflictException('The payment hold is nearly expired. Request a new quote to continue.');
    }
    if (booking.stripeCheckoutSessionId) {
      const existingSession = await stripe.checkout.sessions.retrieve(
        booking.stripeCheckoutSessionId,
      );
      if (existingSession.payment_status === 'paid') {
        await this.markDepositPaid(booking.id, existingSession.id);
        throw new ConflictException('Payment is already complete. Refresh your requests to see the booking.');
      }
      if (existingSession.status === 'open' && existingSession.expires_at * 1000 > checkoutExpiresAt.getTime()) {
        await stripe.checkout.sessions.expire(existingSession.id);
        await this.markDepositExpired(booking.id, quote.id, existingSession.id);
        throw new ConflictException('The payment session extends beyond the service time. Request a new quote before paying.');
      }
      if (
        existingSession.status === 'open' &&
        existingSession.url &&
        existingSession.expires_at * 1000 > now.getTime()
      ) {
        return { url: existingSession.url, sessionId: existingSession.id };
      }
      if (
        existingSession.status === 'expired' ||
        existingSession.expires_at * 1000 <= now.getTime()
      ) {
        await this.markDepositExpired(booking.id, quote.id, existingSession.id);
        throw new ConflictException('The payment session expired. Request a new quote to continue.');
      }
      throw new ConflictException('The existing payment session is no longer available. Refresh your requests.');
    }

    const depositCents = Math.round(Number(quote.amount) * 100);
    if (depositCents < 50) throw new BadRequestException('The amount is too small to charge.');
    const checkoutReturnUrl = this.config.get<string>('CHECKOUT_RETURN_URL');
    const returnBase = checkoutReturnUrl
      ? this.getRequiredUrl('CHECKOUT_RETURN_URL')
      : this.config.get<string>('NODE_ENV') === 'production'
        ? this.getRequiredUrl('CHECKOUT_RETURN_URL')
        : 'http://localhost:8081';
    const configuration = await this.ensurePaymentConfiguration();
    const payment = await this.money.prepareCheckout(
      booking.id,
      depositCents,
      configuration.chefCommissionBps,
      configuration.customerMarketplaceFeeBps,
      checkoutCurrencyForCountry(quote.chef?.countryCode),
    );

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      allowed_payment_method_types: ['card'],
      client_reference_id: booking.id,
      expires_at: Math.floor(checkoutExpiresAt.getTime() / 1000),
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: payment.currency,
            unit_amount: payment.grossCents,
            product_data: { name: 'AfroChop order payment' },
          },
        },
      ],
      metadata: { bookingId: booking.id, quoteId: quote.id, platformFeeCents: String(payment.platformFeeCents) },
      payment_intent_data: { transfer_group: booking.id, metadata: { bookingId: booking.id } },
      success_url: new URL('/?payment=success', returnBase).toString(),
      cancel_url: new URL('/?payment=cancelled', returnBase).toString(),
    }, { idempotencyKey: `afrochop-checkout-${payment.id}` });
    if (!session.url) throw new ServiceUnavailableException('Stripe did not return a checkout URL.');

    const sessionSaved = await this.prisma.$transaction(async (tx) => {
      await tx.bookingPayment.update({ where: { id: payment.id }, data: { updatedAt: new Date() } });
      const saved = await tx.bookingRequest.updateMany({
        where: {
          id: booking.id,
          status: 'awaiting_payment',
          depositPaidAt: null,
          OR: [{ stripeCheckoutSessionId: null }, { stripeCheckoutSessionId: session.id }],
          paymentHoldExpiresAt: { gt: new Date() },
        },
        data: { stripeCheckoutSessionId: session.id, depositAmount: payment.grossCents / 100 },
      });
      if (saved.count === 1) {
        await tx.bookingPayment.update({ where: { id: payment.id }, data: { stripeSessionId: session.id } });
      }
      return saved;
    });
    if (sessionSaved.count !== 1) {
      await stripe.checkout.sessions.expire(session.id);
      throw new ConflictException('The booking payment hold expired. Request a new quote to continue.');
    }
    return { url: session.url, sessionId: session.id };
  }

  async confirmDeposit(customerId: string, quoteId: string) {
    const quote = await this.prisma.quote.findFirst({
      where: { id: quoteId, bookingRequest: { customerId } },
      include: { bookingRequest: true },
    });
    if (!quote) throw new NotFoundException('Quote not found.');
    const booking = quote.bookingRequest;
    if (booking.depositPaidAt) return { paid: true, status: booking.status };
    if (!booking.stripeCheckoutSessionId) return { paid: false, status: booking.status };

    const session = await this.requireStripe().checkout.sessions.retrieve(
      booking.stripeCheckoutSessionId,
    );
    if (session.payment_status !== 'paid') {
      if (
        session.status === 'expired' ||
        (session.expires_at !== null && session.expires_at * 1000 <= Date.now())
      ) {
        await this.markDepositExpired(booking.id, quote.id, session.id);
        return { paid: false, status: 'expired' };
      }
      return { paid: false, status: booking.status };
    }
    return this.markDepositPaid(booking.id, session.id);
  }

  private async markDepositExpired(
    bookingId: string,
    quoteId: string,
    sessionId: string,
  ) {
    await this.prisma.$transaction(async (transaction) => {
      const expired = await transaction.bookingRequest.updateMany({
        where: {
          id: bookingId,
          status: 'awaiting_payment',
          stripeCheckoutSessionId: sessionId,
          depositPaidAt: null,
        },
        data: { status: 'expired' },
      });
      if (expired.count > 0) {
        await transaction.quote.updateMany({
          where: { id: quoteId, bookingRequestId: bookingId, status: 'accepted' },
          data: { status: 'expired' },
        });
      }
    });
  }

  private async markDepositPaid(bookingId: string, sessionId: string) {
    return this.money.capture(sessionId);
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
