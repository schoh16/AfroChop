import {
  ConflictException, ForbiddenException, Inject, Injectable, Logger, NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, UserRole, type BookingPayment } from '@prisma/client';
import Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service.js';
import { STRIPE_CLIENT } from './payments.constants.js';
import type { ReviewBookingRefundDto } from './dto/booking-refund.dto.js';

const transactionOptions = { maxWait: 10_000, timeout: 60_000 };

@Injectable()
export class BookingMoneyService {
  private readonly logger = new Logger(BookingMoneyService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(STRIPE_CLIENT) private readonly stripe: Stripe | null,
  ) {}

  private client() {
    if (!this.stripe) throw new ServiceUnavailableException('Stripe is not configured.');
    return this.stripe;
  }

  private async operation<T>(bookingId: string, callback: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    try {
      return await this.prisma.$transaction(callback, transactionOptions);
    } catch (error) {
      const message = error instanceof ConflictException ? error.message : 'Stripe money operation failed. Reconcile and retry; contact support if it persists.';
      this.logger.error(`Booking ${bookingId}: ${message}`);
      try {
        await this.prisma.bookingPayment.updateMany({ where: { bookingId }, data: { lastError: message } });
      } catch {
        this.logger.error(`Could not persist the money-operation failure for booking ${bookingId}.`);
      }
      throw error;
    }
  }

  assertLivePaymentsAllowed(livemode: boolean) {
    if (livemode && this.config.get<string>('STRIPE_LIVE_PAYMENTS_ENABLED') !== 'true') {
      throw new ServiceUnavailableException('Live payments are disabled until the launch checklist is approved.');
    }
    if (livemode && (this.config.get<string>('NODE_ENV') !== 'production' ||
        this.config.get<string>('DEV_SKIP_COMPLIANCE') === 'true')) {
      throw new ServiceUnavailableException('Live payments require production mode with all compliance gates enabled.');
    }
  }

  async prepareCheckout(
    bookingId: string,
    quoteCents: number,
    chefCommissionBps: number,
    customerFeeBps: number,
    currency: string,
  ) {
    const booking = await this.prisma.bookingRequest.findUnique({
      where: { id: bookingId },
      include: { chef: { include: { stripeConnectedAccount: true } } },
    });
    const account = booking?.chef?.stripeConnectedAccount;
    if (!account || account.status !== 'eligible') {
      throw new ConflictException('The cook must complete Stripe transfer eligibility before payment.');
    }
    const platformFeeCents = Math.round(quoteCents * chefCommissionBps / 10_000);
    const customerFeeCents = Math.round(quoteCents * customerFeeBps / 10_000);
    const grossCents = quoteCents + customerFeeCents;
    const chefCents = quoteCents - platformFeeCents;
    if (![quoteCents, platformFeeCents, customerFeeCents, grossCents, chefCents].every(Number.isSafeInteger) ||
        quoteCents < 50 || chefCents <= 0 || grossCents > 99_999_999) {
      throw new ConflictException('The booking amount or fee configuration cannot be charged.');
    }
    return this.prisma.bookingPayment.upsert({
      where: { bookingId },
      create: {
        bookingId, destinationAccountId: account.stripeAccountId, quoteCents,
        platformFeeCents, customerFeeCents, grossCents, chefCents,
        currency,
      },
      update: {},
    });
  }

