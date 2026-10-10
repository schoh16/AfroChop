import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { JwtAuthGuard, type AuthenticatedRequest } from '../auth/jwt-auth.guard.js';
import { PaymentsController } from './payments.controller.js';
import { PaymentsService } from './payments.service.js';

vi.mock('@nestjs/jwt', () => ({ JwtService: class TestJwtService {} }));

class TestBearerGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (token === 'chef-token') {
      req.user = { sub: 'chef-user-id', role: UserRole.chef };
      return true;
    }
    if (token === 'customer-token') {
      req.user = { sub: 'customer-id', role: UserRole.customer };
      return true;
    }
    if (token === 'admin-token') {
      req.user = { sub: 'admin-id', role: UserRole.admin };
      return true;
    }
    throw new UnauthorizedException('A valid test access token is required.');
  }
}

describe('Payments API (e2e)', () => {
  let app: INestApplication<App>;
  const paymentsService = {
    getCustomerPaymentConfiguration: vi.fn(),
    getChefConnectStatus: vi.fn(),
    createOnboardingLink: vi.fn(),
    refreshOnboardingLink: vi.fn(),
    getAdminPaymentConfiguration: vi.fn(),
    updatePaymentConfiguration: vi.fn(),
    handleStripeWebhook: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const builder = Test.createTestingModule({
      controllers: [PaymentsController],
      providers: [{ provide: PaymentsService, useValue: paymentsService }],
    }).overrideGuard(JwtAuthGuard).useClass(TestBearerGuard);
    const module = await builder.compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  it('requires chef authorization to create a Stripe onboarding link', async () => {
    paymentsService.createOnboardingLink.mockResolvedValue({
      url: 'https://accounts.stripe.com/onboarding/one-time',
      expiresAt: '2026-10-08T23:00:00.000Z',
    });
    await request(app.getHttpServer())
      .post('/api/payments/chef/connect/onboarding')
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/payments/chef/connect/onboarding')
      .set('Authorization', 'Bearer customer-token')
      .expect(403);
    const response = await request(app.getHttpServer())
      .post('/api/payments/chef/connect/onboarding')
      .set('Authorization', 'Bearer chef-token')
      .expect(201);

    expect(response.body.url).toBe('https://accounts.stripe.com/onboarding/one-time');
    expect(paymentsService.createOnboardingLink).toHaveBeenCalledWith('chef-user-id');
  });

  it('restricts commission configuration changes to admins and validates basis points', async () => {
    await request(app.getHttpServer())
      .patch('/api/payments/admin/configuration')
      .set('Authorization', 'Bearer chef-token')
      .send({ chefCommissionBps: 1500, customerMarketplaceFeeBps: 250 })
      .expect(403);
    await request(app.getHttpServer())
      .patch('/api/payments/admin/configuration')
      .set('Authorization', 'Bearer admin-token')
      .send({ chefCommissionBps: 10001, customerMarketplaceFeeBps: 250 })
      .expect(400);

    paymentsService.updatePaymentConfiguration.mockResolvedValue({
      chefCommissionBps: 1500,
      chefCommissionPercent: 15,
      customerMarketplaceFeeBps: 250,
      customerMarketplaceFeePercent: 2.5,
    });
    const response = await request(app.getHttpServer())
      .patch('/api/payments/admin/configuration')
      .set('Authorization', 'Bearer admin-token')
      .send({ chefCommissionBps: 1500, customerMarketplaceFeeBps: 250 })
      .expect(200);

    expect(response.body.chefCommissionPercent).toBe(15);
    expect(paymentsService.updatePaymentConfiguration).toHaveBeenCalledWith(
      'admin-id',
      expect.objectContaining({
        chefCommissionBps: 1500,
        customerMarketplaceFeeBps: 250,
      }),
    );
  });

  it('exposes only the customer fee from the public payment configuration endpoint', async () => {
    paymentsService.getCustomerPaymentConfiguration.mockResolvedValue({
      customerMarketplaceFeeBps: 0,
      customerMarketplaceFeePercent: 0,
    });
    const response = await request(app.getHttpServer())
      .get('/api/payments/configuration')
      .expect(200);
    expect(response.body).toEqual({
      customerMarketplaceFeeBps: 0,
      customerMarketplaceFeePercent: 0,
    });
  });
});
