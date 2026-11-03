import { describe, expect, it, vi } from 'vitest';
import { FarmersService } from './farmers.service.js';

describe('farmer public showcase', () => {
  it('returns galleries and profile pictures without exposing private account data', async () => {
    const prisma = { farmerProfile: { findFirst: vi.fn().mockResolvedValue({
      id: 'farm', farmName: 'Test farm', profileImageUrl: 'https://photos.example.test/profile.jpg',
      photos: [
        { id: 'photo', imageUrl: 'https://photos.example.test/okra.jpg', mediaType: 'image', caption: 'Fresh okra' },
        { id: 'clip', imageUrl: 'https://photos.example.test/okra.mp4', mediaType: 'video', caption: 'Harvest' },
      ],
    }) } };
    const service = new FarmersService(prisma as never);
    const result = await service.getPublicProfile('farm');
    expect(result.photos).toHaveLength(2);
    expect(result.photos[1].mediaType).toBe('video');
    const [args] = prisma.farmerProfile.findFirst.mock.calls[0];
    expect(args.where).toEqual({ id: 'farm', isPublic: true, user: { isActive: true } });
    expect(args.select).toHaveProperty('profileImageUrl', true);
    expect(args.select).toHaveProperty('photos');
    expect(args.select.photos.select.mediaType).toBe(true);
    expect(args.select).not.toHaveProperty('user');
    expect(args.select).not.toHaveProperty('email');
  });

  it('preserves an uploaded profile picture when saving other farm details', async () => {
    const prisma = { farmerProfile: { upsert: vi.fn() } };
    const service = new FarmersService(prisma as never);
    await service.saveProfile('user', { farmName: 'Test farm', city: 'Baltimore' });
    expect(prisma.farmerProfile.upsert.mock.calls[0][0].update).not.toHaveProperty('profileImageUrl');
  });
});
