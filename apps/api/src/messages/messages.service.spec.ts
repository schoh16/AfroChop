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
