import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { ChefsController } from './chefs.controller.js';
import { ChefsService } from './chefs.service.js';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [ChefsController],
  providers: [ChefsService],
})
export class ChefsModule {}
