import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { AuthenticatedRequest } from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
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
import { ReviewsService } from './reviews.service.js';

@Controller()
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get('chefs/:chefId/reviews')
  listPublicReviews(
    @Param('chefId', ParseUUIDPipe) chefId: string,
    @Query() query: ReviewListQueryDto,
  ) {
    return this.reviewsService.listPublicReviews(chefId, query);
  }

  @Get('reviews/eligible-bookings')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.customer)
  listEligibleBookings(@Req() request: AuthenticatedRequest) {
    return this.reviewsService.listEligibleBookings(request.user.sub);
  }

  @Post('reviews')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.customer)
  createReview(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateReviewDto,
  ) {
    return this.reviewsService.createReview(request.user.sub, dto);
  }

  @Patch('reviews/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.customer)
  updateReview(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) reviewId: string,
    @Body() dto: UpdateReviewDto,
  ) {
    return this.reviewsService.updateReview(request.user.sub, reviewId, dto);
  }

  @Post('reviews/:id/reports')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.customer, UserRole.chef)
  reportReview(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) reviewId: string,
    @Body() dto: ReviewReportDto,
  ) {
    return this.reviewsService.reportReview(request.user.sub, reviewId, dto);
  }

  @Post('reviews/:id/response')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.chef)
  respondToReview(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) reviewId: string,
    @Body() dto: ChefReviewResponseDto,
  ) {
    return this.reviewsService.respondToReview(request.user.sub, reviewId, dto);
  }

  @Post('reviews/:id/disputes')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.chef)
  disputeReview(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) reviewId: string,
    @Body() dto: ReviewDisputeDto,
  ) {
    return this.reviewsService.disputeReview(request.user.sub, reviewId, dto);
  }

  @Get('chefs/me/reviews/private')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.chef)
  listChefPrivateFeedback(@Req() request: AuthenticatedRequest) {
    return this.reviewsService.listChefPrivateFeedback(request.user.sub);
  }

  @Get('admin/reviews/reports')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.admin)
  listPendingReports() {
    return this.reviewsService.listPendingReports();
  }

  @Patch('admin/reviews/reports/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.admin)
  decideReport(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) reportId: string,
    @Body() dto: ReviewReportDecisionDto,
  ) {
    return this.reviewsService.decideReport(request.user.sub, reportId, dto);
  }

  @Get('admin/reviews/disputes')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.admin)
  listPendingDisputes() {
    return this.reviewsService.listPendingDisputes();
  }

  @Patch('admin/reviews/disputes/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.admin)
  decideDispute(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) disputeId: string,
    @Body() dto: ReviewDisputeDecisionDto,
  ) {
    return this.reviewsService.decideDispute(request.user.sub, disputeId, dto);
  }

  @Patch('admin/reviews/:id/moderation')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.admin)
  moderateReview(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) reviewId: string,
    @Body() dto: ReviewModerationDto,
  ) {
    return this.reviewsService.moderateReview(request.user.sub, reviewId, dto);
  }
}
