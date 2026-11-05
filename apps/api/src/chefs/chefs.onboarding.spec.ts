import { describe, expect, it, vi } from 'vitest';
import { ChefsService } from './chefs.service.js';

function setup() {
  const tx = {
    user: {
      findUniqueOrThrow: vi
        .fn()
        .mockResolvedValue({ role: 'chef', name: 'Amina', isActive: true }),
    },
    dish: {
      findFirst: vi.fn().mockResolvedValue({
        name: 'Jollof Rice',
        dishCountries: [{ countryId: 'nigeria' }, { countryId: 'ghana' }],
      }),
    },
    country: { findUnique: vi.fn().mockResolvedValue({ id: 'cameroon' }) },
    chefProfile: {
      upsert: vi.fn().mockResolvedValue({ id: 'chef', displayName: 'Amina' }),
    },
    chefMenuEntry: {
      findMany: vi.fn().mockResolvedValue([]),
      createMany: vi.fn(),
    },
    $queryRaw: vi.fn(),
  };
  const prisma = {
    $transaction: vi.fn((fn: (client: typeof tx) => unknown) => fn(tx)),
  };
  return { tx, service: new ChefsService(prisma as never) };
}

describe('food-first chef onboarding', () => {
  it('creates a private draft profile and country-linked foods without prices or payouts', async () => {
    const { tx, service } = setup();
    await service.completeOnboarding('user', {
      foods: [{ dishId: 'dish', name: 'Jollof' }],
    });
    expect(tx.chefProfile.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: {
          userId: 'user',
          displayName: 'Amina',
          languages: [],
          isPublic: false,
        },
        update: {},
      }),
    );
    expect(tx.chefMenuEntry.createMany).toHaveBeenCalledWith({
      data: [
        { chefId: 'chef', name: 'Jollof Rice', cuisineCountryId: 'nigeria' },
        { chefId: 'chef', name: 'Jollof Rice', cuisineCountryId: 'ghana' },
      ],
    });
  });

  it('adds custom foods without overwriting existing dishes on retries', async () => {
    const { tx, service } = setup();
    tx.chefMenuEntry.findMany.mockResolvedValue([
      { name: 'Eru', cuisineCountryId: 'cameroon' },
    ] as never);
    await service.completeOnboarding('user', {
      foods: [
        { name: 'Eru', cuisineCountryId: 'cameroon' },
        { name: 'Family stew' },
        { name: 'Family stew' },
      ],
    });
    expect(tx.chefMenuEntry.createMany).toHaveBeenCalledWith({
      data: [{ chefId: 'chef', name: 'Family stew', cuisineCountryId: null }],
    });
  });

  it('rejects another role and unknown catalog foods', async () => {
    const { tx, service } = setup();
    tx.user.findUniqueOrThrow.mockResolvedValueOnce({
      role: 'customer',
      isActive: true,
    } as never);
    await expect(
      service.completeOnboarding('user', { foods: [{ name: 'Eru' }] }),
    ).rejects.toThrow('chef account');
    tx.dish.findFirst.mockResolvedValueOnce(null as never);
    await expect(
      service.completeOnboarding('user', {
        foods: [{ dishId: 'missing', name: 'Eru' }],
      }),
    ).rejects.toThrow('available food');
  });
});
