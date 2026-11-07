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
      findUniqueOrThrow: vi.fn(),
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
      providers: [ChefsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(ChefsService);
  });

  it('rejects new grocery-shopping offerings without changing saved profiles', async () => {
    await expect(service.saveProfile('chef-user-id', {
      displayName: 'Chef Amara', serviceTypes: ['grocery_shopping'],
    })).rejects.toThrow('Grocery shopping services are no longer available.');
    expect(prisma.chefProfile.upsert).not.toHaveBeenCalled();
  });

  it('hides persisted grocery-shopping services in discovery and direct profiles', async () => {
    const chef = { id: 'chef-id', serviceTypes: ['prepared_meals', 'grocery_shopping'] };
    prisma.$transaction.mockResolvedValue([[chef], 1]);
    expect((await service.search({})).items[0].serviceTypes).toEqual(['prepared_meals']);
    prisma.chefProfile.findFirst.mockResolvedValue(chef);
    expect((await service.getPublicProfile('chef-id')).serviceTypes).toEqual(['prepared_meals']);
    expect(chef.serviceTypes).toEqual(['prepared_meals', 'grocery_shopping']);
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

  it('returns the chef profile with its service areas for workspace editing', async () => {
    prisma.chefProfile.findUnique.mockResolvedValueOnce({
      id: 'chef-profile-id',
    });
    prisma.chefProfile.findUniqueOrThrow.mockResolvedValue({
      id: 'chef-profile-id',
      displayName: 'Chef Amara',
      serviceAreas: [{ city: 'Brooklyn', state: 'NY', radiusKm: 25 }],
    });

    await expect(service.getMyProfile('chef-user-id')).resolves.toMatchObject({
      id: 'chef-profile-id',
      serviceAreas: [{ city: 'Brooklyn', state: 'NY', radiusKm: 25 }],
    });
    expect(prisma.chefProfile.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: 'chef-profile-id' },
      include: { serviceAreas: true },
    });
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
    expect(searchArguments.select.chefDishes.select).not.toHaveProperty(
      'price',
    );
    expect(searchArguments.select).toHaveProperty('menuEntries');
  });

  it('discovers only profiles published after application setup without exposing private identity', async () => {
    await service.search({});
    const [args] = prisma.chefProfile.findMany.mock.calls[0];
    expect(args.where).toMatchObject({
      isPublic: true,
      verificationStatus: { in: ['pending', 'approved'] },
      application: { status: 'profile_setup' },
      user: { isActive: true },
    });
    expect(args.select).not.toHaveProperty('user');
    expect(args.select).not.toHaveProperty('email');
    expect(prisma.chefProfile.count).toHaveBeenCalledWith({
      where: args.where,
    });
  });

  it('filters by an offered food name, not the cook name or biography', async () => {
    await service.search({ foodName: 'Jollof rice', city: 'Brooklyn' });
    const [args] = prisma.chefProfile.findMany.mock.calls[0];
    expect(args.where.AND).toEqual([{
      OR: [
        { chefDishes: { some: { dish: { name: { equals: 'Jollof rice', mode: 'insensitive' } } } } },
        { menuEntries: { some: { isAvailable: true, name: { equals: 'Jollof rice', mode: 'insensitive' } } } },
      ],
    }]);
    expect(args.where.serviceAreas.some.city).toEqual({ equals: 'Brooklyn', mode: 'insensitive' });
    expect(prisma.chefProfile.count).toHaveBeenCalledWith({ where: args.where });
  });

  it('requires the selected food itself to match the selected cuisine', async () => {
    prisma.country.findUnique.mockResolvedValue({ name: 'Nigeria' });
    await service.search({ foodName: 'Jollof rice', countryId: 'country-id' });
    const [args] = prisma.chefProfile.findMany.mock.calls[0];
    expect(args.where.AND[0]).toEqual({
      OR: [
        { chefDishes: { some: { dish: {
          name: { equals: 'Jollof rice', mode: 'insensitive' },
          dishCountries: { some: { countryId: 'country-id' } },
        } } } },
        { menuEntries: { some: {
          isAvailable: true, name: { equals: 'Jollof rice', mode: 'insensitive' }, cuisineCountryId: 'country-id',
        } } },
      ],
    });
  });

  it('does not add a food constraint when All foods is selected', async () => {
    await service.search({ foodName: '' });
    const [args] = prisma.chefProfile.findMany.mock.calls[0];
    expect(args.where).not.toHaveProperty('AND');
  });

  it.each([{ q: 'Jollof' }, { foodName: 'Jollof' }, { countryId: 'country-id' }])(
    'excludes unavailable menu items from discovery matches: %j',
    async (query) => {
      await service.search(query);
      const [args] = prisma.chefProfile.findMany.mock.calls[0];
      const constraints = args.where.AND as { OR: { menuEntries?: { some: object } }[] }[];
      const menuFilters = constraints.flatMap(({ OR }) => OR)
        .filter((filter) => filter.menuEntries).map((filter) => filter.menuEntries!.some);
      expect(menuFilters.length).toBeGreaterThan(0);
      for (const filter of menuFilters) expect(filter).toHaveProperty('isAvailable', true);
    },
  );

  it('uses the same visibility rules on direct profile links', async () => {
    prisma.chefProfile.findFirst.mockResolvedValue({ id: 'pending-chef', serviceTypes: [] });
    await service.getPublicProfile('pending-chef');
    expect(prisma.chefProfile.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'pending-chef',
          isPublic: true,
          verificationStatus: { in: ['pending', 'approved'] },
          application: { status: 'profile_setup' },
          user: { isActive: true },
        },
      }),
    );
  });

  it('does not return a profile excluded by the public visibility filter', async () => {
    prisma.chefProfile.findFirst.mockResolvedValue(null);
    await expect(service.getPublicProfile('hidden-chef')).rejects.toThrow(
      'Chef profile not found.',
    );
  });

  it('creates a chef-owned menu entry without exposing or accepting a price', async () => {
    prisma.chefProfile.findUnique.mockResolvedValue({ id: 'chef-profile-id' });
    prisma.chefMenuEntry.create.mockResolvedValue({
      id: 'entry-id',
      name: 'Jollof rice',
    });

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
    expect(
      prisma.chefMenuEntry.create.mock.calls[0][0].data,
    ).not.toHaveProperty('price');
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
      serviceTypes: [],
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
