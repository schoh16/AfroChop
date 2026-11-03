import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { SafetyController } from './safety.controller.js';
import { SafetyService } from './safety.service.js';
import { VerificationCodeService } from './verification-code.service.js';

@Module({
  imports: [AuthModule],
  controllers: [SafetyController],
  providers: [SafetyService, VerificationCodeService],
})
export class SafetyModule {}
