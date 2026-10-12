import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { QuotesService } from './quotes.service.js';

function build(quote: unknown) {
  const tx = {
    quote: { update: vi.fn().mockResolvedValue({ id: 'q1' }), updateMany: vi.fn() },
    bookingRequest: { update: vi.fn() },
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
  bookingRequest: { customerId: 'cust', status: 'quoted' },
};

describe('QuotesService.respondToQuote', () => {
  it('accepts a quote and moves the booking to awaiting payment', async () => {
    const { service, tx } = build(pendingQuote);
    await service.respondToQuote('cust', 'q1', true);
    expect(tx.quote.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'accepted' }) }),
    );
    expect(tx.bookingRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'awaiting_payment' } }),
    );
  });

  it('declines without changing the booking status', async () => {
    const { service, tx } = build(pendingQuote);
    await service.respondToQuote('cust', 'q1', false);
    expect(tx.bookingRequest.update).not.toHaveBeenCalled();
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
