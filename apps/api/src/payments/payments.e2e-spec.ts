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
import { BookingMoneyService } from './booking-money.service.js';

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
  const money = {
    getStatus: vi.fn(), requestRefund: vi.fn(), reviewRefund: vi.fn(), releaseForUser: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const builder = Test.createTestingModule({
      controllers: [PaymentsController],
      providers: [
        { provide: PaymentsService, useValue: paymentsService },
        { provide: BookingMoneyService, useValue: money },
      ],
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

  it('restricts refund review to admins and rejects blank review notes', async () => {
    const path = '/api/payments/admin/bookings/11111111-1111-4111-8111-111111111111/refund-review';
    await request(app.getHttpServer()).post(path).set('Authorization', 'Bearer customer-token')
      .send({ approved: true, notes: 'Please approve the full refund.' }).expect(403);
    await request(app.getHttpServer()).post(path).set('Authorization', 'Bearer admin-token')
      .send({ approved: true, notes: '             ' }).expect(400);
    money.reviewRefund.mockResolvedValue({ status: 'succeeded' });
    await request(app.getHttpServer()).post(path).set('Authorization', 'Bearer admin-token')
      .send({ approved: true, notes: 'Approved with supporting evidence.' }).expect(201);
    expect(money.reviewRefund).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111', 'admin-id',
      { approved: true, notes: 'Approved with supporting evidence.' },
    );
  });

  it('permits refund requests only for customers and validates reason length', async () => {
    const path = '/api/payments/bookings/11111111-1111-4111-8111-111111111111/refund-request';
    await request(app.getHttpServer()).post(path).set('Authorization', 'Bearer chef-token')
      .send({ reason: 'Service did not happen.' }).expect(403);
    await request(app.getHttpServer()).post(path).set('Authorization', 'Bearer customer-token')
      .send({ reason: '             ' }).expect(400);
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
