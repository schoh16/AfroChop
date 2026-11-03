import { describe, expect, it, vi } from 'vitest';
import type { BookingPayment } from '@prisma/client';
import { BookingMoneyService } from './booking-money.service.js';

function iterable<T>(values: T[]) {
  return (async function* () { for (const value of values) yield value; })();
}

function build() {
  let payment: BookingPayment = {
    id: 'p1', bookingId: 'b1', stripeSessionId: 'cs_1', stripePaymentIntentId: 'pi_1',
    stripeChargeId: 'ch_1', stripeTransferId: null, destinationAccountId: 'acct_1',
    currency: 'usd', quoteCents: 10000, customerFeeCents: 250, platformFeeCents: 1000,
    grossCents: 10250, chefCents: 9000, refundedCents: 0, disputeOpen: false,
    paidAt: new Date(), payoutStatus: 'held', releasedAt: null, lastReconciledAt: null, lastError: null,
    createdAt: new Date(), updatedAt: new Date(),
  };
  const booking = {
    id: 'b1', customerId: 'c1', chef: { userId: 'chef1', stripeConnectedAccount: { status: 'eligible', stripeAccountId: 'acct_1' } },
    status: 'completed', chefCompletedAt: new Date(), customerCompletedAt: new Date(),
    depositPaidAt: new Date(), stripeCheckoutSessionId: 'cs_1',
  };
  let refundRequest: { id: string; paymentId: string; status: string; stripeRefundId: string | null } | null = null;
  const remoteRefunds: { id: string; amount: number; status: string; metadata: { bookingId?: string } }[] = [];
  const remoteTransfers: { id: string; amount: number; currency: string; destination: string; source_transaction: string; amount_reversed: number; created: number }[] = [];
  const remoteDisputes: { id: string; amount: number; status: string; balance_transactions: { id: string; net: number; currency: string }[] }[] = [];
  const entries = new Map<string, { kind: string; amountCents: number }>();
  const tx = {
    bookingPayment: {
      findUnique: vi.fn(async () => payment),
      update: vi.fn(async ({ data }) => { payment = { ...payment, ...data }; return payment; }),
      updateMany: vi.fn(async ({ data }) => { payment = { ...payment, ...data }; return { count: 1 }; }),
      upsert: vi.fn(async ({ create }) => ({ ...payment, ...create })),
    },
    bookingRequest: {
      findUnique: vi.fn(async () => booking),
      findUniqueOrThrow: vi.fn(async () => booking),
      updateMany: vi.fn(async ({ data }) => { Object.assign(booking, data); return { count: 1 }; }),
    },
    bookingRefund: {
      findUnique: vi.fn(async () => refundRequest),
      findUniqueOrThrow: vi.fn(async () => refundRequest),
      create: vi.fn(async ({ data }) => { refundRequest = { id: 'r1', stripeRefundId: null, status: 'requested', ...data }; return refundRequest; }),
      update: vi.fn(async ({ data }) => { refundRequest = { ...refundRequest!, ...data }; return refundRequest; }),
      updateMany: vi.fn(async ({ data }) => { if (refundRequest) Object.assign(refundRequest, data); return { count: refundRequest ? 1 : 0 }; }),
    },
    stripeConnectedAccount: { findUnique: vi.fn(async () => ({ status: 'eligible' })) },
    paymentLedgerEntry: { upsert: vi.fn(async ({ create }) => { entries.set(create.externalId, create); }) },
    adminAuditLog: { create: vi.fn() },
    paymentWebhookEvent: { findUnique: vi.fn(), create: vi.fn() },
  };
  const prisma = { ...tx, $transaction: vi.fn(async (callback) => callback(tx)) };
  const stripe = {
    checkout: { sessions: { retrieve: vi.fn(async () => ({ id: 'cs_1', client_reference_id: 'b1', payment_status: 'paid', payment_intent: 'pi_1', amount_total: 10250, currency: 'usd' })) } },
    paymentIntents: { retrieve: vi.fn(async () => ({
      id: 'pi_1', status: 'succeeded', currency: 'usd', amount_received: 10250, livemode: false,
      latest_charge: { id: 'ch_1', paid: true, currency: 'usd', amount: 10250, created: 100,
        balance_transaction: { id: 'txn_1', fee: 328, currency: 'usd' } },
    })) },
    refunds: {
      list: vi.fn(() => iterable(remoteRefunds)),
      create: vi.fn(async () => {
        const refund = { id: 're_1', amount: 10250, status: 'succeeded', metadata: { bookingId: 'b1' } };
        remoteRefunds.push(refund); return refund;
      }),
      retrieve: vi.fn(async () => remoteRefunds[0]),
    },
    disputes: { list: vi.fn(() => iterable(remoteDisputes)) },
    transfers: {
      list: vi.fn(() => iterable(remoteTransfers)),
      listReversals: vi.fn(() => iterable([])),
      create: vi.fn(async () => {
        const transfer = { id: 'tr_1', amount: 9000, currency: 'usd', destination: 'acct_1', source_transaction: 'ch_1', amount_reversed: 0, created: 100 };
        remoteTransfers.push(transfer); return transfer;
      }),
      retrieve: vi.fn(async () => remoteTransfers[0]),
      createReversal: vi.fn(async () => { remoteTransfers[0].amount_reversed = 9000; return { id: 'trr_1', amount: 9000 }; }),
    },
  };
  const config = { get: vi.fn() };
  const service = new BookingMoneyService(prisma as never, config as never, stripe as never);
  return { service, prisma, tx, stripe, config, booking, entries, remoteRefunds, remoteTransfers, remoteDisputes,
    get payment() { return payment; }, setPayment(data: Partial<BookingPayment>) { Object.assign(payment, data); } };
}

