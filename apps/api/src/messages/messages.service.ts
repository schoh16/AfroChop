import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { SendMessageDto } from './dto/send-message.dto.js';

@Injectable()
export class MessagesService {
  constructor(private readonly prisma: PrismaService) {}

  async send(senderId: string, dto: SendMessageDto) {
    if (senderId === dto.recipientId) {
      throw new BadRequestException('You cannot message yourself.');
    }

    const recipient = await this.prisma.user.findUnique({
      where: { id: dto.recipientId, isActive: true },
      select: { id: true },
    });
    if (!recipient) throw new NotFoundException('Message recipient not found.');

    return this.prisma.message.create({
      data: {
        senderId,
        recipientId: recipient.id,
        content: dto.content.trim(),
      },
    });
  }

  async conversation(userId: string, otherUserId: string, page = 1, limit = 30) {
    const otherUser = await this.prisma.user.findUnique({
      where: { id: otherUserId, isActive: true },
      select: { id: true },
    });
    if (!otherUser) throw new NotFoundException('Conversation participant not found.');

    const where = {
      OR: [
        { senderId: userId, recipientId: otherUserId },
        { senderId: otherUserId, recipientId: userId },
      ],
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.message.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.message.count({ where }),
    ]);

    return { items: items.reverse(), page, limit, total };
  }
}
