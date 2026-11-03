import { beforeEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { MAX_PHOTO_BYTES, MediaService } from './media.service.js';

const { send } = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: class { send = send; destroy() {} },
  PutObjectCommand: class { constructor(readonly input: unknown) {} },
  DeleteObjectCommand: class { constructor(readonly input: unknown) {} },
}));

function setup(role = 'chef', configured = true) {
  const prisma = {
    user: { findUnique: vi.fn().mockResolvedValue({
      role, chefProfile: { id: 'chef' }, farmerProfile: { id: 'farmer' },
    }) },
    chefProfile: { update: vi.fn() }, farmerProfile: { update: vi.fn() },
    chefFoodPhoto: { create: vi.fn().mockImplementation(({ data }) => ({ id: 'photo', ...data })),
      findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn(), delete: vi.fn() },
    farmerPhoto: { create: vi.fn().mockImplementation(({ data }) => ({ id: 'photo', ...data })),
      findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn(), delete: vi.fn() },
  };
  const settings: Record<string, string> = configured ? {
    SELLER_PHOTOS_BUCKET: 'photos',
    SELLER_PHOTOS_PUBLIC_URL: 'https://images.example.test',
    SELLER_PHOTOS_ACCESS_KEY_ID: 'test',
    SELLER_PHOTOS_SECRET_ACCESS_KEY: 'test',
  } : {};
  const config = { get: (key: string) => settings[key] };
  const videos = { prepare: vi.fn().mockResolvedValue(Buffer.from('processed-video')) };
  return { prisma, videos, service: new MediaService(prisma as never, config as never, videos as never) };
}

async function photo() {
  const buffer = await sharp({ create: { width: 20, height: 10, channels: 3, background: 'green' } }).png().toBuffer();
  return { buffer, size: buffer.length, mimetype: 'image/png' };
}

