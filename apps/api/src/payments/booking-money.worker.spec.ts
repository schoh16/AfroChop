import { describe, expect, it, vi } from 'vitest';
import { BookingMoneyWorker } from './booking-money.worker.js';

function build(candidates: unknown[]) {
  const prisma = { bookingPayment: { findMany: vi.fn().mockResolvedValue(candidates) } };
  const money = {
    assertLivePaymentsAllowed: vi.fn(),
    reconcile: vi.fn().mockResolvedValue({ payoutStatus: 'held', refundedCents: 0, disputeOpen: false }),
    release: vi.fn(),
    retryApprovedRefund: vi.fn(),
  };
  const config = { get: vi.fn() };
  const worker = new BookingMoneyWorker(prisma as never, config as never, money as never);
  return { worker, prisma, money, config };
}

describe('payment reconciliation worker', () => {
  it('reconciles and releases completed eligible bookings', async () => {
    const setup = build([{ bookingId: 'b1', refund: null, booking: { status: 'completed' } }]);
    await setup.worker.processPending();
    expect(setup.money.reconcile).toHaveBeenCalledWith('b1');
    expect(setup.money.release).toHaveBeenCalledWith('b1');
  });

  it('does not release bookings without customer completion', async () => {
    const setup = build([{ bookingId: 'b1', refund: null, booking: { status: 'confirmed' } }]);
    await setup.worker.processPending();
    expect(setup.money.release).not.toHaveBeenCalled();
  });

  it('retries admin-approved refunds without issuing transfers', async () => {
    const setup = build([{ bookingId: 'b1', refund: { status: 'approved' }, booking: { status: 'completed' } }]);
    await setup.worker.processPending();
    expect(setup.money.retryApprovedRefund).toHaveBeenCalledWith('b1');
    expect(setup.money.release).not.toHaveBeenCalled();
  });

  it('keeps open refund reviews on hold', async () => {
    const setup = build([{ bookingId: 'b1', refund: { status: 'requested' }, booking: { status: 'completed' } }]);
    await setup.worker.processPending();
    expect(setup.money.release).not.toHaveBeenCalled();
    expect(setup.money.retryApprovedRefund).not.toHaveBeenCalled();
  });

  it('continues reconciling the batch after one Stripe operation fails', async () => {
    const setup = build([
      { bookingId: 'b1', refund: null, booking: { status: 'confirmed' } },
      { bookingId: 'b2', refund: null, booking: { status: 'confirmed' } },
    ]);
    setup.money.reconcile.mockRejectedValueOnce(new Error('Stripe unavailable'));
    await setup.worker.processPending();
    expect(setup.money.reconcile).toHaveBeenCalledWith('b2');
  });

  it('does not start a timer without Stripe credentials', () => {
    const setup = build([]);
    const timer = vi.spyOn(global, 'setInterval');
    try {
      setup.worker.onApplicationBootstrap();
      expect(timer).not.toHaveBeenCalled();
    } finally {
      setup.worker.onApplicationShutdown();
      timer.mockRestore();
    }
  });
});
