import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { CatalogModule } from './catalog/catalog.module.js';
import { ChefsModule } from './chefs/chefs.module.js';
import { FarmersModule } from './farmers/farmers.module.js';
import { HealthModule } from './health/health.module.js';
import { MessagesModule } from './messages/messages.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { PaymentsModule } from './payments/payments.module.js';
import { QuotesModule } from './quotes/quotes.module.js';
import { ReviewsModule } from './reviews/reviews.module.js';
import { SafetyModule } from './safety/safety.module.js';
import { MediaModule } from './media/media.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env', '../../.env.local', '.env', '.env.local'],
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    PrismaModule,
    AuthModule,
    HealthModule,
    CatalogModule,
    ChefsModule,
    FarmersModule,
    MessagesModule,
    PaymentsModule,
    QuotesModule,
    ReviewsModule,
    SafetyModule,
    MediaModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