  async capture(sessionId: string) {
    const stripe = this.client();
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== 'paid' || !session.client_reference_id || !session.payment_intent) {
      throw new ConflictException('Stripe has not confirmed a paid booking session.');
    }
    const intentId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent.id;
    return this.operation(session.client_reference_id, async (tx) => {
      const payment = await this.lock(tx, session.client_reference_id!);
      if (payment.stripeSessionId !== session.id || session.amount_total !== payment.grossCents ||
          session.currency !== payment.currency) {
        throw new ConflictException('Stripe payment does not match the booking. Contact support.');
      }
      const snapshot = await this.sync(tx, { ...payment, stripePaymentIntentId: intentId });
      await tx.bookingRequest.updateMany({
        where: { id: payment.bookingId, status: 'awaiting_payment', stripeCheckoutSessionId: session.id },
        data: { status: 'confirmed', depositPaidAt: snapshot.paidAt },
      });
      const booking = await tx.bookingRequest.findUniqueOrThrow({ where: { id: payment.bookingId } });
      if (!booking.depositPaidAt) {
        throw new ConflictException('Payment was received but the booking requires support reconciliation.');
      }
      return { paid: true, status: booking.status };
    });
  }

  // Updating the payment row locks all local payout/refund operations for this booking.
  private async lock(tx: Prisma.TransactionClient, bookingId: string) {
    const payment = await tx.bookingPayment.findUnique({ where: { bookingId } });
    if (!payment) {
      throw new ConflictException('This payment predates the accounting flow. An admin must reconcile it in Stripe before any payout or refund.');
    }
    return tx.bookingPayment.update({ where: { id: payment.id }, data: { updatedAt: new Date() } });
  }

  private async entry(tx: Prisma.TransactionClient, payment: BookingPayment, externalId: string, kind: string, amountCents: number) {
    await tx.paymentLedgerEntry.upsert({
      where: { externalId },
      create: { paymentId: payment.id, externalId, kind, amountCents, currency: payment.currency },
      update: {},
    });
  }

  private async sync(tx: Prisma.TransactionClient, payment: BookingPayment) {
    const stripe = this.client();
    if (!payment.stripePaymentIntentId) throw new ConflictException('The payment has not been captured.');
    const intent = await stripe.paymentIntents.retrieve(payment.stripePaymentIntentId, { expand: ['latest_charge.balance_transaction'] });
    const charge = intent.latest_charge;
    if (intent.status !== 'succeeded' || !charge || typeof charge === 'string' ||
        !charge.paid || intent.amount_received !== payment.grossCents || intent.currency !== payment.currency ||
        charge.amount !== payment.grossCents || charge.currency !== payment.currency) {
      throw new ConflictException('Stripe payment reconciliation failed. Funds remain held.');
    }
    let refundedCents = 0;
    let succeededRefundCents = 0;
    for await (const refund of stripe.refunds.list({ payment_intent: intent.id, limit: 100 })) {
      if (refund.status === 'succeeded' || refund.status === 'pending' || refund.status === 'requires_action') {
        refundedCents += refund.amount;
      }
      if (refund.status === 'succeeded') {
        succeededRefundCents += refund.amount;
        await this.entry(tx, payment, refund.id, 'refund', -refund.amount);
      }
      if (refund.metadata?.bookingId === payment.bookingId) {
        await tx.bookingRefund.updateMany({
          where: { paymentId: payment.id },
          data: {
            stripeRefundId: refund.id,
            ...(refund.status === 'succeeded' ? { status: 'succeeded' } : {}),
          },
        });
      }
    }
    let disputeOpen = false;
    for await (const dispute of stripe.disputes.list({ payment_intent: intent.id, limit: 100 })) {
      // Lost disputes continue to block release; Stripe has removed these funds.
      if (!['won', 'warning_closed'].includes(dispute.status)) disputeOpen = true;
      await this.entry(tx, payment, `${dispute.id}:${dispute.status}`, `dispute_${dispute.status}`, 0);
      for (const movement of dispute.balance_transactions) {
        if (movement.currency !== payment.currency) throw new ConflictException('Dispute currency requires manual accounting reconciliation.');
        await this.entry(tx, payment, movement.id, 'dispute_balance_movement', movement.net);
      }
    }
    const transfers: Stripe.Transfer[] = [];
    for await (const transfer of stripe.transfers.list({ transfer_group: payment.bookingId, limit: 100 })) {
      transfers.push(transfer);
    }
    if (transfers.length > 1) throw new ConflictException('Multiple transfers found. Admin reconciliation is required.');
    const transfer = transfers[0];
    if (transfer) {
      const destination = typeof transfer.destination === 'string' ? transfer.destination : transfer.destination?.id;
      if (transfer.amount !== payment.chefCents || transfer.currency !== payment.currency ||
          destination !== payment.destinationAccountId || transfer.source_transaction !== charge.id) {
        throw new ConflictException('Stripe transfer does not match the booking. Admin reconciliation is required.');
      }
      await this.entry(tx, payment, transfer.id, 'chef_transfer', -transfer.amount);
      if ((refundedCents > 0 || disputeOpen) && transfer.amount_reversed < transfer.amount) {
        const reversal = await stripe.transfers.createReversal(transfer.id, {},
          { idempotencyKey: `afrochop-risk-reversal-${payment.id}` });
        await this.entry(tx, payment, reversal.id, 'transfer_reversal', reversal.amount);
        transfer.amount_reversed = transfer.amount;
      }
      for await (const reversal of stripe.transfers.listReversals(transfer.id, { limit: 100 })) {
        await this.entry(tx, payment, reversal.id, 'transfer_reversal', reversal.amount);
      }
    }
    await this.entry(tx, payment, charge.id, 'customer_charge', charge.amount);
    const balance = charge.balance_transaction;
    if (balance && typeof balance !== 'string') {
      if (balance.currency !== payment.currency) throw new ConflictException('Settlement currency requires manual accounting reconciliation.');
      await this.entry(tx, payment, `${balance.id}:fee`, 'stripe_processing_fee', -balance.fee);
    }
    if (succeededRefundCents === payment.grossCents) {
      await tx.bookingRequest.updateMany({
        where: { id: payment.bookingId }, data: { status: 'cancelled' },
      });
    }
    return tx.bookingPayment.update({
      where: { id: payment.id },
      data: {
        stripePaymentIntentId: intent.id, stripeChargeId: charge.id,
        paidAt: payment.paidAt ?? new Date(charge.created * 1000),
        refundedCents, disputeOpen, lastReconciledAt: new Date(), lastError: null,
        ...(transfer ? {
          stripeTransferId: transfer.id,
          payoutStatus: transfer.amount_reversed > 0 ? 'reversed' : 'released',
          releasedAt: new Date(transfer.created * 1000),
        } : {}),
      },
    });
  }

  async release(bookingId: string) {
    return this.operation(bookingId, async (tx) => {
      const payment = await this.sync(tx, await this.lock(tx, bookingId));
      const booking = await tx.bookingRequest.findUniqueOrThrow({ where: { id: bookingId } });
      const refund = await tx.bookingRefund.findUnique({ where: { paymentId: payment.id } });
      if (payment.payoutStatus === 'released') return { status: 'released' };
      if (booking.status !== 'completed' || !booking.chefCompletedAt || !booking.customerCompletedAt) {
        throw new ConflictException('The cook must mark delivery complete and the customer must confirm receipt before funds can be released.');
      }
      if (payment.payoutStatus === 'reversed' || payment.refundedCents > 0 || payment.disputeOpen ||
          (refund && refund.status !== 'rejected')) {
        throw new ConflictException('Funds remain held because of a refund, dispute, or reversed transfer.');
      }
      const account = await tx.stripeConnectedAccount.findUnique({ where: { stripeAccountId: payment.destinationAccountId } });
      if (account?.status !== 'eligible') throw new ConflictException('The cook is not currently eligible for transfers.');
      const intent = await this.client().paymentIntents.retrieve(payment.stripePaymentIntentId!);
      this.assertLivePaymentsAllowed(intent.livemode);
      const transfer = await this.client().transfers.create({
        amount: payment.chefCents, currency: payment.currency,
        destination: payment.destinationAccountId, source_transaction: payment.stripeChargeId!,
        transfer_group: payment.bookingId, metadata: { bookingId },
      }, { idempotencyKey: `afrochop-transfer-${payment.id}` });
      await this.entry(tx, payment, transfer.id, 'chef_transfer', -transfer.amount);
      await tx.bookingPayment.update({
        where: { id: payment.id },
        data: { stripeTransferId: transfer.id, payoutStatus: 'released', releasedAt: new Date() },
      });
      return { status: 'released' };
    });
  }

  private async authorize(bookingId: string, userId: string, role: UserRole) {
    const booking = await this.prisma.bookingRequest.findUnique({
      where: { id: bookingId }, select: { customerId: true, chef: { select: { userId: true } } },
    });
    if (!booking) throw new NotFoundException('Booking not found.');
    if (role !== 'admin' && !(role === 'customer' && booking.customerId === userId) &&
        !(role === 'chef' && booking.chef?.userId === userId)) {
      throw new ForbiddenException('You cannot access another user’s payment.');
    }
  }

  async getStatus(bookingId: string, userId: string, role: UserRole) {
    await this.authorize(bookingId, userId, role);
    const payment = await this.prisma.bookingPayment.findUnique({
      where: { bookingId }, include: { refund: true },
    });
    if (!payment) return { tracked: false, supportRequired: true };
    return {
      tracked: true, currency: payment.currency, grossCents: payment.grossCents,
      customerFeeCents: payment.customerFeeCents, platformFeeCents: payment.platformFeeCents,
      chefCents: payment.chefCents, paidAt: payment.paidAt, refundedCents: payment.refundedCents,
      payoutStatus: payment.payoutStatus, disputeOpen: payment.disputeOpen,
      lastError: payment.lastError,
      refund: payment.refund ? {
        status: payment.refund.status, reason: payment.refund.reason,
        reviewerNotes: payment.refund.reviewerNotes,
      } : null,
    };
  }

  async releaseForUser(bookingId: string, userId: string, role: UserRole) {
    await this.authorize(bookingId, userId, role);
    return this.release(bookingId);
  }

  async requestRefund(bookingId: string, userId: string, reason: string) {
    await this.authorize(bookingId, userId, UserRole.customer);
    return this.prisma.$transaction(async (tx) => {
      const payment = await this.lock(tx, bookingId);
      if (!payment.paidAt || payment.refundedCents > 0) throw new ConflictException('Only a paid, unrefunded booking can request a refund.');
      const existing = await tx.bookingRefund.findUnique({ where: { paymentId: payment.id } });
      if (existing) throw new ConflictException('A refund review already exists. Contact support for further review.');
      return tx.bookingRefund.create({ data: { paymentId: payment.id, reason: reason.trim() } });
    }, transactionOptions);
  }

  async reviewRefund(bookingId: string, adminId: string, dto: ReviewBookingRefundDto) {
    // Persist approval before calling Stripe so failures remain visibly queued and retryable.
    await this.prisma.$transaction(async (tx) => {
      const payment = await this.lock(tx, bookingId);
      const refund = await tx.bookingRefund.findUnique({ where: { paymentId: payment.id } });
      if (!refund) throw new NotFoundException('Refund request not found.');
      if (refund.status === 'succeeded') return;
      if (refund.stripeRefundId && !dto.approved) throw new ConflictException('A submitted Stripe refund cannot be rejected.');
      if (refund.status === 'approved' && !dto.approved) throw new ConflictException('An approved refund cannot be rejected while Stripe may be processing it.');
      await tx.bookingRefund.update({
        where: { id: refund.id },
        data: { status: dto.approved ? 'approved' : 'rejected', reviewerId: adminId, reviewerNotes: dto.notes.trim() },
      });
      await tx.adminAuditLog.create({
        data: { actorId: adminId, action: dto.approved ? 'booking_refund_approved' : 'booking_refund_rejected',
          targetType: 'booking_payment', targetId: payment.id, details: { notes: dto.notes.trim() } },
      });
    }, transactionOptions);
    if (!dto.approved) return { status: 'rejected' };
    return this.retryApprovedRefund(bookingId);
  }

  async retryApprovedRefund(bookingId: string) {
    return this.operation(bookingId, async (tx) => {
      const payment = await this.sync(tx, await this.lock(tx, bookingId));
      const request = await tx.bookingRefund.findUniqueOrThrow({ where: { paymentId: payment.id } });
      if (request.status === 'succeeded') return { status: 'succeeded' };
      if (request.status !== 'approved') throw new ConflictException('An approved refund is required.');
      const stripe = this.client();
      const intent = await stripe.paymentIntents.retrieve(payment.stripePaymentIntentId!);
      this.assertLivePaymentsAllowed(intent.livemode);
      if (payment.disputeOpen) throw new ConflictException('Resolve the payment dispute in Stripe before refunding.');
      if (payment.stripeTransferId) {
        const transfer = await stripe.transfers.retrieve(payment.stripeTransferId);
        const remaining = transfer.amount - transfer.amount_reversed;
        if (remaining > 0) {
          const reversal = await stripe.transfers.createReversal(transfer.id, {},
            { idempotencyKey: `afrochop-refund-reversal-${payment.id}` });
          await this.entry(tx, payment, reversal.id, 'transfer_reversal', reversal.amount);
          await tx.bookingPayment.update({ where: { id: payment.id }, data: { payoutStatus: 'reversed' } });
        }
      }
      if (request.stripeRefundId) {
        const refund = await stripe.refunds.retrieve(request.stripeRefundId);
        if (refund.status === 'failed' || refund.status === 'canceled') {
          throw new ConflictException('Stripe refund failed. Admin intervention in Stripe is required; do not create a duplicate refund.');
        }
        return { status: refund.status };
      }
      if (payment.refundedCents > 0) throw new ConflictException('An external refund already exists. Admin reconciliation is required.');
      const refund = await stripe.refunds.create({
        payment_intent: payment.stripePaymentIntentId!, amount: payment.grossCents,
        metadata: { bookingId },
      }, { idempotencyKey: `afrochop-refund-${payment.id}` });
      await tx.bookingRefund.update({
        where: { id: request.id },
        data: { stripeRefundId: refund.id, ...(refund.status === 'succeeded' ? { status: 'succeeded' } : {}) },
      });
      await this.sync(tx, payment);
      return { status: refund.status };
    });
  }

  async reconcile(bookingId: string) {
    const payment = await this.prisma.bookingPayment.findUnique({ where: { bookingId } });
    if (payment?.stripeSessionId && !payment.stripePaymentIntentId) {
      await this.capture(payment.stripeSessionId);
    }
    return this.operation(bookingId, async (tx) => this.sync(tx, await this.lock(tx, bookingId)));
  }

  async listAdmin() {
    return this.prisma.bookingPayment.findMany({
      take: 100, orderBy: { updatedAt: 'desc' },
      include: { refund: true, entries: { orderBy: { createdAt: 'desc' } },
        booking: { select: { status: true, chefCompletedAt: true, customerCompletedAt: true } } },
    });
  }

  async handleEvent(event: Stripe.Event) {
    let intentId: string | undefined;
    const object = event.data.object;
    if (object.object === 'transfer' && object.transfer_group) {
      const payment = await this.prisma.bookingPayment.findUnique({ where: { bookingId: object.transfer_group } });
      if (!payment) return false;
      await this.reconcile(payment.bookingId);
      return true;
    }
    if (object.object === 'charge') {
      const intent = object.payment_intent;
      intentId = typeof intent === 'string' ? intent : intent?.id;
    } else if (object.object === 'refund' || object.object === 'dispute') {
      const intent = object.payment_intent;
      intentId = typeof intent === 'string' ? intent : intent?.id;
    } else if (object.object === 'payment_intent') {
      intentId = object.id;
    }
    if (!intentId) return false;
    const payment = await this.prisma.bookingPayment.findUnique({ where: { stripePaymentIntentId: intentId } });
    if (!payment) return false;
    await this.prisma.$transaction(async (tx) => {
      const locked = await this.lock(tx, payment.bookingId);
      if (await tx.paymentWebhookEvent.findUnique({ where: { stripeEventId: event.id } })) return;
      await this.sync(tx, locked);
      await tx.paymentWebhookEvent.create({
        data: { stripeEventId: event.id, eventType: event.type, livemode: event.livemode },
      });
    }, transactionOptions);
    return true;
  }
}
