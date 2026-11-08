import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserRole } from '@prisma/client';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { AuthenticatedRequest } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { GroceryService } from './grocery.service.js';
import { MAX_PHOTO_BYTES, MediaService } from '../media/media.service.js';
import type { UploadedPhoto } from '../media/media.service.js';
import {
  GroceryCheckoutDto,
  GroceryFulfillDto,
  GroceryProductDto,
  GroceryQuoteDto,
  GroceryReconcileDto,
  StoreSettingsDto,
} from './grocery.dto.js';

@Controller('grocery')
export class GroceryController {
  constructor(
    private readonly grocery: GroceryService,
    private readonly media: MediaService,
  ) {}
  @Get() @Header('Cache-Control', 'no-store') catalog() {
    return this.grocery.catalog();
  }

  @Post('quotes')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.customer, UserRole.chef)
  quote(@Req() req: AuthenticatedRequest, @Body() dto: GroceryQuoteDto) {
    return this.grocery.quote(req.user.sub, dto);
  }
  @Post('orders/:id/checkout')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.customer, UserRole.chef)
  checkout(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: GroceryCheckoutDto,
  ) {
    return this.grocery.checkout(req.user.sub, id, dto.rateId);
  }
  @Get('orders/mine')
  @Header('Cache-Control', 'no-store')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.customer, UserRole.chef)
  orders(@Req() req: AuthenticatedRequest) {
    return this.grocery.orders(req.user.sub);
  }
  @Post('orders/:id/refresh')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.customer, UserRole.chef)
  refresh(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.grocery.reconcile(req.user.sub, id);
  }

  @Get('admin/settings')
  @Header('Cache-Control', 'no-store')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.admin)
  settings(@Req() req: AuthenticatedRequest) {
    return this.grocery.settings(req.user.sub);
  }
  @Put('admin/settings')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.admin)
  saveSettings(
    @Req() req: AuthenticatedRequest,
    @Body() dto: StoreSettingsDto,
  ) {
    return this.grocery.saveSettings(req.user.sub, dto);
  }
  @Get('admin/products')
  @Header('Cache-Control', 'no-store')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.admin)
  products(@Req() req: AuthenticatedRequest) {
    return this.grocery.products(req.user.sub);
  }
  @Post('admin/products')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.admin)
  createProduct(
    @Req() req: AuthenticatedRequest,
    @Body() dto: GroceryProductDto,
  ) {
    return this.grocery.saveProduct(req.user.sub, dto);
  }
  @Post('admin/products/image')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.admin)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_PHOTO_BYTES, files: 1 } }))
  async uploadProductImage(
    @Req() req: AuthenticatedRequest,
    @UploadedFile() file?: UploadedPhoto,
  ) {
    await this.grocery.authorizeOwner(req.user.sub);
    return this.media.uploadGroceryProductImage(req.user.sub, file);
  }
  @Put('admin/products/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.admin)
  updateProduct(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: GroceryProductDto,
  ) {
    return this.grocery.saveProduct(req.user.sub, dto, id);
  }
  @Get('admin/orders')
  @Header('Cache-Control', 'no-store')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.admin)
  adminOrders(@Req() req: AuthenticatedRequest) {
    return this.grocery.adminOrders(req.user.sub);
  }
  @Get('admin/orders/:id/address')
  @Header('Cache-Control', 'no-store')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.admin)
  orderAddress(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.grocery.orderAddress(req.user.sub, id);
  }
  @Post('admin/orders/:id/refresh')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.admin)
  adminRefresh(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: GroceryReconcileDto,
  ) {
    return this.grocery.reconcile(req.user.sub, id, true, dto.stripeSessionId);
  }
  @Patch('admin/orders/:id/fulfill')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.admin)
  fulfill(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: GroceryFulfillDto,
  ) {
    return this.grocery.fulfill(req.user.sub, id, dto.trackingNumber);
  }
  @Post('webhooks/stripe')
  @SkipThrottle()
  webhook(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('stripe-signature') signature?: string,
  ) {
    return this.grocery.webhook(req.rawBody, signature);
  }
}
