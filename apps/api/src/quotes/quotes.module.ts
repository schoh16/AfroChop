import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { QuotesController } from './quotes.controller.js';
import { QuotesService } from './quotes.service.js';
import { SmsNotificationService } from '../notifications/sms-notification.service.js';
import { PaymentsModule } from '../payments/payments.module.js';

@Module({
  imports: [AuthModule, PaymentsModule],
  controllers: [QuotesController],
  providers: [QuotesService, SmsNotificationService],
  exports: [QuotesService],
})
export class QuotesModule {}
