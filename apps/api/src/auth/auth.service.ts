import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import * as bcrypt from 'bcryptjs';
import { Prisma, UserRole } from '@prisma/client';
import type { RegisterRole } from './dto/register.dto.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    const verificationKey = this.config.get<string>('VERIFICATION_ENCRYPTION_KEY');
    if (!verificationKey || Buffer.from(verificationKey, 'base64').length !== 32) {
      throw new ServiceUnavailableException(
        'Account registration is temporarily unavailable because phone-number storage is not configured.',
      );
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (existingUser) {
      throw new UnauthorizedException('A user with this email already exists.');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email.toLowerCase(),
        passwordHash,
        role: UserRole.customer,
        smsOrderUpdates: dto.smsOrderUpdates ?? false,
        smsOrderUpdatesUpdatedAt: dto.smsOrderUpdates ? new Date() : null,
        marketingContactSharing: false,
        marketingCountryCode: null,
        marketingContactSharingUpdatedAt: null,
        verifications: {
          create: [
            { type: 'email', status: 'pending' },
            { type: 'phone', status: 'pending' },
          ],
        },
      },
    });

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      requiresRoleSelection: true,
      smsOrderUpdates: user.smsOrderUpdates,
      marketingContactSharing: user.marketingContactSharing,
      marketingCountryCode: user.marketingCountryCode,
      token: this.jwtService.sign({ sub: user.id, email: user.email, role: user.role }),
    };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      include: {
        chefProfile: { select: { countryCode: true } },
      },
    });

    if (!user?.isActive) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    const passwordMatches = await bcrypt.compare(dto.password, user.passwordHash);

    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      requiresRoleSelection: user.role !== UserRole.admin && !user.roleSelectedAt,
      smsOrderUpdates: user.smsOrderUpdates,
      marketingContactSharing: user.marketingContactSharing,
      marketingCountryCode: user.marketingCountryCode ?? user.chefProfile?.countryCode ?? null,
      token: this.jwtService.sign({ sub: user.id, email: user.email, role: user.role }),
    };
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
        } else if (role === UserRole.farmer) {
          await tx.farmerProfile.upsert({
            where: { userId }, create: { userId, farmName: account.name, isPublic: false }, update: {},
          });
        }
        return tx.user.update({ where: { id: userId }, data: { role, roleSelectedAt: new Date() } });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      return {
        id: user.id, name: user.name, email: user.email, role: user.role,
        requiresRoleSelection: false,
        token: this.jwtService.sign({ sub: user.id, email: user.email, role: user.role }),
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
