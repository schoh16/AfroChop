import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { CognitoService } from './cognito.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { Prisma, UserRole } from '@prisma/client';
import type { RegisterRole } from './dto/register.dto.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cognito: CognitoService,
  ) {}

  async register(dto: RegisterDto) {
    if (dto.role === UserRole.farmer) throw new ForbiddenException('Grocery selling is no longer available. Choose customer or cook.');
    const email = dto.email.trim().toLowerCase();
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });
    if (existingUser && (!existingUser.isActive || existingUser.role === UserRole.admin || existingUser.cognitoSub)) {
      throw new ConflictException('This account cannot be registered again. Sign in, recover your password, or contact support.');
    }
    // Existing marketplace data is linked only after Cognito verifies email ownership.
    return this.cognito.register(email, dto.password, dto.name.trim());
  }

  async login(dto: LoginDto) {
    const tokens = await this.cognito.login(dto.email.trim().toLowerCase(), dto.password);
    const identity = await this.cognito.identity(tokens.token);
    const user = await this.linkIdentity(identity);
    return { ...await this.me(user.id), ...tokens };
  }

  private async linkIdentity(identity: { sub: string; email: string; name: string }) {
    try {
      const linked = await this.prisma.user.findUnique({ where: { cognitoSub: identity.sub } });
      if (linked) {
        if (!linked.isActive) throw new UnauthorizedException('This account is inactive.');
        return linked;
      }
      const existing = await this.prisma.user.findUnique({ where: { email: identity.email } });
      if (existing) {
        if (!existing.isActive || existing.role === UserRole.admin || existing.cognitoSub) {
          throw new UnauthorizedException('This identity cannot be linked automatically. Contact support.');
        }
        const result = await this.prisma.user.updateMany({
          where: { id: existing.id, cognitoSub: null, isActive: true, role: { not: UserRole.admin } },
          data: { cognitoSub: identity.sub, passwordHash: null },
        });
        if (result.count !== 1) throw new ConflictException('Account migration changed concurrently. Please sign in again.');
        return existing;
      }
      return await this.prisma.user.create({
        data: {
          email: identity.email, name: identity.name, cognitoSub: identity.sub,
          role: UserRole.customer, passwordHash: null,
          verifications: { create: [{ type: 'email', status: 'pending' }, { type: 'phone', status: 'pending' }] },
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Account setup changed concurrently. Please sign in again.');
      }
      throw error;
    }
  }

  async refresh(refreshToken: string) {
    const tokens = await this.cognito.refresh(refreshToken);
    const identity = await this.cognito.identity(tokens.token);
    const user = await this.prisma.user.findUnique({ where: { cognitoSub: identity.sub } });
    if (!user?.isActive) throw new UnauthorizedException('This account is inactive or not linked.');
    return { ...await this.me(user.id), ...tokens };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, role: true, isActive: true, roleSelectedAt: true },
    });
    if (!user?.isActive) throw new UnauthorizedException('This account is inactive.');
    return {
      id: user.id, name: user.name, email: user.email, role: user.role,
      requiresRoleSelection: user.role !== UserRole.admin && !user.roleSelectedAt,
    };
  }

  async selectRole(userId: string, role: RegisterRole) {
    if (role === UserRole.farmer) throw new ForbiddenException('Independent grocery selling is no longer available. Choose customer or cook.');
    try {
      const user = await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
        const account = await tx.user.findUnique({ where: { id: userId } });
        if (!account?.isActive) throw new UnauthorizedException('This account is inactive.');
        if (account.role === UserRole.admin) throw new ForbiddenException('Administrator accounts cannot select marketplace roles.');
        if (account.roleSelectedAt) {
          if (account.role !== role) throw new ConflictException('Your account role has already been selected. Contact support to change it.');
          return account;
        }
        if (account.role !== role) {
          const participant: Prisma.BookingRequestWhereInput = {
            OR: [{ customerId: userId }, { chef: { userId } }, {
              quotes: { some: { chef: { userId }, status: { in: ['pending', 'accepted'] } } },
            }],
          };
          const [booking, inquiry, money] = await Promise.all([
            tx.bookingRequest.findFirst({
              where: { AND: [participant, { status: { in: ['requested', 'quoted', 'awaiting_payment', 'confirmed', 'in_progress', 'disputed'] } }] },
              select: { id: true },
            }),
            tx.farmInquiry.findFirst({
              where: { OR: [{ customerId: userId }, { farmer: { userId } }], status: { in: ['requested', 'quoted'] } },
              select: { id: true },
            }),
            tx.bookingPayment.findFirst({
              where: {
                booking: participant,
                OR: [
                  { disputeOpen: true }, { lastError: { not: null } },
                  { refund: { status: { in: ['requested', 'approved'] } } },
                  { paidAt: { not: null }, payoutStatus: 'held', refundedCents: { lt: tx.bookingPayment.fields.grossCents } },
                ],
              },
              select: { id: true },
            }),
          ]);
          if (booking || inquiry || money) {
            throw new ConflictException('Finish active bookings, farm inquiries, and unresolved payments before changing roles. You can confirm your current role to continue.');
          }
          await tx.chefProfile.updateMany({ where: { userId }, data: { isPublic: false } });
          await tx.farmerProfile.updateMany({ where: { userId }, data: { isPublic: false } });
        }
        if (role === UserRole.chef) {
          await tx.chefProfile.upsert({
            where: { userId },
            create: { userId, displayName: account.name, languages: [], isPublic: false },
            update: {},
          });
        }
        return tx.user.update({ where: { id: userId }, data: { role, roleSelectedAt: new Date() } });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      return {
        id: user.id, name: user.name, email: user.email, role: user.role,
        requiresRoleSelection: false,
      };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
        throw new ConflictException('Your account was updated by another request. Please try selecting your role again.');
      }
      throw error;
    }
  }

  async updateNotificationPreferences(userId: string, smsOrderUpdates: boolean) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { phoneNumberEncrypted: true },
    });
    if (!user) throw new NotFoundException('User not found.');
    if (smsOrderUpdates && !user.phoneNumberEncrypted) {
      throw new BadRequestException('Add a phone number before enabling text updates.');
    }
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        smsOrderUpdates,
        smsOrderUpdatesUpdatedAt: new Date(),
      },
      select: { smsOrderUpdates: true, smsOrderUpdatesUpdatedAt: true },
    });
  }
}
