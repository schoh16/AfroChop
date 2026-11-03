import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { QuotesService } from './quotes.service.js';

function build(quote: unknown) {
  const tx = {
    quote: {
      update: vi.fn().mockResolvedValue({ id: 'q1', status: 'declined' }),
      findUnique: vi.fn().mockResolvedValue(quote),
      findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 'q1', status: 'accepted' }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    bookingRequest: {
      findFirst: vi.fn().mockResolvedValue(null),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const prisma = {
    quote: { findUnique: vi.fn().mockResolvedValue(quote) },
    $transaction: vi.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  return { tx, service: new QuotesService(prisma as never) };
}

const pendingQuote = {
  id: 'q1',
  status: 'pending',
  bookingRequestId: 'b1',
  bookingRequest: {
    id: 'b1', chefId: 'chef1', customerId: 'cust', status: 'quoted',
    desiredDate: new Date('2030-01-01T10:00:00Z'), serviceEndAt: new Date('2030-01-01T12:00:00Z'),
  },
};

describe('QuotesService.respondToQuote', () => {
  it('accepts a quote and moves the booking to awaiting payment', async () => {
    const { service, tx } = build(pendingQuote);
    await service.respondToQuote('cust', 'q1', true);
    expect(tx.quote.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'accepted' }) }),
    );
    expect(tx.bookingRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'awaiting_payment', paymentHoldExpiresAt: expect.any(Date) }) }),
    );
  });

  it('declines without changing the booking status', async () => {
    const { service, tx } = build(pendingQuote);
    await service.respondToQuote('cust', 'q1', false);
    expect(tx.bookingRequest.updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'awaiting_payment' }) }),
    );
  });

  it("hides another customer's quote", async () => {
    const { service } = build(pendingQuote);
    await expect(service.respondToQuote('other', 'q1', true)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects answering a quote twice', async () => {
    const { service } = build({ ...pendingQuote, status: 'accepted' });
    await expect(service.respondToQuote('cust', 'q1', true)).rejects.toBeInstanceOf(BadRequestException);
  });
});
