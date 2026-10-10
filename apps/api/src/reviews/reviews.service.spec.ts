import { Test } from '@nestjs/testing';
import {
  BookingStatus,
  Prisma,
  ReviewModerationStatus,
} from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { ReviewsService } from './reviews.service.js';

describe('ReviewsService', () => {
  const transaction = {
    review: {
      create: vi.fn(),
      aggregate: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
    },
    chefProfile: { update: vi.fn() },
    reviewReport: { update: vi.fn() },
    reviewDispute: { update: vi.fn() },
    adminAuditLog: { create: vi.fn() },
  };
  const prisma = {
    bookingRequest: { findUnique: vi.fn(), findMany: vi.fn() },
    chefProfile: { findFirst: vi.fn(), findUnique: vi.fn() },
    review: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      aggregate: vi.fn(),
      update: vi.fn(),
    },
    reviewReport: { count: vi.fn(), create: vi.fn(), findUnique: vi.fn(), findMany: vi.fn() },
    reviewDispute: { create: vi.fn(), findUnique: vi.fn(), findMany: vi.fn() },
    chefReviewResponse: { upsert: vi.fn() },
    $transaction: vi.fn(),
  };
  let service: ReviewsService;

  beforeEach(async () => {
    vi.clearAllMocks();
    prisma.$transaction.mockImplementation(
      (callback: (tx: typeof transaction) => unknown) => callback(transaction),
    );
    const module = await Test.createTestingModule({
      providers: [
        ReviewsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(ReviewsService);
  });

  it('rejects a review unless the owned booking is completed', async () => {
    prisma.bookingRequest.findUnique.mockResolvedValue({
      id: 'booking-id',
      customerId: 'customer-id',
      chefId: 'chef-id',
      status: BookingStatus.in_progress,
    });

    await expect(
      service.createReview('customer-id', {
        bookingId: 'booking-id',
        rating: 5,
        recommended: true,
      }),
    ).rejects.toThrow('Only a completed booking');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('prevents a customer from reviewing another customer’s booking', async () => {
    prisma.bookingRequest.findUnique.mockResolvedValue({
      id: 'booking-id',
      customerId: 'booking-owner',
      chefId: 'chef-id',
      status: BookingStatus.completed,
    });

    await expect(
      service.createReview('different-customer', {
        bookingId: 'booking-id',
        rating: 1,
        recommended: false,
      }),
    ).rejects.toThrow('only review your own booking');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('creates one review and refreshes rating only from published reviews', async () => {
    prisma.bookingRequest.findUnique.mockResolvedValue({
      id: 'booking-id',
      customerId: 'customer-id',
      chefId: 'chef-id',
      status: BookingStatus.completed,
    });
    transaction.review.create.mockResolvedValue({ id: 'review-id', rating: 4 });
    transaction.review.aggregate.mockResolvedValue({
      _avg: { rating: 4.5 },
      _count: { _all: 2 },
    });

    await service.createReview('customer-id', {
      bookingId: 'booking-id',
      rating: 4,
      recommended: true,
      foodQuality: 5,
      photos: ['https://cdn.example.com/meal.jpg'],
    });

    expect(transaction.review.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          bookingId: 'booking-id',
          customerId: 'customer-id',
          chefId: 'chef-id',
          rating: 4,
          foodQuality: 5,
        }),
      }),
    );
    expect(transaction.review.aggregate).toHaveBeenCalledWith({
      where: { chefId: 'chef-id', moderationStatus: ReviewModerationStatus.published },
      _avg: { rating: true },
      _count: { _all: true },
    });
    expect(transaction.chefProfile.update).toHaveBeenCalledWith({
      where: { id: 'chef-id' },
      data: { averageRating: 4.5, reviewCount: 2 },
    });
  });

  it('sorts public reviews and excludes private feedback fields', async () => {
    prisma.chefProfile.findFirst.mockResolvedValue({ id: 'chef-id' });
    prisma.review.findMany.mockResolvedValue([{ id: 'review-id', rating: 5 }]);
    prisma.review.count.mockResolvedValue(1);
    prisma.review.aggregate.mockResolvedValue({ _avg: { rating: 5 } });

    const result = await service.listPublicReviews('chef-id', {
      sort: 'highest',
      page: 1,
      limit: 10,
    });

    expect(prisma.review.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { chefId: 'chef-id', moderationStatus: ReviewModerationStatus.published },
        orderBy: [{ rating: 'desc' }, { createdAt: 'desc' }],
        select: expect.not.objectContaining({
          foodQuality: true,
          communication: true,
          punctuality: true,
          professionalism: true,
        }),
      }),
    );
    expect(result).toMatchObject({ averageRating: 5, reviewCount: 1 });
  });

  it('blocks edits outside the seven-day window', async () => {
    prisma.review.findUnique.mockResolvedValue({
      id: 'review-id',
      customerId: 'customer-id',
      chefId: 'chef-id',
      createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
      moderationStatus: ReviewModerationStatus.published,
    });

    await expect(
      service.updateReview('customer-id', 'review-id', {
        rating: 1,
        recommended: false,
      }),
    ).rejects.toThrow('7-day review editing window has closed');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('limits review reports per authenticated reporter', async () => {
    prisma.review.findUnique.mockResolvedValue({
      id: 'review-id',
      customerId: 'review-author',
    });
    prisma.reviewReport.count.mockResolvedValue(5);

    await expect(
      service.reportReview('reporter-id', 'review-id', { reason: 'Fraud' }),
    ).rejects.toThrow('Review report limit reached');
    expect(prisma.reviewReport.create).not.toHaveBeenCalled();
  });

  it('audits admin moderation and recalculates published ratings', async () => {
    prisma.review.findUnique.mockResolvedValue({
      id: 'review-id',
      chefId: 'chef-id',
      moderationStatus: ReviewModerationStatus.published,
    });
    transaction.review.update.mockResolvedValue({
      id: 'review-id',
      moderationStatus: ReviewModerationStatus.hidden,
    });
    transaction.review.aggregate.mockResolvedValue({
      _avg: { rating: null },
      _count: { _all: 0 },
    });

    await service.moderateReview('admin-id', 'review-id', {
      status: 'hidden',
      reason: 'Policy violation confirmed',
    });

    expect(transaction.review.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { chefId: 'chef-id', moderationStatus: ReviewModerationStatus.published },
      }),
    );
    expect(transaction.adminAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorId: 'admin-id',
          action: 'review_moderation_decided',
          targetId: 'review-id',
        }),
      }),
    );
  });

  it('translates a unique booking review constraint into a conflict response', async () => {
    prisma.bookingRequest.findUnique.mockResolvedValue({
      id: 'booking-id',
      customerId: 'customer-id',
      chefId: 'chef-id',
      status: BookingStatus.completed,
    });
    transaction.review.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    await expect(
      service.createReview('customer-id', {
        bookingId: 'booking-id',
        rating: 5,
        recommended: true,
      }),
    ).rejects.toThrow('already been submitted');
  });
});
