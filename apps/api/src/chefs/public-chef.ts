import { Prisma } from '@prisma/client';

export const publicChefWhere = {
  isPublic: true,
  verificationStatus: { in: ['pending', 'approved'] },
  application: { status: 'profile_setup' },
  user: { isActive: true },
} satisfies Prisma.ChefProfileWhereInput;
