import { ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PaymentsService } from './payments.service.js';

function build(
  quote: unknown,
  session?: {
    payment_status: string;
    status?: string;
    expires_at?: number;
    id?: string;
    url?: string | null;
  },
) {
  const transaction = {
    bookingRequest: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    bookingPayment: { update: vi.fn() },
    quote: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
  };
  const prisma = {
    quote: { findFirst: vi.fn().mockResolvedValue(quote) },
    bookingRequest: {
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: vi.fn((callback: (tx: typeof transaction) => unknown) => callback(transaction)),
    paymentConfiguration: {
      findUnique: vi.fn().mockResolvedValue({ chefCommissionBps: 1000, customerMarketplaceFeeBps: 0 }),
    },
  };
  const stripe = {
    checkout: {
      sessions: {
        create: vi.fn().mockResolvedValue({ id: 'cs_1', url: 'https://checkout.stripe.com/x' }),
        retrieve: vi.fn().mockResolvedValue(session),
        expire: vi.fn(),
      },
    },
  };
  const config = { get: vi.fn() };
  const money = {
    assertLivePaymentsAllowed: vi.fn(),
    prepareCheckout: vi.fn().mockResolvedValue({
      id: 'p1',
      currency: 'usd',
      grossCents: 45000,
      platformFeeCents: 4500,
    }),
    capture: vi.fn().mockResolvedValue({ paid: true, status: 'confirmed' }),
    handleEvent: vi.fn().mockResolvedValue(false),
  };
  const service = new PaymentsService(prisma as never, config as never, stripe as never, money as never);
  return { service, prisma, stripe, transaction, money };
}

const accepted = {
  id: 'q1',
  status: 'accepted',
  amount: 450,
  downPaymentPercent: 50,
  chef: { countryCode: 'US' },
  bookingRequest: {
    id: 'b1',
    status: 'awaiting_payment',
    depositPaidAt: null,
    stripeCheckoutSessionId: null,
    paymentHoldExpiresAt: new Date(Date.now() + 24 * 60 * 60_000),
  },
};
const acceptedWithSession = {
  ...accepted,
  bookingRequest: { ...accepted.bookingRequest, stripeCheckoutSessionId: 'cs_1' },
};

describe('deposit checkout', () => {
  it('charges the full quote amount', async () => {
    const { service, stripe, prisma, money } = build(accepted);
    await service.createDepositCheckout('c1', 'q1');
    const args = stripe.checkout.sessions.create.mock.calls[0][0];
    expect(args.line_items[0].price_data.unit_amount).toBe(45000);
    expect(args.line_items[0].price_data.currency).toBe('usd');
    expect(args.metadata.platformFeeCents).toBe('4500');
    expect(args.expires_at).toBeGreaterThan(Math.floor(Date.now() / 1000));
    expect(money.prepareCheckout).toHaveBeenCalledWith('b1', 45000, 1000, 0, 'usd');
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('uses the chef market currency when creating checkout', async () => {
    const euroQuote = {
      ...accepted,
      chef: { countryCode: 'FR' },
    };
    const checkout = build(euroQuote);
    checkout.money.prepareCheckout.mockResolvedValue({
      id: 'p1',
      currency: 'eur',
      grossCents: 45000,
      platformFeeCents: 4500,
    });
    await checkout.service.createDepositCheckout('c1', 'q1');
    const args = checkout.stripe.checkout.sessions.create.mock.calls[0][0];
    expect(args.line_items[0].price_data.currency).toBe('eur');
    expect(checkout.money.prepareCheckout).toHaveBeenCalledWith('b1', 45000, 1000, 0, 'eur');
  });

  it('rejects quotes the customer does not own', async () => {
    const { service } = build(null);
    await expect(service.createDepositCheckout('c1', 'q1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects unaccepted quotes', async () => {
    const { service } = build({ ...accepted, status: 'pending' });
    await expect(service.createDepositCheckout('c1', 'q1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('reuses an existing open checkout session instead of creating a second charge path', async () => {
    const checkout = build(acceptedWithSession, {
      payment_status: 'unpaid',
      status: 'open',
      expires_at: Math.floor((Date.now() + 60 * 60_000) / 1000),
      id: 'cs_1',
      url: 'https://checkout.stripe.com/existing',
    });
    await expect(checkout.service.createDepositCheckout('c1', 'q1')).resolves.toEqual({
      url: 'https://checkout.stripe.com/existing',
      sessionId: 'cs_1',
    });
    expect(checkout.stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it('rejects checkout after the payment hold expires', async () => {
    const expiredHold = {
      ...accepted,
      bookingRequest: {
        ...accepted.bookingRequest,
        paymentHoldExpiresAt: new Date(Date.now() - 1000),
      },
    };
    const checkout = build(expiredHold);
    await expect(checkout.service.createDepositCheckout('c1', 'q1'))
      .rejects.toThrow('payment hold expired');
    expect(checkout.stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it('confirms the booking only when Stripe reports paid', async () => {
    const unpaid = build(acceptedWithSession, { payment_status: 'unpaid' });
    expect(await unpaid.service.confirmDeposit('c1', 'q1')).toMatchObject({ paid: false });
    expect(unpaid.prisma.bookingRequest.updateMany).not.toHaveBeenCalled();

    const paid = build(acceptedWithSession, { payment_status: 'paid', id: 'cs_1' });
    expect(await paid.service.confirmDeposit('c1', 'q1')).toMatchObject({ paid: true, status: 'confirmed' });
  });

  it('expires the quote and releases the hold after checkout expires', async () => {
    const expired = build(acceptedWithSession, {
      payment_status: 'unpaid',
      status: 'expired',
      id: 'cs_1',
    });
    expect(await expired.service.confirmDeposit('c1', 'q1')).toMatchObject({
      paid: false,
      status: 'expired',
    });
    expect(expired.transaction.bookingRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'expired' } }),
    );
    expect(expired.transaction.quote.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'expired' } }),
    );
  });
});
