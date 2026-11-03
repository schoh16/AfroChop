import {
  BadRequestException, Injectable, Logger, NotFoundException, ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { PrismaService } from '../prisma/prisma.service.js';
import { VideoService } from './video.service.js';

export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
export type UploadedPhoto = { buffer: Buffer; size: number; mimetype: string };

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly videos: VideoService,
  ) {}

  private storage() {
    const bucket = this.config.get<string>('SELLER_PHOTOS_BUCKET');
    const publicBase = this.config.get<string>('SELLER_PHOTOS_PUBLIC_URL');
    const endpoint = this.config.get<string>('SELLER_PHOTOS_ENDPOINT');
    const accessKeyId = this.config.get<string>('SELLER_PHOTOS_ACCESS_KEY_ID');
    const secretAccessKey = this.config.get<string>('SELLER_PHOTOS_SECRET_ACCESS_KEY');
    if (!bucket || !publicBase || !accessKeyId || !secretAccessKey) {
      throw new ServiceUnavailableException('Photo uploads are not configured yet. Please contact AfroChop support.');
    }
    const base = new URL(publicBase);
    if (base.protocol !== 'https:' || base.search || base.hash) {
      throw new ServiceUnavailableException('The photo storage public URL must use HTTPS without query parameters.');
    }
    return {
      bucket, publicBase: publicBase.replace(/\/$/, ''),
      client: new S3Client({
        region: this.config.get<string>('SELLER_PHOTOS_REGION') ?? 'us-east-1',
        ...(endpoint ? { endpoint } : {}),
        forcePathStyle: true,
        credentials: { accessKeyId, secretAccessKey },
      }),
    };
  }

  private async seller(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId, isActive: true },
      select: { role: true, chefProfile: { select: { id: true } }, farmerProfile: { select: { id: true } } },
    });
    const chefId = user?.role === 'chef' ? user.chefProfile?.id : undefined;
    const farmerId = user?.role === 'farmer' ? user.farmerProfile?.id : undefined;
    if (!chefId && !farmerId) throw new NotFoundException('Create your seller profile before adding photos.');
    return { chefId, farmerId };
  }

  async gallery(userId: string) {
    const { chefId, farmerId } = await this.seller(userId);
    return chefId
      ? this.prisma.chefFoodPhoto.findMany({ where: { chefId }, orderBy: { createdAt: 'desc' } })
      : this.prisma.farmerPhoto.findMany({ where: { farmerId }, orderBy: { createdAt: 'desc' } });
  }

  async uploadVideo(userId: string, file: UploadedPhoto | undefined, caption?: string) {
    const { chefId, farmerId } = await this.seller(userId);
    const video = await this.videos.prepare(file);
    const { client, bucket, publicBase } = this.storage();
    const key = `sellers/${userId}/${randomUUID()}.mp4`;
    const imageUrl = `${publicBase}/${key}`;
    try {
      await client.send(new PutObjectCommand({
        Bucket: bucket, Key: key, Body: video, ContentType: 'video/mp4',
        CacheControl: 'public, max-age=31536000, immutable',
      }));
    } catch (error) {
      client.destroy();
      this.logger.error('Seller video storage upload failed.', error instanceof Error ? error.stack : undefined);
      throw new ServiceUnavailableException('Video storage is temporarily unavailable. Please try again.');
    }
    try {
      const data = { imageUrl, caption: caption?.trim() || null, mediaType: 'video' as const };
      return chefId
        ? await this.prisma.chefFoodPhoto.create({ data: { ...data, chefId } })
        : await this.prisma.farmerPhoto.create({ data: { ...data, farmerId: farmerId! } });
    } catch (error) {
      try { await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })); }
      catch (cleanupError) { this.logger.error('Could not clean up an unattached seller video.', cleanupError); }
      throw error;
    } finally {
      client.destroy();
    }
  }

  async upload(userId: string, file: UploadedPhoto | undefined, profile: boolean, caption?: string) {
    const { chefId, farmerId } = await this.seller(userId);
    if (!file || !file.buffer.length || file.size > MAX_PHOTO_BYTES ||
        !['image/jpeg', 'image/png'].includes(file.mimetype)) {
      throw new BadRequestException('Choose a JPEG or PNG photo up to 2 MB.');
    }
    let image: Buffer;
    try {
      const decoder = sharp(file.buffer, { limitInputPixels: 20_000_000, animated: false });
      const metadata = await decoder.metadata();
      if (!['jpeg', 'png'].includes(metadata.format ?? '') || (metadata.pages ?? 1) > 1) {
        throw new Error('Unsupported image format.');
      }
      image = await decoder.rotate().resize(profile
        ? { width: 640, height: 640, fit: 'cover' }
        : { width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 80 }).toBuffer();
    } catch {
      throw new BadRequestException('This photo could not be read. Choose a non-animated JPEG or PNG under 20 megapixels.');
    }
    const { client, bucket, publicBase } = this.storage();
    const key = `sellers/${userId}/${randomUUID()}.jpg`;
    const imageUrl = `${publicBase}/${key}`;
    try {
      await client.send(new PutObjectCommand({
        Bucket: bucket, Key: key, Body: image, ContentType: 'image/jpeg',
        CacheControl: 'public, max-age=31536000, immutable',
      }));
    } catch (error) {
      this.logger.error('Seller photo storage upload failed.', error instanceof Error ? error.stack : undefined);
      throw new ServiceUnavailableException('Photo storage is temporarily unavailable. Please try again.');
    }
    try {
      if (profile) {
        if (chefId) await this.prisma.chefProfile.update({ where: { id: chefId }, data: { profileImageUrl: imageUrl } });
        else await this.prisma.farmerProfile.update({ where: { id: farmerId }, data: { profileImageUrl: imageUrl } });
        return { profileImageUrl: imageUrl };
      }
      const data = { imageUrl, caption: caption?.trim() || null };
      return chefId
        ? await this.prisma.chefFoodPhoto.create({ data: { ...data, chefId, mediaType: 'image' } })
        : await this.prisma.farmerPhoto.create({ data: { ...data, farmerId: farmerId! } });
    } catch (error) {
      try { await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })); }
      catch (cleanupError) { this.logger.error('Could not clean up an unattached seller photo.', cleanupError); }
      throw error;
    }
  }

  async remove(userId: string, photoId: string) {
    const { chefId, farmerId } = await this.seller(userId);
    const photo = chefId
      ? await this.prisma.chefFoodPhoto.findFirst({ where: { id: photoId, chefId } })
      : await this.prisma.farmerPhoto.findFirst({ where: { id: photoId, farmerId } });
    if (!photo) throw new NotFoundException('Photo not found.');
    const { client, bucket, publicBase } = this.storage();
    const prefix = `${publicBase}/sellers/${userId}/`;
    if (!photo.imageUrl.startsWith(prefix)) {
      throw new BadRequestException('Only media uploaded through AfroChop can be removed here.');
    }
    const key = photo.imageUrl.slice(publicBase.length + 1);
    try { await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })); }
    catch (error) {
      this.logger.error('Seller photo storage deletion failed.', error);
      throw new ServiceUnavailableException('The photo could not be removed. Please try again.');
    }
    if (chefId) await this.prisma.chefFoodPhoto.delete({ where: { id: photoId } });
    else await this.prisma.farmerPhoto.delete({ where: { id: photoId } });
    return { deleted: true };
  }
}
