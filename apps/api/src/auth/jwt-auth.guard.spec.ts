import { UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AllowRoleSelection } from './role-selection.decorator.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';

describe('JwtAuthGuard', () => {
  const cognito = {
    identity: vi.fn(),
  };
  const prisma = {
    user: {
      findUnique: vi.fn(),
    },
  };
  let guard: JwtAuthGuard;

  function context() {
    const request = { headers: { authorization: 'Bearer valid-token' } };
    const executionContext: ExecutionContext = {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => function protectedHandler() {},
      getClass: () => class ProtectedController {},
    } as never;
    return { executionContext, request };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    guard = new JwtAuthGuard(
      cognito as never,
      prisma as unknown as PrismaService,
    );
  });

  it('rejects a signed-in user whose account has been deactivated', async () => {
    cognito.identity.mockResolvedValue({ sub: 'cognito-id' });
    prisma.user.findUnique.mockResolvedValue({ isActive: false, role: UserRole.customer });
    const { executionContext } = context();

    await expect(guard.canActivate(executionContext)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('always uses the current database role, not provider or client role claims', async () => {
    cognito.identity.mockResolvedValue({ sub: 'cognito-id', role: UserRole.admin });
    prisma.user.findUnique.mockResolvedValue({ id: 'user-id', isActive: true, role: UserRole.customer, roleSelectedAt: new Date() });
    const { executionContext, request } = context();
    await expect(guard.canActivate(executionContext)).resolves.toBe(true);
    expect(request).toHaveProperty('user', { sub: 'user-id', role: UserRole.customer });
    expect(prisma.user.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { cognitoSub: 'cognito-id' } }));
  });

  it('sets request identity from the current active account', async () => {
    cognito.identity.mockResolvedValue({ sub: 'cognito-id' });
    prisma.user.findUnique.mockResolvedValue({ id: 'user-id', isActive: true, role: UserRole.customer, roleSelectedAt: new Date() });
    const { executionContext, request } = context();

    await expect(guard.canActivate(executionContext)).resolves.toBe(true);
    expect(request).toHaveProperty('user', { sub: 'user-id', role: UserRole.customer });
  });

  it('rejects invalid provider tokens before querying the database', async () => {
    cognito.identity.mockRejectedValue(new UnauthorizedException('Invalid token'));
    const { executionContext } = context();

    await expect(guard.canActivate(executionContext)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('blocks protected actions until a non-admin chooses their role', async () => {
    cognito.identity.mockResolvedValue({ sub: 'cognito-id' });
    prisma.user.findUnique.mockResolvedValue({ isActive: true, role: UserRole.customer, roleSelectedAt: null });
    await expect(guard.canActivate(context().executionContext)).rejects.toThrow('Choose how');
  });

  it('allows pending accounts to access explicitly marked onboarding routes', async () => {
    class SelectionController {
      @AllowRoleSelection()
      select(this: void) {}
    }
    cognito.identity.mockResolvedValue({ sub: 'cognito-id' });
    prisma.user.findUnique.mockResolvedValue({ isActive: true, role: UserRole.customer, roleSelectedAt: null });
    const { executionContext } = context();
    vi.spyOn(executionContext, 'getHandler').mockReturnValue(SelectionController.prototype.select);
    await expect(guard.canActivate(executionContext)).resolves.toBe(true);
  });

  it('does not force administrator accounts into marketplace role selection', async () => {
    cognito.identity.mockResolvedValue({ sub: 'cognito-admin' });
    prisma.user.findUnique.mockResolvedValue({ isActive: true, role: UserRole.admin, roleSelectedAt: null });
    await expect(guard.canActivate(context().executionContext)).resolves.toBe(true);
  });
});
