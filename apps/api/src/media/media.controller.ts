import {
  Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Req,
  UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { UserRole } from '@prisma/client';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard, type AuthenticatedRequest } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { MAX_PHOTO_BYTES, MediaService } from './media.service.js';
import type { UploadedPhoto } from './media.service.js';
import { MAX_VIDEO_BYTES } from './video.service.js';
import { VideoUploadGuard } from './video-upload.guard.js';

class PhotoDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  caption?: string;
}

@Controller('media')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.chef)
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Get('gallery')
  gallery(@Req() request: AuthenticatedRequest) {
    return this.media.gallery(request.user.sub);
  }

  @Post('profile-photo')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_PHOTO_BYTES, files: 1, fields: 1 } }))
  profile(@Req() request: AuthenticatedRequest, @UploadedFile() file?: UploadedPhoto) {
    return this.media.upload(request.user.sub, file, true);
  }

  @Post('gallery')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_PHOTO_BYTES, files: 1, fields: 1 } }))
  upload(@Req() request: AuthenticatedRequest, @Body() dto: PhotoDto, @UploadedFile() file?: UploadedPhoto) {
    return this.media.upload(request.user.sub, file, false, dto.caption);
  }

  @Delete('gallery/:id')
  remove(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.media.remove(request.user.sub, id);
  }

  @Post('gallery/video')
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  @UseGuards(VideoUploadGuard)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_VIDEO_BYTES, files: 1, fields: 1 } }),
  )
  uploadVideo(@Req() request: AuthenticatedRequest, @Body() dto: PhotoDto, @UploadedFile() file?: UploadedPhoto) {
    return this.media.uploadVideo(request.user.sub, file, dto.caption);
  }
}
