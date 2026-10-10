import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { AuthenticatedRequest } from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { BookingRequestDto } from './dto/booking-request.dto.js';
import { AllergyResponseDto } from './dto/allergy-response.dto.js';
import {
  ChefQuoteDto,
  GroceryReceiptDto,
  UpdateQuotePriceDto,
} from './dto/chef-quote.dto.js';
import { QuotesService } from './quotes.service.js';

@Controller('quotes')
export class QuotesController {
  constructor(private readonly quotesService: QuotesService) {}

  @Get('requests')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.customer, UserRole.chef)
  listRequests(@Req() request: AuthenticatedRequest) {
    return request.user.role === UserRole.customer
      ? this.quotesService.listForCustomer(request.user.sub)
      : this.quotesService.listForChef(request.user.sub);
  }

  @Get('requests/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.customer, UserRole.chef)
  getRequest(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) bookingRequestId: string,
  ) {
    return this.quotesService.getRequest(
      request.user.sub,
      request.user.role,
      bookingRequestId,
    );
  }

  @Post('request')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.customer)
  createBookingRequest(
    @Req() request: AuthenticatedRequest,
    @Body() dto: BookingRequestDto,
  ) {
    return this.quotesService.createBookingRequest(request.user.sub, dto);
  }

  @Patch('requests/:id/allergy-response')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.chef)
  respondToAllergyRequest(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) bookingRequestId: string,
    @Body() dto: AllergyResponseDto,
  ) {
    return this.quotesService.respondToAllergyRequest(
      request.user.sub,
      bookingRequestId,
      dto,
    );
  }

  @Post(':id/chef-quote')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.chef)
  createChefQuote(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) bookingRequestId: string,
    @Body() dto: ChefQuoteDto,
  ) {
    return this.quotesService.createChefQuote(
      request.user.sub,
      bookingRequestId,
      dto,
    );
  }

  @Patch(':id/price')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.chef)
  updatePrice(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) quoteId: string,
    @Body() dto: UpdateQuotePriceDto,
  ) {
    return this.quotesService.updatePrice(request.user.sub, quoteId, dto);
  }

  @Post(':id/receipt')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.chef)
  submitReceipt(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) bookingRequestId: string,
    @Body() dto: GroceryReceiptDto,
  ) {
    return this.quotesService.submitReceipt(
      request.user.sub,
      bookingRequestId,
      dto,
    );
  }

  @Patch('requests/:id/complete')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.customer, UserRole.chef)
  markCompleted(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) bookingRequestId: string,
  ) {
    return this.quotesService.confirmCompletion(
      request.user.sub,
      request.user.role,
      bookingRequestId,
    );
  }
}
