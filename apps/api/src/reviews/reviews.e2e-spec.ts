import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { BookingStatus, UserRole } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JwtAuthGuard, type AuthenticatedRequest } from '../auth/jwt-auth.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ReviewsController } from './reviews.controller.js';
import { ReviewsService } from './reviews.service.js';

vi.mock('@nestjs/jwt', () => ({ JwtService: class TestJwtService {} }));

class TestBearerGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = request.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (token === 'customer-token') {
      request.user = { sub: 'customer-id', role: UserRole.customer };
      return true;
    }
    if (token === 'admin-token') {
      request.user = { sub: 'admin-id', role: UserRole.admin };
      return true;
    }
    throw new UnauthorizedException('A valid test access token is required.');
  }
}

describe('Reviews API (e2e)', () => {
  let app: INestApplication<App>;
  const bookingId = '11111111-1111-4111-8111-111111111111';
  const chefId = '22222222-2222-4222-8222-222222222222';
  const tx = {
    review: {
      create: vi.fn(),
      aggregate: vi.fn(),
    },
    chefProfile: { update: vi.fn() },
  };
  const prisma = {
    chefProfile: { findFirst: vi.fn() },
    bookingRequest: { findUnique: vi.fn() },
    review: { findMany: vi.fn(), count: vi.fn(), aggregate: vi.fn() },
    $transaction: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    prisma.$transaction.mockImplementation(
      (callback: (client: typeof tx) => unknown) => callback(tx),
    );
    const builder = Test.createTestingModule({
      controllers: [ReviewsController],
      providers: [
        ReviewsService,
        { provide: PrismaService, useValue: prisma },
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

  it('requires customer authentication and accepts a completed-booking review', async () => {
    await request(app.getHttpServer())
      .post('/api/reviews')
      .send({ bookingId, rating: 5, recommended: true })
      .expect(401);

    prisma.bookingRequest.findUnique.mockResolvedValue({
      id: bookingId,
      customerId: 'customer-id',
      chefId,
      status: BookingStatus.completed,
    });
    tx.review.create.mockResolvedValue({ id: 'review-id', rating: 5 });
    tx.review.aggregate.mockResolvedValue({
      _avg: { rating: 5 },
      _count: { _all: 1 },
    });
    const response = await request(app.getHttpServer())
      .post('/api/reviews')
      .set('Authorization', 'Bearer customer-token')
      .send({ bookingId, rating: 5, recommended: true })
      .expect(201);

    expect(response.body).toMatchObject({ id: 'review-id', rating: 5 });
    expect(tx.chefProfile.update).toHaveBeenCalledWith({
      where: { id: chefId },
      data: { averageRating: 5, reviewCount: 1 },
    });
  });

  it('validates rating range and restricts moderation to administrators', async () => {
    await request(app.getHttpServer())
      .post('/api/reviews')
      .set('Authorization', 'Bearer customer-token')
      .send({ bookingId, rating: 6, recommended: true })
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/admin/reviews/reports')
      .set('Authorization', 'Bearer customer-token')
      .expect(403);
  });

  it('serves public reviews without exposing private category feedback', async () => {
    prisma.chefProfile.findFirst.mockResolvedValue({ id: 'chef-id' });
    prisma.review.findMany.mockResolvedValue([
      { id: 'review-id', rating: 4, reviewText: 'Great food', photos: [], response: null },
    ]);
    prisma.review.count.mockResolvedValue(1);
    prisma.review.aggregate.mockResolvedValue({ _avg: { rating: 4 } });

    const response = await request(app.getHttpServer())
      .get(`/api/chefs/${chefId}/reviews?sort=highest`)
      .expect(200);

    expect(response.body).toMatchObject({ averageRating: 4, reviewCount: 1 });
    expect(response.body.items[0]).not.toHaveProperty('foodQuality');
  });
});