describe('seller photo storage', () => {
  beforeEach(() => { vi.clearAllMocks(); send.mockResolvedValue({}); });

  it.each(['chef', 'farmer'])('saves an optimized %s profile picture without payout or approval setup', async (role) => {
    const { service, prisma } = setup(role);
    const result = await service.upload('owner', await photo(), true);
    expect(result).toMatchObject({ profileImageUrl: expect.stringMatching(/^https:\/\/images.example.test\/sellers\/owner\/.+\.jpg$/) });
    const update = role === 'chef' ? prisma.chefProfile.update : prisma.farmerProfile.update;
    expect(update).toHaveBeenCalledWith({
      where: { id: role }, data: result,
    });
    const uploaded = send.mock.calls[0][0].input;
    const metadata = await sharp(uploaded.Body).metadata();
    expect(metadata.format).toBe('jpeg');
    expect(metadata.width).toBe(640);
    expect(metadata.height).toBe(640);
    expect(metadata.exif).toBeUndefined();
  });

  it.each(['chef', 'farmer'])('publishes a %s gallery photo with a trimmed caption', async (role) => {
    const { service, prisma } = setup(role);
    await service.upload('owner', await photo(), false, ' My harvest ');
    const create = role === 'chef' ? prisma.chefFoodPhoto.create : prisma.farmerPhoto.create;
    expect(create).toHaveBeenCalledWith({ data: expect.objectContaining({ caption: 'My harvest', [`${role}Id`]: role }) });
  });

  it('rejects customers, inactive users and accounts without a seller profile', async () => {
    const { service, prisma } = setup('customer');
    await expect(service.gallery('customer')).rejects.toThrow('seller profile');
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.gallery('inactive')).rejects.toThrow('seller profile');
    expect(prisma.user.findUnique).toHaveBeenLastCalledWith(expect.objectContaining({ where: { id: 'inactive', isActive: true } }));
  });

  it('rejects oversized, corrupt and disguised image files before storage', async () => {
    const { service } = setup();
    await expect(service.upload('owner', undefined, true)).rejects.toThrow('JPEG or PNG');
    await expect(service.upload('owner', { ...await photo(), size: MAX_PHOTO_BYTES + 1 }, true)).rejects.toThrow('JPEG or PNG');
    await expect(service.upload('owner', { buffer: Buffer.from('<script>bad</script>'), size: 20, mimetype: 'image/jpeg' }, true)).rejects.toThrow('could not be read');
    expect(send).not.toHaveBeenCalled();
  });

  it('reports missing storage configuration instead of pretending an upload succeeded', async () => {
    const { service } = setup('chef', false);
    await expect(service.upload('owner', await photo(), true)).rejects.toThrow('not configured');
    expect(send).not.toHaveBeenCalled();
  });

  it('does not allow deletion of another seller photo', async () => {
    const { service, prisma } = setup('farmer');
    prisma.farmerPhoto.findFirst.mockResolvedValue(null);
    await expect(service.remove('owner', 'someone-elses-photo')).rejects.toThrow('Photo not found');
    expect(prisma.farmerPhoto.findFirst).toHaveBeenCalledWith({ where: { id: 'someone-elses-photo', farmerId: 'farmer' } });
    expect(send).not.toHaveBeenCalled();
  });

  it('removes an owned photo from storage and the gallery', async () => {
    const { service, prisma } = setup();
    prisma.chefFoodPhoto.findFirst.mockResolvedValue({
      id: 'photo', imageUrl: 'https://images.example.test/sellers/owner/example.jpg',
    });
    await service.remove('owner', 'photo');
    expect(send.mock.calls[0][0].input).toEqual({ Bucket: 'photos', Key: 'sellers/owner/example.jpg' });
    expect(prisma.chefFoodPhoto.delete).toHaveBeenCalledWith({ where: { id: 'photo' } });
  });

  it('cleans up the new object if the database attachment fails', async () => {
    const { service, prisma } = setup();
    prisma.chefProfile.update.mockRejectedValue(new Error('Database unavailable'));
    await expect(service.upload('owner', await photo(), true)).rejects.toThrow('Database unavailable');
    expect(send).toHaveBeenCalledTimes(2);
  });

  it.each(['chef', 'farmer'])('publishes an uploaded %s video with the correct storage and database types', async (role) => {
    const { service, prisma, videos } = setup(role);
    const file = { buffer: Buffer.from('video'), size: 5, mimetype: 'video/mp4' };
    const result = await service.uploadVideo('owner', file, ' Fresh food ');
    expect(videos.prepare).toHaveBeenCalledWith(file);
    expect(send.mock.calls[0][0].input).toMatchObject({
      Bucket: 'photos', Key: expect.stringMatching(/^sellers\/owner\/.+\.mp4$/),
      ContentType: 'video/mp4', Body: Buffer.from('processed-video'),
    });
    const create = role === 'chef' ? prisma.chefFoodPhoto.create : prisma.farmerPhoto.create;
    expect(create).toHaveBeenCalledWith({ data: {
      [`${role}Id`]: role, imageUrl: expect.stringMatching(/\.mp4$/), mediaType: 'video', caption: 'Fresh food',
    } });
    expect(result.mediaType).toBe('video');
  });

  it('does not process or publish videos for non-sellers', async () => {
    const { service, videos } = setup('customer');
    await expect(service.uploadVideo('customer', undefined)).rejects.toThrow('seller profile');
    expect(videos.prepare).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('does not store a video that fails processing', async () => {
    const { service, videos } = setup();
    videos.prepare.mockRejectedValue(new Error('Videos must be 60 seconds or shorter.'));
    await expect(service.uploadVideo('owner', undefined)).rejects.toThrow('60 seconds');
    expect(send).not.toHaveBeenCalled();
  });

  it('reports failed video storage without creating a gallery record', async () => {
    const { service, prisma } = setup();
    send.mockRejectedValueOnce(new Error('S3 unavailable'));
    await expect(service.uploadVideo('owner', undefined)).rejects.toThrow('Video storage is temporarily unavailable');
    expect(prisma.chefFoodPhoto.create).not.toHaveBeenCalled();
  });

  it('cleans up an uploaded video if saving its gallery record fails', async () => {
    const { service, prisma } = setup('farmer');
    prisma.farmerPhoto.create.mockRejectedValue(new Error('DB failed'));
    await expect(service.uploadVideo('owner', undefined)).rejects.toThrow('DB failed');
    expect(send.mock.calls[1][0].input).toEqual({
      Bucket: 'photos', Key: send.mock.calls[0][0].input.Key,
    });
  });

  it.each(['chef', 'farmer'])('lists %s images and videos together', async (role) => {
    const { service, prisma } = setup(role);
    await service.gallery('owner');
    const findMany = role === 'chef' ? prisma.chefFoodPhoto.findMany : prisma.farmerPhoto.findMany;
    expect(findMany).toHaveBeenCalledWith({
      where: { [`${role}Id`]: role }, orderBy: { createdAt: 'desc' },
    });
  });

  it.each(['chef', 'farmer'])('removes an owned %s video from storage and the gallery', async (role) => {
    const { service, prisma } = setup(role);
    const model = role === 'chef' ? prisma.chefFoodPhoto : prisma.farmerPhoto;
    model.findFirst.mockResolvedValue({
      id: 'clip', imageUrl: 'https://images.example.test/sellers/owner/clip.mp4', mediaType: 'video',
    });
    await service.remove('owner', 'clip');
    expect(model.findFirst).toHaveBeenCalledWith({ where: { id: 'clip', [`${role}Id`]: role } });
    expect(send.mock.calls[0][0].input.Key).toBe('sellers/owner/clip.mp4');
    expect(model.delete).toHaveBeenCalledWith({ where: { id: 'clip' } });
  });
});
