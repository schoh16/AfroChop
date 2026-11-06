import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { MediaModule } from '../media/media.module.js';
import { GroceryController } from './grocery.controller.js';
import { GroceryService } from './grocery.service.js';
import { ShippoService } from './shippo.service.js';

@Module({
  imports: [AuthModule, MediaModule],
  controllers: [GroceryController],
  providers: [GroceryService, ShippoService],
})
export class GroceryModule {}
