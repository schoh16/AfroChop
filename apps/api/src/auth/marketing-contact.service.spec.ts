import type { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { MarketingContactService } from './marketing-contact.service.js';

describe('MarketingContactService regional sharing policy', () => {
  const prisma = {
    user: {
      update: vi.fn(),
      findUnique: vi.fn(),
    },
  };
  const config = {
    get: vi.fn(),
  };
  let service: MarketingContactService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.user.update.mockResolvedValue({ id: 'user-id' });
    config.get.mockReturnValue(undefined);
    service = new MarketingContactService(
      prisma as unknown as PrismaService,
      config as unknown as ConfigService,
    );
  });

  it('requires an explicit opt-in before sharing Canadian contacts', async () => {
    await service.setPreference('user-id', 'CA', true, false);

    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        marketingContactSharing: false,
        marketingCountryCode: 'CA',
      }),
    }));
  });

  it.each(['AM', 'AZ', 'GE', 'KZ'])(
    'requires explicit opt-in for the supported regional market %s',
    async (countryCode) => {
      await service.setPreference('user-id', countryCode, true, false);

      expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          marketingContactSharing: false,
          marketingCountryCode: countryCode,
        }),
      }));
    },
  );

  it('allows Canadian sharing after explicit opt-in', async () => {
    const result = await service.setPreference('user-id', 'CA', true, true);

    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ marketingContactSharing: true }),
    }));
    expect(result).toEqual({ marketingContactSharing: true, exportStatus: 'not_configured' });
  });

  it('uses opt-out as the default policy for the United States', async () => {
    await service.setPreference('user-id', 'US', true, false);

    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ marketingContactSharing: true }),
    }));
  });

  it('rejects country codes outside the supported locations', async () => {
    await expect(service.setPreference('user-id', 'NG', true, true)).rejects.toThrow(
      'Choose a supported country',
    );
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
