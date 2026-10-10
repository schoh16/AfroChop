import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { CatalogModule } from './catalog/catalog.module.js';
import { ChefsModule } from './chefs/chefs.module.js';
import { HealthModule } from './health/health.module.js';
import { MessagesModule } from './messages/messages.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { PaymentsModule } from './payments/payments.module.js';
import { QuotesModule } from './quotes/quotes.module.js';
import { ReviewsModule } from './reviews/reviews.module.js';
import { SafetyModule } from './safety/safety.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env', '../../.env.local', '.env', '.env.local'],
    }),
    PrismaModule,
    AuthModule,
    HealthModule,
    CatalogModule,
    ChefsModule,
    MessagesModule,
    PaymentsModule,
    QuotesModule,
    ReviewsModule,
    SafetyModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
