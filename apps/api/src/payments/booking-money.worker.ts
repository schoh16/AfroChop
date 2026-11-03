import { Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service.js';
import { BookingMoneyService } from './booking-money.service.js';

@Injectable()
export class BookingMoneyWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(BookingMoneyWorker.name);
  private timer?: ReturnType<typeof setInterval>;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly money: BookingMoneyService,
  ) {}

  onApplicationBootstrap() {
    const secret = this.config.get<string>('STRIPE_SECRET_KEY');
    if (!secret) {
      this.logger.warn('Money reconciliation worker is disabled because Stripe is not configured.');
      return;
    }
    const livemode = secret.startsWith('sk_live_') || secret.startsWith('rk_live_');
    try {
      this.money.assertLivePaymentsAllowed(livemode);
    } catch {
      this.logger.warn('Money reconciliation worker is disabled by the live-payment safety gate.');
      return;
    }
    this.timer = setInterval(() => void this.processPending(), 60_000);
    this.timer.unref();
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }

  async processPending() {
    if (this.running) return;
    this.running = true;
    try {
      const candidates = await this.prisma.bookingPayment.findMany({
        where: {
          paidAt: { not: null },
          OR: [
            { lastReconciledAt: null },
            { lastReconciledAt: { lt: new Date(Date.now() - 15 * 60_000) } },
            { refund: { is: { status: 'approved' } } },
          ],
        },
        take: 25, orderBy: { updatedAt: 'asc' },
        include: { refund: true, booking: { select: { status: true } } },
      });
      for (const candidate of candidates) {
        try {
          const payment = await this.money.reconcile(candidate.bookingId);
          if (candidate.refund?.status === 'approved') {
            await this.money.retryApprovedRefund(candidate.bookingId);
          } else if (candidate.booking.status === 'completed' && payment.payoutStatus === 'held' &&
              payment.refundedCents === 0 && !payment.disputeOpen &&
              (!candidate.refund || candidate.refund.status === 'rejected')) {
            await this.money.release(candidate.bookingId);
          }
        } catch {
          this.logger.warn(`Money reconciliation/retry failed for booking ${candidate.bookingId}; inspect its payment error and Stripe state.`);
        }
      }
    } catch {
      this.logger.error('Could not load pending payments for reconciliation. The next scheduled pass will retry.');
    } finally {
      this.running = false;
    }
  }
}
