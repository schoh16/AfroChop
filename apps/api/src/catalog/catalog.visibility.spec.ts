import { describe, expect, it, vi } from 'vitest';
import { CatalogService } from './catalog.service.js';
import { ReviewsService } from '../reviews/reviews.service.js';
import { publicChefWhere } from '../chefs/public-chef.js';

describe('public chef visibility across discovery surfaces', () => {
  it('includes pending public chefs in location suggestions and highlights', async () => {
    const prisma = {
      chefServiceArea: { findMany: vi.fn().mockResolvedValue([]) },
      chefProfile: { findMany: vi.fn().mockResolvedValue([{ id: 'pending-chef' }]) },
    };
    const service = new CatalogService(prisma as never);
    await service.getServiceAreaStates('US');
    await service.getServiceAreaCities('US', 'MD');
    for (const [args] of prisma.chefServiceArea.findMany.mock.calls) {
      expect(args.where.chef).toEqual(publicChefWhere);
    }
    expect(await service.getChefHighlights()).toEqual([{ id: 'pending-chef' }]);
    expect(prisma.chefProfile.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: publicChefWhere }));
  });

  it('allows the reviews lookup for a newly public chef with no reviews', async () => {
    const prisma = {
      chefProfile: { findFirst: vi.fn().mockResolvedValue({ id: 'chef' }) },
      review: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
        aggregate: vi.fn().mockResolvedValue({ _avg: { rating: null } }),
      },
    };
    const service = new ReviewsService(prisma as never);
    await expect(service.listPublicReviews('chef', { page: 1, limit: 10 })).resolves.toMatchObject({ items: [], total: 0 });
    expect(prisma.chefProfile.findFirst).toHaveBeenCalledWith({
      where: { id: 'chef', ...publicChefWhere }, select: { id: true },
    });
  });

  it('keeps private, inactive, rejected and suspended profiles excluded', () => {
    expect(publicChefWhere.isPublic).toBe(true);
    expect(publicChefWhere.user.isActive).toBe(true);
    expect(publicChefWhere.verificationStatus.in).toEqual(['pending', 'approved']);
  });
});
