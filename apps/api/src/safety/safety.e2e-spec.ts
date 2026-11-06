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
import {
  JwtAuthGuard,
  type AuthenticatedRequest,
} from '../auth/jwt-auth.guard.js';
import { SafetyController } from './safety.controller.js';
import { SafetyService } from './safety.service.js';
import { VerificationCodeService } from './verification-code.service.js';

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
    getAdminServiceAddress: vi.fn(),
    getBookingServiceAddress: vi.fn(),
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
    listChefApplications: vi.fn(),
    getChefApplicationAddress: vi.fn(),
    reviewChefApplication: vi.fn(),
    submitChefApplication: vi.fn(),
  };
  const codes = { send: vi.fn(), check: vi.fn() };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await Test.createTestingModule({
      controllers: [SafetyController],
      providers: [
        { provide: SafetyService, useValue: safetyService },
        { provide: VerificationCodeService, useValue: codes },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(TestBearerGuard)
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  it('accepts empty and partial applications without an international phone prefix', async () => {
    const application = {
      line1: '123 Test Street', city: 'Brooklyn', region: 'NY',
      postalCode: '11201',
      phoneNumber: '(415) 555-0123', experienceYears: 0,
      countryOfOrigin: 'Cameroon', meetingAvailability: 'Mondays 2-5 PM America/New_York',
    };
    safetyService.submitChefApplication.mockResolvedValue({ id: 'application-id', status: 'submitted' });
    await request(app.getHttpServer()).post('/api/chefs/me/application')
      .auth('chef-token', { type: 'bearer' }).send({}).expect(201);
    await request(app.getHttpServer()).post('/api/chefs/me/application')
      .auth('chef-token', { type: 'bearer' }).send({ phoneNumber: '5551234', city: '' }).expect(201);
    for (const field of ['phoneNumber', 'experienceYears', 'countryOfOrigin', 'meetingAvailability']) {
      await request(app.getHttpServer()).post('/api/chefs/me/application')
        .auth('chef-token', { type: 'bearer' })
        .send({ ...application, [field]: undefined }).expect(201);
    }
    safetyService.submitChefApplication.mockClear();
    for (const invalid of [
      { phoneNumber: 123 }, { experienceYears: -1 },
      { experienceYears: 1.5 }, { experienceYears: 101 },
      { countryOfOrigin: 'x'.repeat(101) }, { meetingAvailability: 'x'.repeat(2001) },
    ]) {
      await request(app.getHttpServer()).post('/api/chefs/me/application')
        .auth('chef-token', { type: 'bearer' })
        .send({ ...application, ...invalid }).expect(400);
    }
    expect(safetyService.submitChefApplication).not.toHaveBeenCalled();
    safetyService.submitChefApplication.mockResolvedValue({ id: 'application-id', status: 'submitted' });
    await request(app.getHttpServer()).post('/api/chefs/me/application')
      .auth('chef-token', { type: 'bearer' }).send(application).expect(201);
    expect(safetyService.submitChefApplication).toHaveBeenCalledWith('chef-user-id', expect.objectContaining(application));
  });
  it('restricts the application queue, address, and review actions to administrators', async () => {
    const id = '00000000-0000-4000-8000-000000000001';
    safetyService.listChefApplications.mockResolvedValue([]);
    safetyService.getChefApplicationAddress.mockResolvedValue({
      line1: 'Private visit address',
    });
    safetyService.reviewChefApplication.mockResolvedValue({
      id,
      status: 'interviewed',
    });
    for (const token of [undefined, 'customer-token', 'chef-token']) {
      const expected = token ? 403 : 401;
      for (const path of [
        '/api/admin/verification/chef-applications',
        `/api/admin/verification/chef-applications/${id}/address`,
      ]) {
        const call = request(app.getHttpServer()).get(path);
        if (token) call.set('Authorization', `Bearer ${token}`);
        await call.expect(expected);
      }
      const review = request(app.getHttpServer())
        .patch(`/api/admin/verification/chef-applications/${id}`)
        .send({ status: 'interviewed' });
      if (token) review.set('Authorization', `Bearer ${token}`);
      await review.expect(expected);
    }
    await request(app.getHttpServer())
      .get('/api/admin/verification/chef-applications')
      .set('Authorization', 'Bearer admin-token')
      .expect('Cache-Control', 'no-store')
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/admin/verification/chef-applications/${id}/address`)
      .set('Authorization', 'Bearer admin-token')
      .expect('Cache-Control', 'no-store')
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/api/admin/verification/chef-applications/${id}`)
      .set('Authorization', 'Bearer admin-token')
      .send({ status: 'interviewed' })
      .expect(200);
    expect(
      safetyService.getChefApplicationAddress,
    ).toHaveBeenCalledExactlyOnceWith('admin-id', id);
    expect(safetyService.reviewChefApplication).toHaveBeenCalledExactlyOnceWith(
      'admin-id',
      id,
      { status: 'interviewed' },
    );
  });

  it('validates staff notes and visit date input before reviewing an application', async () => {
    const route =
      '/api/admin/verification/chef-applications/00000000-0000-4000-8000-000000000001';
    for (const body of [
      { status: 'not-a-status' },
      { status: 'visit_scheduled', visitScheduledAt: 'tomorrow' },
      { status: 'interviewed', adminNotes: 'a'.repeat(2001) },
    ]) {
      await request(app.getHttpServer())
        .patch(route)
        .set('Authorization', 'Bearer admin-token')
        .send(body)
        .expect(400);
    }
    expect(safetyService.reviewChefApplication).not.toHaveBeenCalled();
  });
  it('restricts the verification review queue to administrators', async () => {
    safetyService.getVerificationQueue.mockResolvedValue({
      userVerifications: [],
    });
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

  it('authenticates verification codes and validates code format', async () => {
    await request(app.getHttpServer())
      .post('/api/verification/me/email/send-code')
      .expect(401);
    codes.send.mockResolvedValue({ sent: true });
    await request(app.getHttpServer())
      .post('/api/verification/me/email/send-code')
      .set('Authorization', 'Bearer customer-token')
      .expect(201);
    expect(codes.send).toHaveBeenCalledWith('customer-id', 'email');
    await request(app.getHttpServer())
      .post('/api/verification/me/email/check-code')
      .set('Authorization', 'Bearer customer-token')
      .send({ code: 'not-a-code' })
      .expect(400);
    codes.check.mockResolvedValue({ verified: true, type: 'email' });
    await request(app.getHttpServer())
      .post('/api/verification/me/email/check-code')
      .set('Authorization', 'Bearer customer-token')
      .send({ code: '123456' })
      .expect(201);
  });

  it('allows customers to read their own verification state but not administer another user', async () => {
    safetyService.getMyVerification.mockResolvedValue({ verifications: [] });
    safetyService.reviewUserVerification.mockResolvedValue({
      status: 'verified',
    });
    await request(app.getHttpServer())
      .get('/api/verification/me')
      .set('Authorization', 'Bearer customer-token')
      .expect(200);
    await request(app.getHttpServer())
      .patch(
        `/api/admin/verification/users/00000000-0000-4000-8000-000000000001/email`,
      )
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
