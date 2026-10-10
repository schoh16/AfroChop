import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { ChefsService } from './chefs.service.js';

describe('ChefsService profile setup', () => {
  const prisma = {
    country: {
      findUnique: vi.fn(),
    },
    chefProfile: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      upsert: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    chefMenuEntry: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    chefMenuTemplate: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  };
  let service: ChefsService;

  beforeEach(async () => {
    vi.clearAllMocks();
    prisma.chefProfile.findUnique.mockResolvedValue(null);
    prisma.chefProfile.upsert.mockResolvedValue({
      id: 'chef-profile-id',
      displayName: 'Chef Amara',
      countryCode: 'US',
    });
    prisma.$transaction.mockResolvedValue([[], 0]);
    const module = await Test.createTestingModule({
      providers: [
        ChefsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(ChefsService);
  });

  it('saves a chef profile without requiring Stripe payout setup', async () => {
    const profile = await service.saveProfile('chef-user-id', {
      displayName: 'Chef Amara',
      countryCode: 'us',
    });

    expect(profile.id).toBe('chef-profile-id');
    expect(prisma.chefProfile.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ countryCode: 'US' }),
      }),
    );
  });

  it('does not change the connected account country through profile editing', async () => {
    prisma.chefProfile.findUnique.mockResolvedValue({
      stripeConnectedAccount: { countryCode: 'US' },
    });

    await expect(
      service.saveProfile('chef-user-id', {
        displayName: 'Chef Amara',
        countryCode: 'CA',
      }),
    ).rejects.toThrow('cannot change countries');
    expect(prisma.chefProfile.upsert).not.toHaveBeenCalled();
  });

  it('matches a chef country specialty when filtering by that African country', async () => {
    prisma.country.findUnique.mockResolvedValue({ name: 'Nigeria' });

    await service.search({ countryId: 'country-id' });

    expect(prisma.chefProfile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            expect.objectContaining({
              OR: expect.arrayContaining([
                expect.objectContaining({
                  specialties: { has: 'Nigeria' },
                }),
              ]),
            }),
          ]),
        }),
      }),
    );
    const [searchArguments] = prisma.chefProfile.findMany.mock.calls[0];
    expect(searchArguments.select.chefDishes.select).not.toHaveProperty('price');
    expect(searchArguments.select).toHaveProperty('menuEntries');
  });

  it('creates a chef-owned menu entry without exposing or accepting a price', async () => {
    prisma.chefProfile.findUnique.mockResolvedValue({ id: 'chef-profile-id' });
    prisma.chefMenuEntry.create.mockResolvedValue({ id: 'entry-id', name: 'Jollof rice' });

    await service.createMenuEntry('chef-user-id', {
      name: ' Jollof rice ',
      knownIngredients: [' rice ', 'tomato'],
      majorAllergens: [],
      crossContactRisks: [],
    });

    expect(prisma.chefMenuEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          chefId: 'chef-profile-id',
          name: 'Jollof rice',
          knownIngredients: ['rice', 'tomato'],
        }),
      }),
    );
    expect(prisma.chefMenuEntry.create.mock.calls[0][0].data).not.toHaveProperty('price');
  });

  it('rejects a menu template containing another chef’s menu item', async () => {
    prisma.chefProfile.findUnique.mockResolvedValue({ id: 'chef-profile-id' });
    prisma.chefMenuEntry.findMany.mockResolvedValue([]);

    await expect(
      service.createMenuTemplate('chef-user-id', {
        name: 'Large party',
        serves: 20,
        menuEntryIds: ['another-chefs-entry'],
      }),
    ).rejects.toThrow('only include your own menu items');
    expect(prisma.chefMenuTemplate.create).not.toHaveBeenCalled();
  });

  it('returns saved menu templates on the public chef profile', async () => {
    prisma.chefProfile.findMany.mockResolvedValue([]);
    prisma.chefProfile.count.mockResolvedValue(0);
    prisma.chefProfile.findFirst.mockResolvedValue({
      id: 'chef-profile-id',
      menuEntries: [],
      menuTemplates: [],
    });

    await service.getPublicProfile('chef-profile-id');

    expect(prisma.chefProfile.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          menuTemplates: expect.objectContaining({
            select: expect.objectContaining({
              items: expect.any(Object),
            }),
          }),
        }),
      }),
    );
  });
});
