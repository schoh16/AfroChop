import {
  Body,
  Controller,
  Get,
  Headers,
  Header,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Redirect,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { AuthenticatedRequest } from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { PaymentConfigurationDto } from './dto/payment-configuration.dto.js';
import { PaymentsService } from './payments.service.js';
import { BookingMoneyService } from './booking-money.service.js';
import { BookingRefundDto, ReviewBookingRefundDto } from './dto/booking-refund.dto.js';

type RawBodyRequest = Request & { rawBody?: Buffer };

@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly money: BookingMoneyService,
  ) {}

  @Get('bookings/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.customer, UserRole.chef, UserRole.admin)
  paymentStatus(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.money.getStatus(id, request.user.sub, request.user.role);
  }

  @Post('bookings/:id/release')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.customer, UserRole.chef, UserRole.admin)
  release(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.money.releaseForUser(id, request.user.sub, request.user.role);
  }

  @Post('bookings/:id/refund-request')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.customer)
  requestRefund(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: BookingRefundDto) {
    return this.money.requestRefund(id, request.user.sub, dto.reason);
  }

  @Get('admin/bookings')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.admin)
  listPayments() {
    return this.money.listAdmin();
  }

  @Post('admin/bookings/:id/reconcile')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.admin)
  reconcile(@Param('id', ParseUUIDPipe) id: string) {
    return this.money.reconcile(id);
  }

  @Post('admin/bookings/:id/refund-review')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.admin)
  reviewRefund(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReviewBookingRefundDto) {
    return this.money.reviewRefund(id, request.user.sub, dto);
  }

  @Get('configuration')
  getCustomerPaymentConfiguration() {
    return this.paymentsService.getCustomerPaymentConfiguration();
  }

  @Post('quotes/:id/checkout')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.customer)
  createDepositCheckout(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.paymentsService.createDepositCheckout(request.user.sub, id);
  }

  @Post('quotes/:id/confirm')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.customer)
  confirmDeposit(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.paymentsService.confirmDeposit(request.user.sub, id);
  }

  @Get('chef/connect/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.chef)
  getChefConnectStatus(@Req() request: AuthenticatedRequest) {
    return this.paymentsService.getChefConnectStatus(request.user.sub);
  }

  @Post('chef/connect/onboarding')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.chef)
  @Header('Cache-Control', 'no-store')
  createOnboardingLink(@Req() request: AuthenticatedRequest) {
    return this.paymentsService.createOnboardingLink(request.user.sub);
  }

  @Get('chef/connect/refresh')
  @Header('Cache-Control', 'no-store')
  @Redirect()
  async refreshOnboardingLink(@Query('token') token: string) {
    return {
      url: await this.paymentsService.refreshOnboardingLink(token),
      statusCode: 303,
    };
  }

  @Get('admin/configuration')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.admin)
  getAdminPaymentConfiguration() {
    return this.paymentsService.getAdminPaymentConfiguration();
  }

  @Patch('admin/configuration')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.admin)
  updatePaymentConfiguration(
    @Req() request: AuthenticatedRequest,
    @Body() dto: PaymentConfigurationDto,
  ) {
    return this.paymentsService.updatePaymentConfiguration(request.user.sub, dto);
  }

  @Post('webhooks/stripe')
  @SkipThrottle()
  @Header('Cache-Control', 'no-store')
  handleStripeWebhook(
    @Req() request: RawBodyRequest,
    @Headers('stripe-signature') signature: string | undefined,
  ) {
    return this.paymentsService.handleStripeWebhook(request.rawBody, signature);
  }
}
