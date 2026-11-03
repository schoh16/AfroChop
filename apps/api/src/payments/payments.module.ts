import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { AuthModule } from '../auth/auth.module.js';
import { PaymentsController } from './payments.controller.js';
import { PaymentsService, STRIPE_CLIENT } from './payments.service.js';
import { BookingMoneyService } from './booking-money.service.js';
import { BookingMoneyWorker } from './booking-money.worker.js';

@Module({
  imports: [AuthModule],
  controllers: [PaymentsController],
  providers: [
    {
      provide: STRIPE_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const secretKey = config.get<string>('STRIPE_SECRET_KEY');
        return secretKey ? new Stripe(secretKey, { timeout: 15_000, maxNetworkRetries: 1 }) : null;
      },
    },
    PaymentsService,
    BookingMoneyService,
    BookingMoneyWorker,
  ],
  exports: [PaymentsService, BookingMoneyService],
})
export class PaymentsModule {}
