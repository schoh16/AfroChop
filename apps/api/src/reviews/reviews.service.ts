import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BookingStatus,
  Prisma,
  ReviewDisputeStatus,
  ReviewModerationStatus,
  ReviewReportStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { publicChefWhere } from '../chefs/public-chef.js';
import {
  ChefReviewResponseDto,
  CreateReviewDto,
  ReviewDisputeDecisionDto,
  ReviewDisputeDto,
  ReviewListQueryDto,
  ReviewModerationDto,
  ReviewReportDecisionDto,
  ReviewReportDto,
  UpdateReviewDto,
} from './dto/review.dto.js';

export const REVIEW_EDIT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const REVIEW_REPORT_HOURLY_LIMIT = 5;

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  async listPublicReviews(chefId: string, query: ReviewListQueryDto) {
    const chef = await this.prisma.chefProfile.findFirst({
      where: { id: chefId, ...publicChefWhere },
      select: { id: true },
    });
    if (!chef) throw new NotFoundException('Chef profile not found.');

    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const orderBy =
      query.sort === 'highest'
        ? [{ rating: 'desc' as const }, { createdAt: 'desc' as const }]
        : query.sort === 'lowest'
          ? [{ rating: 'asc' as const }, { createdAt: 'desc' as const }]
          : [{ createdAt: 'desc' as const }];
    const where = {
      chefId,
      moderationStatus: ReviewModerationStatus.published,
    };

    const [reviews, total, aggregate] = await Promise.all([
      this.prisma.review.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          rating: true,
          reviewText: true,
          recommended: true,
          createdAt: true,
          updatedAt: true,
          photos: { select: { id: true, imageUrl: true }, orderBy: { createdAt: 'asc' } },
          response: { select: { response: true, createdAt: true, updatedAt: true } },
        },
      }),
      this.prisma.review.count({ where }),
      this.prisma.review.aggregate({ where, _avg: { rating: true } }),
    ]);

    return {
      items: reviews,
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
      averageRating: aggregate._avg.rating,
      reviewCount: total,
    };
  }

  async listEligibleBookings(customerId: string) {
    return this.prisma.bookingRequest.findMany({
      where: {
        customerId,
        status: BookingStatus.completed,
        chefId: { not: null },
        review: null,
      },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        serviceType: true,
        desiredDate: true,
        chef: { select: { id: true, displayName: true } },
      },
    });
  }

  async createReview(customerId: string, dto: CreateReviewDto) {
    const booking = await this.prisma.bookingRequest.findUnique({
      where: { id: dto.bookingId },
      select: {
        id: true,
        customerId: true,
        chefId: true,
        status: true,
      },
    });
    if (!booking) throw new NotFoundException('Booking not found.');
    if (booking.customerId !== customerId) {
      throw new ForbiddenException('You can only review your own booking.');
    }
    if (booking.status !== BookingStatus.completed || !booking.chefId) {
      throw new BadRequestException('Only a completed booking can be reviewed.');
    }

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const review = await transaction.review.create({
          data: {
            bookingId: booking.id,
            customerId,
            chefId: booking.chefId!,
            rating: dto.rating,
            reviewText: dto.reviewText || null,
            recommended: dto.recommended,
            foodQuality: dto.foodQuality,
            communication: dto.communication,
            punctuality: dto.punctuality,
            professionalism: dto.professionalism,
            ...(dto.photos?.length
              ? { photos: { create: dto.photos.map((imageUrl) => ({ imageUrl })) } }
              : {}),
          },
          include: { photos: true },
        });
        await this.refreshChefRating(transaction, booking.chefId!);
        return review;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('A review has already been submitted for this booking.');
      }
      throw error;
    }
  }

  async updateReview(customerId: string, reviewId: string, dto: UpdateReviewDto) {
    const review = await this.prisma.review.findUnique({
      where: { id: reviewId },
      select: {
        id: true,
        customerId: true,
        chefId: true,
        createdAt: true,
        moderationStatus: true,
      },
    });
    if (!review) throw new NotFoundException('Review not found.');
    if (review.customerId !== customerId) {
      throw new ForbiddenException('You can only edit your own review.');
    }
    if (review.moderationStatus !== ReviewModerationStatus.published) {
      throw new BadRequestException('Only published reviews can be edited.');
    }
    if (Date.now() - review.createdAt.getTime() > REVIEW_EDIT_WINDOW_MS) {
      throw new BadRequestException('The 7-day review editing window has closed.');
    }

    return this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.review.update({
        where: { id: reviewId },
        data: {
          rating: dto.rating,
          reviewText: dto.reviewText || null,
          recommended: dto.recommended,
          foodQuality: dto.foodQuality,
          communication: dto.communication,
          punctuality: dto.punctuality,
          professionalism: dto.professionalism,
          ...(dto.photos === undefined
            ? {}
            : {
                photos: {
                  deleteMany: {},
                  create: dto.photos.map((imageUrl) => ({ imageUrl })),
                },
              }),
        },
        include: { photos: true },
      });
      await this.refreshChefRating(transaction, review.chefId);
      return updated;
    });
  }

  async reportReview(reporterId: string, reviewId: string, dto: ReviewReportDto) {
    const review = await this.prisma.review.findUnique({
      where: { id: reviewId },
      select: { id: true, customerId: true },
    });
    if (!review) throw new NotFoundException('Review not found.');
    if (review.customerId === reporterId) {
      throw new BadRequestException('You cannot report your own review.');
    }

    const since = new Date(Date.now() - 60 * 60 * 1000);
    const reportsInWindow = await this.prisma.reviewReport.count({
      where: { reporterId, createdAt: { gte: since } },
    });
    if (reportsInWindow >= REVIEW_REPORT_HOURLY_LIMIT) {
      throw new HttpException('Review report limit reached. Try again later.', HttpStatus.TOO_MANY_REQUESTS);
    }

    try {
      return await this.prisma.reviewReport.create({
        data: {
          reviewId,
          reporterId,
          reason: dto.reason.trim(),
          details: dto.details?.trim() || null,
        },
        select: { id: true, status: true, createdAt: true },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('You have already reported this review.');
      }
      throw error;
    }
  }

  async respondToReview(chefUserId: string, reviewId: string, dto: ChefReviewResponseDto) {
    const review = await this.prisma.review.findUnique({
      where: { id: reviewId },
      select: { id: true, chefId: true, moderationStatus: true },
    });
    if (!review) throw new NotFoundException('Review not found.');
    await this.assertReviewChef(chefUserId, review.chefId);
    if (review.moderationStatus !== ReviewModerationStatus.published) {
      throw new BadRequestException('Only published reviews can receive a public response.');
    }

    return this.prisma.chefReviewResponse.upsert({
      where: { reviewId },
      create: { reviewId, chefId: review.chefId, response: dto.response.trim() },
      update: { response: dto.response.trim() },
      select: { id: true, response: true, createdAt: true, updatedAt: true },
    });
  }

  async disputeReview(chefUserId: string, reviewId: string, dto: ReviewDisputeDto) {
    const review = await this.prisma.review.findUnique({
      where: { id: reviewId },
      select: { id: true, chefId: true, moderationStatus: true },
    });
    if (!review) throw new NotFoundException('Review not found.');
    await this.assertReviewChef(chefUserId, review.chefId);
    try {
      return await this.prisma.reviewDispute.create({
        data: { reviewId, chefId: review.chefId, appeal: dto.appeal.trim() },
        select: { id: true, status: true, createdAt: true },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('An appeal has already been submitted for this review.');
      }
      throw error;
    }
  }

  async listChefPrivateFeedback(chefUserId: string) {
    const chef = await this.prisma.chefProfile.findUnique({
      where: { userId: chefUserId },
      select: { id: true, averageRating: true, reviewCount: true },
    });
    if (!chef) throw new NotFoundException('Chef profile not found.');

    const reviews = await this.prisma.review.findMany({
      where: {
        chefId: chef.id,
        moderationStatus: ReviewModerationStatus.published,
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        rating: true,
        reviewText: true,
        foodQuality: true,
        communication: true,
        punctuality: true,
        professionalism: true,
        createdAt: true,
        response: { select: { response: true, updatedAt: true } },
      },
    });
    return {
      averageRating: chef.averageRating,
      reviewCount: chef.reviewCount,
      reviews,
    };
  }

  async listPendingReports() {
    return this.prisma.reviewReport.findMany({
      where: { status: ReviewReportStatus.pending },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        reason: true,
        details: true,
        createdAt: true,
        review: {
          select: {
            id: true,
            rating: true,
            reviewText: true,
            moderationStatus: true,
            customerId: true,
            chef: { select: { id: true, displayName: true } },
          },
        },
      },
    });
  }

  async decideReport(adminId: string, reportId: string, dto: ReviewReportDecisionDto) {
    const report = await this.prisma.reviewReport.findUnique({
      where: { id: reportId },
      select: { id: true, status: true, reviewId: true },
    });
    if (!report) throw new NotFoundException('Review report not found.');
    if (report.status !== ReviewReportStatus.pending) {
      throw new BadRequestException('This report has already been reviewed.');
    }

    return this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.reviewReport.update({
        where: { id: reportId },
        data: { status: dto.status, reviewedAt: new Date() },
      });
      await transaction.adminAuditLog.create({
        data: {
          actorId: adminId,
          action: 'review_report_decided',
          targetType: 'review_report',
          targetId: reportId,
          details: {
            reviewId: report.reviewId,
            status: dto.status,
            adminNotes: dto.adminNotes ?? null,
          },
        },
      });
      return updated;
    });
  }

  async listPendingDisputes() {
    return this.prisma.reviewDispute.findMany({
      where: { status: ReviewDisputeStatus.pending },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        appeal: true,
        createdAt: true,
        review: {
          select: {
            id: true,
            rating: true,
            reviewText: true,
            moderationStatus: true,
            chef: { select: { id: true, displayName: true } },
          },
        },
      },
    });
  }

  async decideDispute(
    adminId: string,
    disputeId: string,
    dto: ReviewDisputeDecisionDto,
  ) {
    const dispute = await this.prisma.reviewDispute.findUnique({
      where: { id: disputeId },
      select: { id: true, reviewId: true, status: true },
    });
    if (!dispute) throw new NotFoundException('Review appeal not found.');
    if (dispute.status !== ReviewDisputeStatus.pending) {
      throw new BadRequestException('This appeal has already been decided.');
    }

    return this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.reviewDispute.update({
        where: { id: disputeId },
        data: {
          status: dto.status,
          adminNotes: dto.adminNotes,
          reviewedAt: new Date(),
        },
      });
      if (dto.status === ReviewDisputeStatus.appeal_granted) {
        const review = await transaction.review.update({
          where: { id: dispute.reviewId },
          data: {
            moderationStatus: ReviewModerationStatus.published,
            moderationReason: null,
          },
          select: { chefId: true },
        });
        await this.refreshChefRating(transaction, review.chefId);
      }
      await transaction.adminAuditLog.create({
        data: {
          actorId: adminId,
          action: 'review_dispute_decided',
          targetType: 'review_dispute',
          targetId: disputeId,
          details: {
            reviewId: dispute.reviewId,
            status: dto.status,
            adminNotes: dto.adminNotes ?? null,
          },
        },
      });
      return updated;
    });
  }

  async moderateReview(
    adminId: string,
    reviewId: string,
    dto: ReviewModerationDto,
  ) {
    const review = await this.prisma.review.findUnique({
      where: { id: reviewId },
      select: { id: true, chefId: true, moderationStatus: true },
    });
    if (!review) throw new NotFoundException('Review not found.');

    return this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.review.update({
        where: { id: reviewId },
        data: {
          moderationStatus: dto.status,
          moderationReason: dto.reason.trim(),
        },
      });
      await this.refreshChefRating(transaction, review.chefId);
      await transaction.adminAuditLog.create({
        data: {
          actorId: adminId,
          action: 'review_moderation_decided',
          targetType: 'review',
          targetId: reviewId,
          details: {
            previousStatus: review.moderationStatus,
            status: dto.status,
            reason: dto.reason.trim(),
          },
        },
      });
      return updated;
    });
  }

  private async assertReviewChef(chefUserId: string, chefId: string) {
    const chef = await this.prisma.chefProfile.findUnique({
      where: { id: chefId },
      select: { userId: true },
    });
    if (!chef) throw new NotFoundException('Chef profile not found.');
    if (chef.userId !== chefUserId) {
      throw new ForbiddenException('You cannot manage another chef’s review.');
    }
  }

  private async refreshChefRating(
    transaction: Prisma.TransactionClient,
    chefId: string,
  ) {
    const aggregate = await transaction.review.aggregate({
      where: {
        chefId,
        moderationStatus: ReviewModerationStatus.published,
      },
      _avg: { rating: true },
      _count: { _all: true },
    });
    await transaction.chefProfile.update({
      where: { id: chefId },
      data: {
        averageRating: aggregate._avg.rating ?? 0,
        reviewCount: aggregate._count._all,
      },
    });
  }
}
