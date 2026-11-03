import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuthService } from './auth.service.js';
import * as bcrypt from 'bcryptjs';

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

  it('creates a neutral pending account even if an old client supplies a seller role', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockImplementation(({ data }) => ({ id: 'new-user', ...data }));
    const result = await service.register({
      name: 'New User', email: 'USER@example.com', password: 'Password123!', role: 'chef',
    });
    expect(result).toMatchObject({ role: 'customer', requiresRoleSelection: true });
    expect(prisma.user.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ email: 'user@example.com', role: 'customer' }),
    }));
  });

  it.each(['customer', 'chef', 'farmer'] as const)('uses the same login for %s accounts and reports pending selection', async (role) => {
    const passwordHash = await bcrypt.hash('Password123!', 4);
    const user = { id: 'user-id', name: 'Test User', email: 'user@example.com', role, isActive: true, passwordHash, roleSelectedAt: null };
    prisma.user.findUnique.mockResolvedValue(user);
    await expect(service.login({ email: user.email, password: 'Password123!' }))
      .resolves.toMatchObject({ role, requiresRoleSelection: true });
    prisma.user.findUnique.mockResolvedValue({ ...user, roleSelectedAt: new Date() });
    await expect(service.login({ email: user.email, password: 'Password123!' }))
      .resolves.toMatchObject({ role, requiresRoleSelection: false });
  });
});
