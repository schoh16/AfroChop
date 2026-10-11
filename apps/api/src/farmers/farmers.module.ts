import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { FarmersController } from './farmers.controller.js';
import { FarmersService } from './farmers.service.js';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [FarmersController],
  providers: [FarmersService],
})
export class FarmersModule {}