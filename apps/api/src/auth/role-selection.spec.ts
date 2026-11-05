import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service.js';
import { RegisterRole } from './dto/register.dto.js';

function setup() {
  const account = { id: 'user-id', name: 'Test User', email: 'test@example.invalid', role: 'customer', isActive: true, roleSelectedAt: null as Date | null };
  const tx = {
    $queryRaw: vi.fn(),
    user: { findUnique: vi.fn().mockResolvedValue(account), update: vi.fn().mockImplementation(({ data }) => ({ ...account, ...data })) },
    chefProfile: { updateMany: vi.fn(), upsert: vi.fn() },
    farmerProfile: { updateMany: vi.fn(), upsert: vi.fn() },
    bookingRequest: { findFirst: vi.fn().mockResolvedValue(null) },
    farmInquiry: { findFirst: vi.fn().mockResolvedValue(null) },
    bookingPayment: { fields: { grossCents: {} }, findFirst: vi.fn().mockResolvedValue(null) },
  };
  const prisma = { $transaction: vi.fn().mockImplementation((callback) => callback(tx)) };
  return { account, tx, prisma, service: new AuthService(prisma as never, {} as never) };
}

describe('one-time role selection', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([RegisterRole.CUSTOMER, RegisterRole.CHEF, RegisterRole.FARMER])('saves %s once without replacing the Cognito identity token', async (role) => {
    const { service, tx } = setup();
    const result = await service.selectRole('user-id', role);
    expect(result).toMatchObject({ role, requiresRoleSelection: false });
    expect(result).not.toHaveProperty('token');
    expect(tx.user.update).toHaveBeenCalledWith({ where: { id: 'user-id' }, data: { role, roleSelectedAt: expect.any(Date) } });
    if (role === 'chef') expect(tx.chefProfile.upsert).toHaveBeenCalled();
    if (role === 'farmer') expect(tx.farmerProfile.upsert).toHaveBeenCalled();
  });

  it.each(['booking', 'inquiry', 'money'])('blocks changing roles for unresolved %s', async (kind) => {
    const { service, tx } = setup();
    const query = kind === 'booking' ? tx.bookingRequest : kind === 'inquiry' ? tx.farmInquiry : tx.bookingPayment;
    query.findFirst.mockResolvedValue({ id: 'open' });
    await expect(service.selectRole('user-id', RegisterRole.FARMER)).rejects.toThrow('Finish active');
    expect(tx.user.update).not.toHaveBeenCalled();
    expect(tx.chefProfile.updateMany).not.toHaveBeenCalled();
  });

  it('allows confirming the current role even with active work', async () => {
    const { service, tx } = setup();
    tx.bookingRequest.findFirst.mockResolvedValue({ id: 'active' });
    await expect(service.selectRole('user-id', RegisterRole.CUSTOMER)).resolves.toMatchObject({ role: 'customer' });
    expect(tx.bookingRequest.findFirst).not.toHaveBeenCalled();
  });

  it('hides old seller profiles without deleting records when changing roles', async () => {
    const { service, tx, account } = setup();
    account.role = 'chef';
    await service.selectRole('user-id', RegisterRole.FARMER);
    expect(tx.chefProfile.updateMany).toHaveBeenCalledWith({ where: { userId: 'user-id' }, data: { isPublic: false } });
    expect(tx.farmerProfile.updateMany).toHaveBeenCalledWith({ where: { userId: 'user-id' }, data: { isPublic: false } });
  });

  it('rejects a second role choice but safely confirms the same choice', async () => {
    const { service, account, tx } = setup();
    account.roleSelectedAt = new Date();
    await expect(service.selectRole('user-id', RegisterRole.CHEF)).rejects.toThrow('already been selected');
    await expect(service.selectRole('user-id', RegisterRole.CUSTOMER)).resolves.toMatchObject({ role: 'customer' });
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('rejects admin and deactivated accounts', async () => {
    const { service, account } = setup();
    account.role = 'admin';
    await expect(service.selectRole('user-id', RegisterRole.CUSTOMER)).rejects.toThrow('Administrator');
    account.isActive = false;
    await expect(service.selectRole('user-id', RegisterRole.CUSTOMER)).rejects.toThrow('inactive');
  });
});
