import {
  BadRequestException,
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
        role: dto.role,
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
      smsOrderUpdates: user.smsOrderUpdates,
      marketingContactSharing: user.marketingContactSharing,
      marketingCountryCode: user.marketingCountryCode ?? user.chefProfile?.countryCode ?? null,
      token: this.jwtService.sign({ sub: user.id, email: user.email, role: user.role }),
    };
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
