import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { UserRole, UserVerificationType } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { AuthenticatedRequest } from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import {
  ComplianceRuleDto,
  ChefStatusReviewDto,
  ChefCredentialDto,
  ChefCredentialReviewDto,
  ChefServiceApprovalDto,
  ChefApplicationDto,
  ChefApplicationReviewDto,
  CustomerServiceAddressDto,
  PermitReviewDto,
  PhoneNumberDto,
  SafetyIncidentDto,
  SafetyIncidentReviewDto,
  ServiceAddressReviewDto,
  UserVerificationReviewDto,
  VerificationCodeDto,
} from './dto/safety.dto.js';
import { SafetyService } from './safety.service.js';
import { VerificationCodeService } from './verification-code.service.js';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class SafetyController {
  constructor(
    private readonly safetyService: SafetyService,
    private readonly codes: VerificationCodeService,
  ) {}

  @Post('chefs/me/application')
  @Header('Cache-Control', 'no-store')
  @Roles(UserRole.chef)
  submitChefApplication(
    @Req() request: AuthenticatedRequest,
    @Body() dto: ChefApplicationDto,
  ) {
    return this.safetyService.submitChefApplication(request.user.sub, dto);
  }

  @Get('chefs/me/application')
  @Header('Cache-Control', 'no-store')
  @Roles(UserRole.chef)
  getMyChefApplication(@Req() request: AuthenticatedRequest) {
    return this.safetyService.getMyChefApplication(request.user.sub);
  }

  @Get('admin/verification/chef-applications')
  @Header('Cache-Control', 'no-store')
  @Roles(UserRole.admin)
  listChefApplications() {
    return this.safetyService.listChefApplications();
  }

  @Get('admin/verification/chef-applications/:id/address')
  @Header('Cache-Control', 'no-store')
  @Roles(UserRole.admin)
  getChefApplicationAddress(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.safetyService.getChefApplicationAddress(request.user.sub, id);
  }

  @Patch('admin/verification/chef-applications/:id')
  @Header('Cache-Control', 'no-store')
  @Roles(UserRole.admin)
  reviewChefApplication(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChefApplicationReviewDto,
  ) {
    return this.safetyService.reviewChefApplication(request.user.sub, id, dto);
  }

  @Get('admin/verification/service-addresses/:id')
  @Header('Cache-Control', 'no-store')
  @Roles(UserRole.admin)
  readServiceAddress(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.safetyService.getAdminServiceAddress(request.user.sub, id);
  }

  @Get('verification/bookings/:id/service-address')
  @Header('Cache-Control', 'no-store')
  @Roles(UserRole.customer, UserRole.chef)
  readBookingServiceAddress(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.safetyService.getBookingServiceAddress(
      request.user.sub,
      request.user.role,
      id,
    );
  }

  @Post('verification/me/:type/send-code')
  @Roles(UserRole.customer, UserRole.chef)
  sendCode(
    @Req() request: AuthenticatedRequest,
    @Param('type', new ParseEnumPipe(UserVerificationType))
    type: UserVerificationType,
  ) {
    return this.codes.send(request.user.sub, type);
  }

  @Post('verification/me/:type/check-code')
  @Roles(UserRole.customer, UserRole.chef)
  checkCode(
    @Req() request: AuthenticatedRequest,
    @Param('type', new ParseEnumPipe(UserVerificationType))
    type: UserVerificationType,
    @Body() dto: VerificationCodeDto,
  ) {
    return this.codes.check(request.user.sub, type, dto.code);
  }

  @Get('verification/me')
  @Header('Cache-Control', 'no-store')
  @Roles(UserRole.customer, UserRole.chef)
  getMyVerification(@Req() request: AuthenticatedRequest) {
    return this.safetyService.getMyVerification(
      request.user.sub,
      request.user.role,
    );
  }

  @Put('verification/me/phone')
  @Roles(UserRole.customer, UserRole.chef)
  updateMyPhoneNumber(
    @Req() request: AuthenticatedRequest,
    @Body() dto: PhoneNumberDto,
  ) {
    return this.safetyService.updateMyPhoneNumber(request.user.sub, dto);
  }

  @Post('verification/me/service-addresses')
  @Roles(UserRole.customer)
  createMyServiceAddress(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CustomerServiceAddressDto,
  ) {
    return this.safetyService.createMyServiceAddress(request.user.sub, dto);
  }

  @Post('chefs/me/verification/credentials')
  @Roles(UserRole.chef)
  createChefCredential(
    @Req() request: AuthenticatedRequest,
    @Body() dto: ChefCredentialDto,
  ) {
    return this.safetyService.createChefCredential(request.user.sub, dto);
  }

  @Get('admin/verification/queue')
  @Roles(UserRole.admin)
  getVerificationQueue() {
    return this.safetyService.getVerificationQueue();
  }

  @Patch('admin/verification/service-addresses/:id')
  @Roles(UserRole.admin)
  reviewServiceAddress(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ServiceAddressReviewDto,
  ) {
    return this.safetyService.reviewServiceAddress(request.user.sub, id, dto);
  }

  @Patch('admin/verification/users/:userId/:type')
  @Roles(UserRole.admin)
  reviewUserVerification(
    @Req() request: AuthenticatedRequest,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('type', new ParseEnumPipe(UserVerificationType))
    type: UserVerificationType,
    @Body() dto: UserVerificationReviewDto,
  ) {
    return this.safetyService.reviewUserVerification(
      request.user.sub,
      userId,
      type,
      dto,
    );
  }

  @Patch('admin/verification/credentials/:id')
  @Roles(UserRole.admin)
  reviewChefCredential(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChefCredentialReviewDto,
  ) {
    return this.safetyService.reviewChefCredential(request.user.sub, id, dto);
  }

  @Put('admin/verification/chefs/:chefId/services')
  @Roles(UserRole.admin)
  reviewChefServiceApproval(
    @Req() request: AuthenticatedRequest,
    @Param('chefId', ParseUUIDPipe) chefId: string,
    @Body() dto: ChefServiceApprovalDto,
  ) {
    return this.safetyService.reviewChefServiceApproval(
      request.user.sub,
      chefId,
      dto,
    );
  }

  @Post('safety/incidents')
  @Roles(UserRole.customer, UserRole.chef, UserRole.admin)
  reportIncident(
    @Req() request: AuthenticatedRequest,
    @Body() dto: SafetyIncidentDto,
  ) {
    return this.safetyService.reportIncident(
      request.user.sub,
      request.user.role,
      dto,
    );
  }

  @Get('safety/incidents/mine')
  @Roles(UserRole.customer, UserRole.chef)
  listOwnIncidents(@Req() request: AuthenticatedRequest) {
    return this.safetyService.listOwnIncidents(request.user.sub);
  }

  @Get('admin/safety/incidents')
  @Roles(UserRole.admin)
  getAdminIncidents() {
    return this.safetyService.getAdminIncidents();
  }

  @Patch('admin/safety/incidents/:id')
  @Roles(UserRole.admin)
  reviewIncident(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SafetyIncidentReviewDto,
  ) {
    return this.safetyService.reviewIncident(request.user.sub, id, dto);
  }

  @Put('admin/safety/compliance-rules')
  @Roles(UserRole.admin)
  saveComplianceRule(
    @Req() request: AuthenticatedRequest,
    @Body() dto: ComplianceRuleDto,
  ) {
    return this.safetyService.saveComplianceRule(request.user.sub, dto);
  }

  @Get('admin/safety/permits/pending')
  @Roles(UserRole.admin)
  listPendingPermits() {
    return this.safetyService.listPendingPermits();
  }

  @Patch('admin/safety/permits/:id/review')
  @Roles(UserRole.admin)
  reviewPermit(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PermitReviewDto,
  ) {
    return this.safetyService.reviewPermit(request.user.sub, id, dto);
  }

  @Patch('admin/safety/chefs/:id/status')
  @Roles(UserRole.admin)
  updateChefStatus(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) chefId: string,
    @Body() dto: ChefStatusReviewDto,
  ) {
    return this.safetyService.updateChefStatus(request.user.sub, chefId, dto);
  }
}
