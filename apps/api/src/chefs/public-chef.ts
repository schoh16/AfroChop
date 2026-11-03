import { Prisma } from '@prisma/client';

export const publicChefWhere = {
  isPublic: true,
  verificationStatus: { in: ['pending', 'approved'] },
  user: { isActive: true },
} satisfies Prisma.ChefProfileWhereInput;
