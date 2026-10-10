import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { SafetyController } from './safety.controller.js';
import { SafetyService } from './safety.service.js';

@Module({
  imports: [AuthModule],
  controllers: [SafetyController],
  providers: [SafetyService],
})
export class SafetyModule {}
