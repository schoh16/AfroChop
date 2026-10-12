import { ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PaymentsService } from './payments.service.js';

function build(quote: unknown, session?: { payment_status: string }) {
  const prisma = {
    quote: { findFirst: vi.fn().mockResolvedValue(quote) },
    bookingRequest: { update: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    paymentConfiguration: {
      findUnique: vi.fn().mockResolvedValue({ chefCommissionBps: 1000, customerMarketplaceFeeBps: 0 }),
    },
  };
  const stripe = {
    checkout: {
      sessions: {
        create: vi.fn().mockResolvedValue({ id: 'cs_1', url: 'https://checkout.stripe.com/x' }),
        retrieve: vi.fn().mockResolvedValue(session),
      },
    },
  };
  const config = { get: vi.fn() };
  const service = new PaymentsService(prisma as never, config as never, stripe as never);
  return { service, prisma, stripe };
}

const accepted = {
  id: 'q1',
  status: 'accepted',
  amount: 450,
  downPaymentPercent: 50,
  bookingRequest: { id: 'b1', status: 'awaiting_payment', depositPaidAt: null, stripeCheckoutSessionId: 'cs_1' },
};

describe('deposit checkout', () => {
  it('charges the deposit percentage of the quote', async () => {
    const { service, stripe, prisma } = build(accepted);
    await service.createDepositCheckout('c1', 'q1');
    const args = stripe.checkout.sessions.create.mock.calls[0][0];
    expect(args.line_items[0].price_data.unit_amount).toBe(22500);
    expect(args.metadata.platformFeeCents).toBe('2250');
    expect(prisma.bookingRequest.update).toHaveBeenCalled();
  });

  it('rejects quotes the customer does not own', async () => {
    const { service } = build(null);
    await expect(service.createDepositCheckout('c1', 'q1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects unaccepted quotes', async () => {
    const { service } = build({ ...accepted, status: 'pending' });
    await expect(service.createDepositCheckout('c1', 'q1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('confirms the booking only when Stripe reports paid', async () => {
    const unpaid = build(accepted, { payment_status: 'unpaid' });
    expect(await unpaid.service.confirmDeposit('c1', 'q1')).toMatchObject({ paid: false });
    expect(unpaid.prisma.bookingRequest.updateMany).not.toHaveBeenCalled();

    const paid = build(accepted, { payment_status: 'paid' });
    expect(await paid.service.confirmDeposit('c1', 'q1')).toMatchObject({ paid: true, status: 'confirmed' });
  });
});
