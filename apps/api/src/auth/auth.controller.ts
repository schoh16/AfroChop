import { Body, Controller, Get, Patch, Post, Req, Res, UnauthorizedException, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { CognitoService } from './cognito.service.js';
import { ConfirmationDto, EmailDto, RefreshSessionDto, ResetPasswordDto } from './dto/recovery.dto.js';
import { clearSessionCookie, isBrowserSession, readRefreshToken, sendSession } from './session-transport.js';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { IsBoolean, IsString, Length } from 'class-validator';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import type { AuthenticatedRequest } from './jwt-auth.guard.js';
import { Roles } from './roles.decorator.js';
import { RolesGuard } from './roles.guard.js';
import { UserRole } from '@prisma/client';
import { MarketingContactService } from './marketing-contact.service.js';
import { AllowRoleSelection } from './role-selection.decorator.js';
import { SelectRoleDto } from './dto/select-role.dto.js';

class NotificationPreferenceDto {
  @IsBoolean()
  smsOrderUpdates: boolean;
}

class MarketingContactPreferenceDto {
  @IsString()
  @Length(2, 2)
  countryCode: string;

  @IsBoolean()
  enabled: boolean;

  @IsBoolean()
  explicitConsent: boolean;
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly marketingContactService: MarketingContactService,
    private readonly cognito: CognitoService,
  ) {}

  @Post('register')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  async login(@Body() dto: LoginDto, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    isBrowserSession(request);
    return sendSession(request, response, await this.authService.login(dto));
  }

  @Post('confirm')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  confirm(@Body() dto: ConfirmationDto) {
    return this.cognito.confirm(dto.email.trim().toLowerCase(), dto.code);
  }

  @Post('resend-confirmation')
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  resend(@Body() dto: EmailDto) {
    return this.cognito.resend(dto.email.trim().toLowerCase());
  }

  @Post('forgot-password')
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  forgotPassword(@Body() dto: EmailDto) {
    return this.cognito.forgotPassword(dto.email.trim().toLowerCase());
  }

  @Post('reset-password')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.cognito.resetPassword(dto.email.trim().toLowerCase(), dto.code, dto.password);
  }

  @Post('refresh')
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  async refresh(@Body() dto: RefreshSessionDto, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    isBrowserSession(request);
    response.setHeader('Cache-Control', 'no-store');
    try {
      return sendSession(request, response, await this.authService.refresh(readRefreshToken(request, dto.refreshToken)));
    } catch (error) {
      if (error instanceof UnauthorizedException) clearSessionCookie(response);
      throw error;
    }
  }

  @Post('logout')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  async logout(@Body() dto: RefreshSessionDto, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    isBrowserSession(request);
    response.setHeader('Cache-Control', 'no-store');
    try {
      const refreshToken = readRefreshToken(request, dto.refreshToken);
      await this.cognito.logout(refreshToken, request.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1]);
    } catch (error) {
      if (!(error instanceof UnauthorizedException)) throw error;
    }
    clearSessionCookie(response);
    return { message: 'Signed out.' };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @AllowRoleSelection()
  me(@Req() request: AuthenticatedRequest) {
    return this.authService.me(request.user.sub);
  }

  @Post('me/role')
  @UseGuards(JwtAuthGuard)
  @AllowRoleSelection()
  selectRole(@Req() request: AuthenticatedRequest, @Body() dto: SelectRoleDto) {
    return this.authService.selectRole(request.user.sub, dto.role);
  }

  @Patch('me/notification-preferences')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.customer)
  updateNotificationPreferences(
    @Req() request: AuthenticatedRequest,
    @Body() dto: NotificationPreferenceDto,
  ) {
    return this.authService.updateNotificationPreferences(
      request.user.sub,
      dto.smsOrderUpdates,
    );
  }

  @Patch('me/marketing-contact-preference')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.customer, UserRole.chef)
  updateMarketingContactPreference(
    @Req() request: AuthenticatedRequest,
    @Body() dto: MarketingContactPreferenceDto,
  ) {
    return this.marketingContactService.setPreference(
      request.user.sub,
      dto.countryCode,
      dto.enabled,
      dto.explicitConsent,
    );
  }

  @Get('me/marketing-contact-preference')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.customer, UserRole.chef)
  getMarketingContactPreference(@Req() request: AuthenticatedRequest) {
    return this.marketingContactService.getPreference(request.user.sub);
  }
}
