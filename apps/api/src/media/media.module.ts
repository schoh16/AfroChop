import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { MediaService } from './media.service.js';
import { MediaController } from './media.controller.js';
import { VideoService } from './video.service.js';
import { VideoUploadGuard } from './video-upload.guard.js';

@Module({
  imports: [AuthModule],
  controllers: [MediaController],
  providers: [MediaService, VideoService, VideoUploadGuard],
})
export class MediaModule {}
