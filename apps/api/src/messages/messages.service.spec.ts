import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { MessagesService } from './messages.service.js';

function build(roles: Record<string, string>) {
  const prisma = {
    user: {
      findUnique: vi.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(roles[where.id] ? { id: where.id, role: roles[where.id] } : null),
      ),
    },
    message: { create: vi.fn((args: { data: unknown }) => Promise.resolve(args.data)) },
  };
  return { prisma, service: new MessagesService(prisma as never) };
}

describe('MessagesService.send', () => {
  it('allows a customer to message a chef', async () => {
    const { service, prisma } = build({ a: 'customer', b: 'chef' });
    await service.send('a', { recipientId: 'b', content: ' hi ' });
    expect(prisma.message.create).toHaveBeenCalledWith({
      data: { senderId: 'a', recipientId: 'b', content: 'hi' },
    });
  });
});

describe('MessagesService conversation booking eligibility', () => {
  it.each([
    [0, 0, false], [1, 0, false], [0, 1, false], [1, 1, true],
  ])('requires messages in both directions (%i, %i)', async (sent, received, expected) => {
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue({
        id: 'chef-id', name: 'Chef Amara', role: 'chef', chefProfile: null,
      }) },
      message: {
        findMany: vi.fn(),
        count: vi.fn().mockResolvedValueOnce(sent + received)
          .mockResolvedValueOnce(sent).mockResolvedValueOnce(received),
        updateMany: vi.fn(),
      },
      $transaction: vi.fn().mockResolvedValue([[], sent + received]),
    };
    const service = new MessagesService(prisma as never);
    const result = await service.conversation('customer-id', 'chef-id', 2, 1);
    expect(result.discussionComplete).toBe(expected);
    expect(prisma.message.count).toHaveBeenNthCalledWith(2, {
      where: { senderId: 'customer-id', recipientId: 'chef-id' },
    });
    expect(prisma.message.count).toHaveBeenNthCalledWith(3, {
      where: { senderId: 'chef-id', recipientId: 'customer-id' },
    });
  });
});

describe('MessagesService.send replies', () => {
  it('allows a chef to reply to a customer', async () => {
    const { service } = build({ a: 'chef', b: 'customer' });
    await expect(service.send('a', { recipientId: 'b', content: 'ok' })).resolves.toBeDefined();
  });

  it('rejects customer-to-customer messages', async () => {
    const { service } = build({ a: 'customer', b: 'customer' });
    await expect(service.send('a', { recipientId: 'b', content: 'x' })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
