import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service.js';
import { RegisterRole } from './dto/register.dto.js';

function setup() {
  const account = {
    id: 'existing-id', name: 'Existing Cook', email: 'cook@example.test', role: 'chef',
    isActive: true, cognitoSub: null as string | null, roleSelectedAt: new Date(),
  };
  const prisma = {
    user: {
      findUnique: vi.fn(),
      create: vi.fn().mockImplementation(({ data }) => ({ id: 'new-id', ...data })),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const cognito = {
    register: vi.fn().mockResolvedValue({ requiresConfirmation: true }),
    login: vi.fn().mockResolvedValue({ token: 'access', refreshToken: 'refresh', expiresIn: 900 }),
    identity: vi.fn().mockResolvedValue({ sub: 'cognito-sub', email: account.email, name: 'Cognito Name' }),
    refresh: vi.fn().mockResolvedValue({ token: 'renewed', refreshToken: 'rotated', expiresIn: 900 }),
  };
  return { account, prisma, cognito, service: new AuthService(prisma as never, cognito as never) };
}

describe('Cognito account integration', () => {
  beforeEach(() => vi.clearAllMocks());

  it('registers with Cognito without saving passwords or creating an unverified local identity', async () => {
    const { service, prisma, cognito } = setup();
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.register({
      name: 'New User', email: 'NEW@example.test', password: 'Password123!', role: RegisterRole.CHEF,
    })).resolves.toEqual({ requiresConfirmation: true });
    expect(cognito.register).toHaveBeenCalledWith('new@example.test', 'Password123!', 'New User');
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('allows legacy customers and sellers to start email-verified migration without altering their records', async () => {
    const { service, account, prisma } = setup();
    prisma.user.findUnique.mockResolvedValue(account);
    await service.register({ name: 'Cook', email: account.email, password: 'NewPassword123!', role: RegisterRole.CHEF });
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });

  it.each(['admin', 'inactive', 'already-linked'])('does not re-register %s accounts', async (kind) => {
    const { service, account, prisma, cognito } = setup();
    prisma.user.findUnique.mockResolvedValue({
      ...account, role: kind === 'admin' ? 'admin' : 'chef',
      isActive: kind !== 'inactive', cognitoSub: kind === 'already-linked' ? 'bound-sub' : null,
    });
    await expect(service.register({
      name: 'Cook', email: account.email, password: 'Password123!', role: RegisterRole.CUSTOMER,
    })).rejects.toThrow('cannot be registered');
    expect(cognito.register).not.toHaveBeenCalled();
  });

  it('links a verified legacy cook to the same local id, preserving role and clearing the old hash', async () => {
    const { service, prisma, account } = setup();
    prisma.user.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(account).mockResolvedValueOnce(account);
    const result = await service.login({ email: account.email, password: 'Password123!' });
    expect(result).toMatchObject({ id: account.id, role: 'chef', requiresRoleSelection: false, token: 'access', refreshToken: 'refresh' });
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: account.id, cognitoSub: null, isActive: true, role: { not: 'admin' } },
      data: { cognitoSub: 'cognito-sub', passwordHash: null },
    });
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('never links data unless Cognito proves ownership of the email', async () => {
    const { service, prisma, cognito } = setup();
    cognito.identity.mockRejectedValue(new Error('Unverified email'));
    await expect(service.login({ email: 'someone@example.test', password: 'Password123!' })).rejects.toThrow('Unverified');
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it.each(['admin', 'inactive', 'bound'])('refuses automatic linking of %s legacy accounts', async (kind) => {
    const { service, prisma, account } = setup();
    prisma.user.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({
      ...account, role: kind === 'admin' ? 'admin' : 'chef', isActive: kind !== 'inactive',
      cognitoSub: kind === 'bound' ? 'different-sub' : null,
    });
    await expect(service.login({ email: account.email, password: 'Password123!' })).rejects.toThrow('cannot be linked');
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });

  it('creates new users as neutral customers, not using user-supplied role claims', async () => {
    const { service, prisma } = setup();
    prisma.user.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'new-id', role: 'customer', isActive: true, roleSelectedAt: null });
    await expect(service.login({ email: 'new@example.test', password: 'Password123!' }))
      .resolves.toMatchObject({ id: 'new-id', role: 'customer', requiresRoleSelection: true });
    expect(prisma.user.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      cognitoSub: 'cognito-sub', passwordHash: null, role: 'customer',
    }) });
  });

  it('handles a concurrent migration without overwriting an existing identity', async () => {
    const { service, prisma, account } = setup();
    prisma.user.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(account);
    prisma.user.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.login({ email: account.email, password: 'Password123!' })).rejects.toThrow('concurrently');
  });

  it('returns a rotated session with the current database role', async () => {
    const { service, prisma, account } = setup();
    prisma.user.findUnique.mockResolvedValue({ ...account, cognitoSub: 'cognito-sub' });
    await expect(service.refresh('old-refresh')).resolves.toMatchObject({
      id: account.id, role: 'chef', token: 'renewed', refreshToken: 'rotated',
    });
  });

  it('does not renew sessions for inactive or unlinked accounts', async () => {
    const { service, prisma } = setup();
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.refresh('refresh')).rejects.toThrow('inactive or not linked');
  });
});
