import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CognitoService } from './cognito.service.js';
import { Request } from 'express';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { ALLOW_ROLE_SELECTION } from './role-selection.decorator.js';

export interface AuthenticatedRequest extends Request {
  user: { sub: string; role: UserRole };
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly cognito: CognitoService,
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

    const identity = await this.cognito.identity(token);
    const user = await this.prisma.user.findUnique({
      where: { cognitoSub: identity.sub },
      select: { id: true, isActive: true, role: true, roleSelectedAt: true },
    });
    if (!user?.isActive) {
      throw new UnauthorizedException('This account is inactive or its access has changed.');
    }

    if (user.role !== UserRole.admin && !user.roleSelectedAt &&
        !this.reflector.getAllAndOverride<boolean>(ALLOW_ROLE_SELECTION, [
          context.getHandler(), context.getClass(),
        ])) {
      throw new ForbiddenException('Choose how you will use AfroChop before continuing.');
    }

    request.user = { sub: user.id, role: user.role };
    return true;
  }
}
