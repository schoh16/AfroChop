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
import { SafetyController } from './safety.controller.js';
import { SafetyService } from './safety.service.js';

vi.mock('@nestjs/jwt', () => ({ JwtService: class TestJwtService {} }));

class TestBearerGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (token === 'customer-token') {
      req.user = { sub: 'customer-id', role: UserRole.customer };
      return true;
    }
    if (token === 'chef-token') {
      req.user = { sub: 'chef-user-id', role: UserRole.chef };
      return true;
    }
    if (token === 'admin-token') {
      req.user = { sub: 'admin-id', role: UserRole.admin };
      return true;
    }
    throw new UnauthorizedException('A valid test access token is required.');
  }
}

describe('Safety verification API (e2e)', () => {
  let app: INestApplication<App>;
  const safetyService = {
    getMyVerification: vi.fn(),
    updateMyPhoneNumber: vi.fn(),
    createMyServiceAddress: vi.fn(),
    reviewServiceAddress: vi.fn(),
    createChefCredential: vi.fn(),
    getVerificationQueue: vi.fn(),
    reviewUserVerification: vi.fn(),
    reviewChefCredential: vi.fn(),
    reviewChefServiceApproval: vi.fn(),
    reportIncident: vi.fn(),
    listOwnIncidents: vi.fn(),
    getAdminIncidents: vi.fn(),
    reviewIncident: vi.fn(),
    saveComplianceRule: vi.fn(),
    listPendingPermits: vi.fn(),
    reviewPermit: vi.fn(),
    updateChefStatus: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await Test.createTestingModule({
      controllers: [SafetyController],
      providers: [{ provide: SafetyService, useValue: safetyService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(TestBearerGuard)
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  it('restricts the verification review queue to administrators', async () => {
    safetyService.getVerificationQueue.mockResolvedValue({ userVerifications: [] });
    await request(app.getHttpServer())
      .get('/api/admin/verification/queue')
      .expect(401);
    await request(app.getHttpServer())
      .get('/api/admin/verification/queue')
      .set('Authorization', 'Bearer customer-token')
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/admin/verification/queue')
      .set('Authorization', 'Bearer admin-token')
      .expect(200);
    expect(safetyService.getVerificationQueue).toHaveBeenCalledTimes(1);
  });

  it('allows customers to read their own verification state but not administer another user', async () => {
    safetyService.getMyVerification.mockResolvedValue({ verifications: [] });
    safetyService.reviewUserVerification.mockResolvedValue({ status: 'verified' });
    await request(app.getHttpServer())
      .get('/api/verification/me')
      .set('Authorization', 'Bearer customer-token')
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/api/admin/verification/users/00000000-0000-4000-8000-000000000001/email`)
      .set('Authorization', 'Bearer customer-token')
      .send({ status: 'verified' })
      .expect(403);
    expect(safetyService.reviewUserVerification).not.toHaveBeenCalled();
  });

  it('validates phone numbers in E.164 format before creating a verification request', async () => {
    safetyService.updateMyPhoneNumber.mockResolvedValue({
      phoneNumber: '+14155550123',
      verification: { status: 'pending' },
    });
    await request(app.getHttpServer())
      .put('/api/verification/me/phone')
      .set('Authorization', 'Bearer customer-token')
      .send({ phoneNumber: '4155550123' })
      .expect(400);
    await request(app.getHttpServer())
      .put('/api/verification/me/phone')
      .set('Authorization', 'Bearer customer-token')
      .send({ phoneNumber: '+14155550123' })
      .expect(200);
    expect(safetyService.updateMyPhoneNumber).toHaveBeenCalledTimes(1);
  });

  it('accepts service addresses only from customers and validates their location fields', async () => {
    safetyService.createMyServiceAddress.mockResolvedValue({
      id: 'address-id',
      status: 'pending',
    });
    const address = {
      line1: '123 Main Street',
      city: 'Brooklyn',
      region: 'NY',
      postalCode: '11201',
      countryCode: 'US',
      jurisdictionCode: 'US-NY',
    };
    await request(app.getHttpServer())
      .post('/api/verification/me/service-addresses')
      .set('Authorization', 'Bearer chef-token')
      .send(address)
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/verification/me/service-addresses')
      .set('Authorization', 'Bearer customer-token')
      .send({ ...address, countryCode: 'USA' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/verification/me/service-addresses')
      .set('Authorization', 'Bearer customer-token')
      .send(address)
      .expect(201);
    expect(safetyService.createMyServiceAddress).toHaveBeenCalledWith(
      'customer-id',
      expect.objectContaining({ countryCode: 'US' }),
    );
  });
});