describe('booking money operations', () => {
  it('snapshots commission and customer fee in integer cents', async () => {
    const setup = build();
    const payment = await setup.service.prepareCheckout('b1', 10000, 1500, 250);
    expect(payment).toMatchObject({ quoteCents: 10000, platformFeeCents: 1500, customerFeeCents: 250, grossCents: 10250, chefCents: 8500 });
    expect(setup.tx.bookingPayment.upsert.mock.calls[0][0].update).toEqual({});
  });

  it('requires an eligible connected account before checkout', async () => {
    const setup = build();
    setup.booking.chef.stripeConnectedAccount.status = 'pending';
    await expect(setup.service.prepareCheckout('b1', 10000, 1000, 0)).rejects.toThrow('eligibility');
  });

  it('requires both ordered completion confirmations before release', async () => {
    const setup = build();
    setup.booking.customerCompletedAt = null as never;
    await expect(setup.service.release('b1')).rejects.toThrow('customer must confirm receipt');
    expect(setup.stripe.transfers.create).not.toHaveBeenCalled();
  });

  it('releases exactly the snapshotted chef share and records processing fees', async () => {
    const setup = build();
    expect(await setup.service.release('b1')).toEqual({ status: 'released' });
    expect(setup.stripe.transfers.create).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 9000, currency: 'usd', destination: 'acct_1', source_transaction: 'ch_1', transfer_group: 'b1' }),
      { idempotencyKey: 'afrochop-transfer-p1' },
    );
    expect(setup.entries.get('txn_1:fee')).toMatchObject({ amountCents: -328 });
  });

  it('reconciles a remote transfer after a local failure without transferring twice', async () => {
    const setup = build();
    await setup.service.release('b1');
    setup.setPayment({ stripeTransferId: null, payoutStatus: 'held' });
    await setup.service.release('b1');
    expect(setup.stripe.transfers.create).toHaveBeenCalledTimes(1);
  });

  it('blocks release when a refund review is open', async () => {
    const setup = build();
    await setup.service.requestRefund('b1', 'c1', 'Service was not provided.');
    await expect(setup.service.release('b1')).rejects.toThrow('refund, dispute');
    expect(setup.stripe.transfers.create).not.toHaveBeenCalled();
  });

  it('blocks open and lost disputes and records balance movements', async () => {
    const setup = build();
    setup.remoteDisputes.push({ id: 'dp_1', status: 'lost', amount: 10250, balance_transactions: [{ id: 'txn_dp', net: -11750, currency: 'usd' }] });
    await expect(setup.service.release('b1')).rejects.toThrow('refund, dispute');
    expect(setup.entries.get('txn_dp')).toMatchObject({ amountCents: -11750 });
  });

  it('releases held funds after a dispute is won when no transfer was reversed', async () => {
    const setup = build();
    setup.remoteDisputes.push({ id: 'dp_1', status: 'won', amount: 10250, balance_transactions: [] });
    await expect(setup.service.release('b1')).resolves.toEqual({ status: 'released' });
  });

  it('reverses an already released transfer when a dispute opens', async () => {
    const setup = build();
    await setup.service.release('b1');
    setup.remoteDisputes.push({ id: 'dp_1', status: 'needs_response', amount: 10250, balance_transactions: [] });
    await setup.service.reconcile('b1');
    expect(setup.stripe.transfers.createReversal).toHaveBeenCalledTimes(1);
    expect(setup.payment.payoutStatus).toBe('reversed');
  });

  it('requires customer ownership for refund requests', async () => {
    const setup = build();
    await expect(setup.service.requestRefund('b1', 'other', 'Refund requested.')).rejects.toThrow('another user');
    expect(setup.tx.bookingRefund.create).not.toHaveBeenCalled();
  });

  it('does not move money when an admin rejects a refund', async () => {
    const setup = build();
    await setup.service.requestRefund('b1', 'c1', 'Service was not provided.');
    await setup.service.reviewRefund('b1', 'admin1', { approved: false, notes: 'Service completion evidence received.' });
    expect(setup.stripe.refunds.create).not.toHaveBeenCalled();
    expect(setup.tx.adminAuditLog.create).toHaveBeenCalled();
  });

  it('reverses the chef transfer before a full approved refund and retries without duplication', async () => {
    const setup = build();
    await setup.service.release('b1');
    await setup.service.requestRefund('b1', 'c1', 'Service was not provided.');
    await setup.service.reviewRefund('b1', 'admin1', { approved: true, notes: 'Full refund approved after review.' });
    await setup.service.reviewRefund('b1', 'admin1', { approved: true, notes: 'Retry the previously approved refund.' });
    expect(setup.stripe.refunds.create).toHaveBeenCalledTimes(1);
    expect(setup.stripe.transfers.createReversal).toHaveBeenCalledTimes(1);
    expect(setup.stripe.transfers.createReversal.mock.invocationCallOrder[0]).toBeLessThan(setup.stripe.refunds.create.mock.invocationCallOrder[0]);
    expect(setup.booking.status).toBe('cancelled');
  });

  it('does not refund while a dispute is unresolved', async () => {
    const setup = build();
    await setup.service.requestRefund('b1', 'c1', 'Service was not provided.');
    setup.remoteDisputes.push({ id: 'dp_1', status: 'needs_response', amount: 10250, balance_transactions: [] });
    await expect(setup.service.reviewRefund('b1', 'admin1', { approved: true, notes: 'Full refund approved after review.' })).rejects.toThrow('Resolve the payment dispute');
    expect(setup.stripe.refunds.create).not.toHaveBeenCalled();
  });

  it('rejects mismatched checkout amount before marking payment paid', async () => {
    const setup = build();
    setup.stripe.checkout.sessions.retrieve.mockResolvedValueOnce({
      id: 'cs_1', client_reference_id: 'b1', payment_status: 'paid', payment_intent: 'pi_1', amount_total: 1, currency: 'usd',
    });
    await expect(setup.service.capture('cs_1')).rejects.toThrow('does not match');
    expect(setup.tx.bookingRequest.updateMany).not.toHaveBeenCalled();
  });

  it('records a paid checkout and confirms the booking idempotently', async () => {
    const setup = build();
    setup.booking.status = 'awaiting_payment';
    setup.booking.depositPaidAt = null as never;
    setup.setPayment({ paidAt: null, stripePaymentIntentId: null, stripeChargeId: null });
    await expect(setup.service.capture('cs_1')).resolves.toEqual({ paid: true, status: 'confirmed' });
    await expect(setup.service.capture('cs_1')).resolves.toEqual({ paid: true, status: 'confirmed' });
    expect(setup.payment.stripePaymentIntentId).toBe('pi_1');
    expect(setup.entries.get('ch_1')).toMatchObject({ amountCents: 10250 });
  });

  it('leaves an approved refund retryable when Stripe fails', async () => {
    const setup = build();
    await setup.service.requestRefund('b1', 'c1', 'Service was not provided.');
    setup.stripe.refunds.create.mockRejectedValueOnce(new Error('Connection failed'));
    await expect(setup.service.reviewRefund('b1', 'admin1', { approved: true, notes: 'Full refund approved after review.' })).rejects.toThrow('Connection failed');
    expect(setup.payment.lastError).toContain('Stripe money operation failed');
    await expect(setup.service.reviewRefund('b1', 'admin1', { approved: true, notes: 'Retry the approved full refund.' })).resolves.toEqual({ status: 'succeeded' });
  });

  it('rejects duplicate or mismatched remote transfer records', async () => {
    const setup = build();
    await setup.service.release('b1');
    setup.remoteTransfers.push({ ...setup.remoteTransfers[0], id: 'tr_2' });
    await expect(setup.service.reconcile('b1')).rejects.toThrow('Multiple transfers');
  });

  it('keeps live payment operations disabled by default', () => {
    const setup = build();
    expect(() => setup.service.assertLivePaymentsAllowed(true)).toThrow('Live payments are disabled');
    expect(() => setup.service.assertLivePaymentsAllowed(false)).not.toThrow();
  });
});
