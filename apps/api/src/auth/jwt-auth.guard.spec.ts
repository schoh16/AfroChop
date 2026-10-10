import { UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { JwtService } from '@nestjs/jwt';
import { UserRole } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';

describe('JwtAuthGuard', () => {
  const jwtService = {
    verifyAsync: vi.fn(),
  };
  const prisma = {
    user: {
      findUnique: vi.fn(),
    },
  };
  let guard: JwtAuthGuard;

  function context() {
    const request = { headers: { authorization: 'Bearer valid-token' } };
    const executionContext = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as ExecutionContext;
    return { executionContext, request };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    guard = new JwtAuthGuard(
      jwtService as unknown as JwtService,
      prisma as unknown as PrismaService,
    );
  });

  it('rejects a signed-in user whose account has been deactivated', async () => {
    jwtService.verifyAsync.mockResolvedValue({ sub: 'user-id', role: UserRole.customer });
    prisma.user.findUnique.mockResolvedValue({ isActive: false, role: UserRole.customer });
    const { executionContext } = context();

    await expect(guard.canActivate(executionContext)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a token after the account role changes', async () => {
    jwtService.verifyAsync.mockResolvedValue({ sub: 'user-id', role: UserRole.admin });
    prisma.user.findUnique.mockResolvedValue({ isActive: true, role: UserRole.customer });
    const { executionContext } = context();

    await expect(guard.canActivate(executionContext)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('sets request identity from the current active account', async () => {
    jwtService.verifyAsync.mockResolvedValue({ sub: 'user-id', role: UserRole.customer });
    prisma.user.findUnique.mockResolvedValue({ isActive: true, role: UserRole.customer });
    const { executionContext, request } = context();

    await expect(guard.canActivate(executionContext)).resolves.toBe(true);
    expect(request).toHaveProperty('user', { sub: 'user-id', role: UserRole.customer });
  });

  it('rejects malformed authorization roles before querying the database', async () => {
    jwtService.verifyAsync.mockResolvedValue({ sub: 'user-id', role: 'superuser' });
    const { executionContext } = context();

    await expect(guard.canActivate(executionContext)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
});
