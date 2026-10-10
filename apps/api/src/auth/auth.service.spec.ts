import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuthService } from './auth.service.js';

describe('AuthService login', () => {
  const prisma = {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  };
  const jwtService = {
    sign: vi.fn(),
  };
  const configService = {
    get: vi.fn(),
  };
  let service: AuthService;

  beforeEach(() => {
    vi.clearAllMocks();
    configService.get.mockReturnValue(Buffer.alloc(32).toString('base64'));
    service = new AuthService(
      prisma as unknown as PrismaService,
      jwtService as unknown as JwtService,
      configService as unknown as ConfigService,
    );
  });

  it('does not authenticate an inactive account', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-id',
      isActive: false,
      passwordHash: 'hash',
    });

    await expect(service.login({
      email: 'inactive@example.com',
      password: 'Password123!',
    })).rejects.toBeInstanceOf(UnauthorizedException);
    expect(jwtService.sign).not.toHaveBeenCalled();
  });

  it('rejects registration before creating an account when phone encryption is not configured', async () => {
    configService.get.mockReturnValue(undefined);

    await expect(service.register({
      name: 'Test Customer',
      email: 'customer@example.com',
      password: 'Password123!',
      role: 'customer',
    })).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.user.create).not.toHaveBeenCalled();
  });
});
