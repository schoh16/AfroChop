import { Module } from '@nestjs/common';
import { CognitoService } from './cognito.service.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { RolesGuard } from './roles.guard.js';
import { MarketingContactService } from './marketing-contact.service.js';

@Module({
  controllers: [AuthController],
  providers: [AuthService, CognitoService, JwtAuthGuard, RolesGuard, MarketingContactService],
  exports: [AuthService, CognitoService, JwtAuthGuard, RolesGuard],
})
export class AuthModule {}
