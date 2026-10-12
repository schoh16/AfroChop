import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { SendMessageDto } from './dto/send-message.dto.js';

const participantSelect = {
  id: true,
  name: true,
  role: true,
  chefProfile: { select: { displayName: true, profileImageUrl: true } },
} as const;

type Participant = {
  id: string;
  name: string;
  role: UserRole;
  chefProfile: { displayName: string; profileImageUrl: string | null } | null;
};

@Injectable()
export class MessagesService {
  constructor(private readonly prisma: PrismaService) {}

  async send(senderId: string, dto: SendMessageDto) {
    if (senderId === dto.recipientId) {
      throw new BadRequestException('You cannot message yourself.');
    }

    const [sender, recipient] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: senderId, isActive: true },
        select: { id: true, role: true },
      }),
      this.prisma.user.findUnique({
        where: { id: dto.recipientId, isActive: true },
        select: { id: true, role: true },
      }),
    ]);
    if (!recipient) throw new NotFoundException('Message recipient not found.');
    if (!sender || !this.canMessage(sender.role, recipient.role)) {
      throw new ForbiddenException('Messages can only be exchanged between customers and cooks.');
    }

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
      select: participantSelect,
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

    await this.prisma.message.updateMany({
      where: { senderId: otherUserId, recipientId: userId, readAt: null },
      data: { readAt: new Date() },
    });

    return {
      participant: this.describeParticipant(otherUser),
      items: items.reverse(),
      page,
      limit,
      total,
    };
  }

  async listConversations(userId: string) {
    const messages = await this.prisma.message.findMany({
      where: { OR: [{ senderId: userId }, { recipientId: userId }] },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });

    const conversations = new Map<
      string,
      { lastMessage: (typeof messages)[number]; unreadCount: number }
    >();
    for (const message of messages) {
      const otherId = message.senderId === userId ? message.recipientId : message.senderId;
      const entry = conversations.get(otherId) ?? { lastMessage: message, unreadCount: 0 };
      if (message.recipientId === userId && !message.readAt) entry.unreadCount += 1;
      conversations.set(otherId, entry);
    }
    if (conversations.size === 0) return [];

    const participants = await this.prisma.user.findMany({
      where: { id: { in: [...conversations.keys()] }, isActive: true },
      select: participantSelect,
    });

    return participants
      .map((participant) => ({
        participant: this.describeParticipant(participant),
        ...conversations.get(participant.id)!,
      }))
      .sort((a, b) => b.lastMessage.createdAt.getTime() - a.lastMessage.createdAt.getTime());
  }

  async unreadCount(userId: string) {
    const count = await this.prisma.message.count({
      where: { recipientId: userId, readAt: null },
    });
    return { count };
  }

  private canMessage(senderRole: UserRole, recipientRole: UserRole) {
    return (
      (senderRole === UserRole.customer && recipientRole === UserRole.chef) ||
      (senderRole === UserRole.chef && recipientRole === UserRole.customer)
    );
  }

  private describeParticipant(user: Participant) {
    return {
      id: user.id,
      role: user.role,
      name: user.chefProfile?.displayName ?? user.name,
      profileImageUrl: user.chefProfile?.profileImageUrl ?? null,
    };
  }
}
