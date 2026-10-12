import { Body, Controller, Get, Patch, Post, Req, UseGuards } from '@nestjs/common';
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
  ) {}

  @Post('register')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
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
