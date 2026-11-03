import { UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { JwtService } from '@nestjs/jwt';
import { UserRole } from '@prisma/client';
import { AllowRoleSelection } from './role-selection.decorator.js';
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
      getHandler: () => function protectedHandler() {},
      getClass: () => class ProtectedController {},
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
    prisma.user.findUnique.mockResolvedValue({ isActive: true, role: UserRole.customer, roleSelectedAt: new Date() });
    const { executionContext } = context();

    await expect(guard.canActivate(executionContext)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('sets request identity from the current active account', async () => {
    jwtService.verifyAsync.mockResolvedValue({ sub: 'user-id', role: UserRole.customer });
    prisma.user.findUnique.mockResolvedValue({ isActive: true, role: UserRole.customer, roleSelectedAt: new Date() });
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

  it('blocks protected actions until a non-admin chooses their role', async () => {
    jwtService.verifyAsync.mockResolvedValue({ sub: 'user-id', role: UserRole.customer });
    prisma.user.findUnique.mockResolvedValue({ isActive: true, role: UserRole.customer, roleSelectedAt: null });
    await expect(guard.canActivate(context().executionContext)).rejects.toThrow('Choose how');
  });

  it('allows pending accounts to access explicitly marked onboarding routes', async () => {
    class SelectionController {
      @AllowRoleSelection()
      select(this: void) {}
    }
    jwtService.verifyAsync.mockResolvedValue({ sub: 'user-id', role: UserRole.customer });
    prisma.user.findUnique.mockResolvedValue({ isActive: true, role: UserRole.customer, roleSelectedAt: null });
    const { executionContext } = context();
    vi.spyOn(executionContext, 'getHandler').mockReturnValue(SelectionController.prototype.select);
    await expect(guard.canActivate(executionContext)).resolves.toBe(true);
  });

  it('does not force administrator accounts into marketplace role selection', async () => {
    jwtService.verifyAsync.mockResolvedValue({ sub: 'admin', role: UserRole.admin });
    prisma.user.findUnique.mockResolvedValue({ isActive: true, role: UserRole.admin, roleSelectedAt: null });
    await expect(guard.canActivate(context().executionContext)).resolves.toBe(true);
  });
});
