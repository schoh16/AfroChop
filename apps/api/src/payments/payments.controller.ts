import {
  Body,
  Controller,
  Get,
  Headers,
  Header,
  Patch,
  Post,
  Query,
  Redirect,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { AuthenticatedRequest } from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { PaymentConfigurationDto } from './dto/payment-configuration.dto.js';
import { PaymentsService } from './payments.service.js';

type RawBodyRequest = Request & { rawBody?: Buffer };

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get('configuration')
  getCustomerPaymentConfiguration() {
    return this.paymentsService.getCustomerPaymentConfiguration();
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
  @Header('Cache-Control', 'no-store')
  handleStripeWebhook(
    @Req() request: RawBodyRequest,
    @Headers('stripe-signature') signature: string | undefined,
  ) {
    return this.paymentsService.handleStripeWebhook(request.rawBody, signature);
  }
}
