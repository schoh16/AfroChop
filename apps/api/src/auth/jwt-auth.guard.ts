import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { ALLOW_ROLE_SELECTION } from './role-selection.decorator.js';

export interface AuthenticatedRequest extends Request {
  user: { sub: string; role: UserRole };
}

function isUserRole(value: unknown): value is UserRole {
  return Object.values(UserRole).some((role) => role === value);
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector = new Reflector(),
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;
    const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];

    if (!token) {
      throw new UnauthorizedException('A bearer access token is required.');
    }

    let payload: { sub?: unknown; role?: unknown };
    try {
      payload = await this.jwtService.verifyAsync<{ sub?: unknown; role?: unknown }>(token);
    } catch {
      throw new UnauthorizedException('The access token is invalid or expired.');
    }

    if (typeof payload.sub !== 'string' || !isUserRole(payload.role)) {
      throw new UnauthorizedException('The access token is invalid or expired.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { isActive: true, role: true, roleSelectedAt: true },
    });
    if (!user?.isActive || user.role !== payload.role) {
      throw new UnauthorizedException('This account is inactive or its access has changed.');
    }

    if (user.role !== UserRole.admin && !user.roleSelectedAt &&
        !this.reflector.getAllAndOverride<boolean>(ALLOW_ROLE_SELECTION, [
          context.getHandler(), context.getClass(),
        ])) {
      throw new ForbiddenException('Choose how you will use AfroChop before continuing.');
    }

    request.user = { sub: payload.sub, role: user.role };
    return true;
  }
}
