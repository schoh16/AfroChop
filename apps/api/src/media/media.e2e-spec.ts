import { UnauthorizedException, ValidationPipe, type CanActivate, type ExecutionContext, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { JwtAuthGuard, type AuthenticatedRequest } from '../auth/jwt-auth.guard.js';
import { MediaController } from './media.controller.js';
import { MediaService } from './media.service.js';
import { MAX_VIDEO_BYTES } from './video.service.js';
import { VideoUploadGuard } from './video-upload.guard.js';

vi.mock('@nestjs/jwt', () => ({ JwtService: class TestJwtService {} }));

class TestBearerGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    const role = token === 'chef' ? UserRole.chef : token === 'farmer' ? UserRole.farmer : token === 'customer' ? UserRole.customer : null;
    if (!role) throw new UnauthorizedException();
    req.user = { sub: role, role };
    return true;
  }
}

describe('Seller video API', () => {
  let app: INestApplication<App>;
  const media = { uploadVideo: vi.fn(), upload: vi.fn(), gallery: vi.fn(), remove: vi.fn() };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await Test.createTestingModule({
      controllers: [MediaController],
      providers: [{ provide: MediaService, useValue: media }, VideoUploadGuard],
    }).overrideGuard(JwtAuthGuard).useClass(TestBearerGuard).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });
  afterEach(async () => { await app?.close(); });

  it('rejects unauthenticated and customer uploads', async () => {
    await request(app.getHttpServer()).post('/api/media/gallery/video').expect(401);
    await request(app.getHttpServer()).post('/api/media/gallery/video').auth('customer', { type: 'bearer' }).expect(403);
    expect(media.uploadVideo).not.toHaveBeenCalled();
  });

  it.each(['chef', 'farmer'])('accepts a multipart %s video and caption', async (role) => {
    media.uploadVideo.mockResolvedValue({ id: 'clip', mediaType: 'video', imageUrl: 'https://cdn.example/clip.mp4' });
    const response = await request(app.getHttpServer()).post('/api/media/gallery/video')
      .auth(role, { type: 'bearer' }).field('caption', 'Fresh food')
      .attach('file', Buffer.from('video'), { filename: 'food.mov', contentType: 'video/quicktime' }).expect(201);
    expect(response.body.mediaType).toBe('video');
    expect(media.uploadVideo).toHaveBeenCalledWith(role, expect.objectContaining({ mimetype: 'video/quicktime', size: 5 }), 'Fresh food');
  });

  it('rejects a video one byte over 50 MB before the service is called', async () => {
    await request(app.getHttpServer()).post('/api/media/gallery/video')
      .auth('farmer', { type: 'bearer' })
      .attach('file', Buffer.alloc(MAX_VIDEO_BYTES + 1), { filename: 'large.mp4', contentType: 'video/mp4' }).expect(413);
    expect(media.uploadVideo).not.toHaveBeenCalled();
  });

  it('accepts a video exactly at the 50 MB transport limit', async () => {
    media.uploadVideo.mockResolvedValue({ id: 'clip', mediaType: 'video' });
    await request(app.getHttpServer()).post('/api/media/gallery/video')
      .auth('chef', { type: 'bearer' })
      .attach('file', Buffer.alloc(MAX_VIDEO_BYTES), { filename: 'limit.mp4', contentType: 'video/mp4' }).expect(201);
    expect(media.uploadVideo).toHaveBeenCalledWith('chef', expect.objectContaining({ size: MAX_VIDEO_BYTES }), undefined);
  });

  it('rejects captions over 500 characters and allows the next request', async () => {
    await request(app.getHttpServer()).post('/api/media/gallery/video')
      .auth('chef', { type: 'bearer' }).field('caption', 'x'.repeat(501))
      .attach('file', Buffer.from('video'), 'food.mp4').expect(400);
    media.uploadVideo.mockResolvedValue({ id: 'clip', mediaType: 'video' });
    await request(app.getHttpServer()).post('/api/media/gallery/video')
      .auth('farmer', { type: 'bearer' }).attach('file', Buffer.from('video'), 'food.mp4').expect(201);
  });
});
