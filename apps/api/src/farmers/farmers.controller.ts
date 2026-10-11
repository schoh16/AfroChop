import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
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
  FarmInquiryDto,
  FarmProduceDto,
  FarmQuoteDto,
  FarmerProfileDto,
  FarmerSearchDto,
} from './dto/farmer.dto.js';
import { FarmersService } from './farmers.service.js';

@Controller('farmers')
export class FarmersController {
  constructor(private readonly farmers: FarmersService) {}

  @Get()
  search(@Query() query: FarmerSearchDto) {
    return this.farmers.search(query);
  }

  @Get('me/profile')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.farmer)
  myProfile(@Req() request: AuthenticatedRequest) {
    return this.farmers.getMyProfile(request.user.sub);
  }

  @Put('me/profile')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.farmer)
  saveProfile(@Req() request: AuthenticatedRequest, @Body() dto: FarmerProfileDto) {
    return this.farmers.saveProfile(request.user.sub, dto);
  }

  @Post('me/produce')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.farmer)
  addProduce(@Req() request: AuthenticatedRequest, @Body() dto: FarmProduceDto) {
    return this.farmers.addProduce(request.user.sub, dto);
  }

  @Patch('me/produce/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.farmer)
  updateProduce(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: FarmProduceDto,
  ) {
    return this.farmers.updateProduce(request.user.sub, id, dto);
  }

  @Delete('me/produce/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.farmer)
  deleteProduce(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.farmers.deleteProduce(request.user.sub, id);
  }

  @Get('me/inquiries')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.farmer)
  farmerInquiries(@Req() request: AuthenticatedRequest) {
    return this.farmers.listFarmerInquiries(request.user.sub);
  }

  @Post('inquiries/:id/quote')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.farmer)
  quote(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: FarmQuoteDto,
  ) {
    return this.farmers.quoteInquiry(request.user.sub, id, dto);
  }

  @Patch('inquiries/:id/decline')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.farmer)
  decline(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.farmers.declineInquiry(request.user.sub, id);
  }

  @Post('inquiries')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.customer)
  createInquiry(@Req() request: AuthenticatedRequest, @Body() dto: FarmInquiryDto) {
    return this.farmers.createInquiry(request.user.sub, dto);
  }

  @Get('inquiries/mine')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.customer)
  customerInquiries(@Req() request: AuthenticatedRequest) {
    return this.farmers.listCustomerInquiries(request.user.sub);
  }

  @Get(':id')
  profile(@Param('id', ParseUUIDPipe) id: string) {
    return this.farmers.getPublicProfile(id);
  }
}