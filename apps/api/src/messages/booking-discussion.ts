import type { PrismaService } from '../prisma/prisma.service.js';

export async function hasBookingDiscussion(
  prisma: Pick<PrismaService, 'message'>,
  customerId: string,
  chefUserId: string,
) {
  const [customerMessages, chefMessages] = await Promise.all([
    prisma.message.count({ where: { senderId: customerId, recipientId: chefUserId } }),
    prisma.message.count({ where: { senderId: chefUserId, recipientId: customerId } }),
  ]);
  return customerMessages > 0 && chefMessages > 0;
}
