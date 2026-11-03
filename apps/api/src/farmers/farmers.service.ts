import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  FarmInquiryDto,
  FarmProduceDto,
  FarmQuoteDto,
  FarmerProfileDto,
  FarmerSearchDto,
} from './dto/farmer.dto.js';

const publicFarmerSelect = {
  id: true,
  userId: true,
  farmName: true,
  bio: true,
  city: true,
  state: true,
  countryCode: true,
  offersPickup: true,
  offersDelivery: true,
  profileImageUrl: true,
  photos: {
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: { id: true, imageUrl: true, mediaType: true, caption: true },
  },
  produce: {
    where: { isAvailable: true },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      category: true,
      description: true,
      price: true,
      unit: true,
      imageUrl: true,
    },
  },
} satisfies Prisma.FarmerProfileSelect;

@Injectable()
export class FarmersService {
  constructor(private readonly prisma: PrismaService) {}

  async search(query: FarmerSearchDto) {
    const q = query.q?.trim();
    const where: Prisma.FarmerProfileWhereInput = {
      isPublic: true,
      user: { isActive: true },
      ...(query.city?.trim()
        ? { city: { contains: query.city.trim(), mode: 'insensitive' } }
        : {}),
      ...(query.state?.trim()
        ? { state: { equals: query.state.trim(), mode: 'insensitive' } }
        : {}),
      ...(q
        ? {
            OR: [
              { farmName: { contains: q, mode: 'insensitive' } },
              { produce: { some: { isAvailable: true, name: { contains: q, mode: 'insensitive' } } } },
            ],
          }
        : {}),
    };
    const items = await this.prisma.farmerProfile.findMany({
      where,
      select: publicFarmerSelect,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return { items };
  }

  async getPublicProfile(id: string) {
    const farmer = await this.prisma.farmerProfile.findFirst({
      where: { id, isPublic: true, user: { isActive: true } },
      select: publicFarmerSelect,
    });
    if (!farmer) throw new NotFoundException('Farmer not found.');
    return farmer;
  }

  saveProfile(userId: string, dto: FarmerProfileDto) {
    const data = {
      isPublic: true,
      farmName: dto.farmName.trim(),
      bio: dto.bio?.trim() || null,
      city: dto.city.trim(),
      state: dto.state?.trim() || null,
      countryCode: dto.countryCode?.trim().toUpperCase() || null,
      offersPickup: dto.offersPickup ?? true,
      offersDelivery: dto.offersDelivery ?? false,
      ...(dto.profileImageUrl !== undefined ? { profileImageUrl: dto.profileImageUrl } : {}),
    };
    return this.prisma.farmerProfile.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
  }

  async getMyProfile(userId: string) {
    const farmer = await this.prisma.farmerProfile.findUnique({
      where: { userId },
      include: { produce: { orderBy: { createdAt: 'desc' } }, photos: { orderBy: { createdAt: 'desc' } } },
    });
    if (!farmer) throw new NotFoundException('Create your farm profile first.');
    return farmer;
  }

  async addProduce(userId: string, dto: FarmProduceDto) {
    const farmer = await this.requireFarmer(userId);
    return this.prisma.farmProduce.create({
      data: {
        farmerId: farmer.id,
        name: dto.name.trim(),
        category: dto.category ?? 'vegetable',
        description: dto.description?.trim() || null,
        price: dto.price ?? null,
        unit: dto.unit?.trim() || null,
        isAvailable: dto.isAvailable ?? true,
        imageUrl: dto.imageUrl ?? null,
      },
    });
  }

  async updateProduce(userId: string, produceId: string, dto: FarmProduceDto) {
    const farmer = await this.requireFarmer(userId);
    const existing = await this.prisma.farmProduce.findFirst({
      where: { id: produceId, farmerId: farmer.id },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Produce item not found.');
    return this.prisma.farmProduce.update({
      where: { id: produceId },
      data: {
        name: dto.name.trim(),
        category: dto.category,
        description: dto.description?.trim() || null,
        price: dto.price ?? null,
        unit: dto.unit?.trim() || null,
        isAvailable: dto.isAvailable,
        imageUrl: dto.imageUrl ?? null,
      },
    });
  }

  async deleteProduce(userId: string, produceId: string) {
    const farmer = await this.requireFarmer(userId);
    const result = await this.prisma.farmProduce.deleteMany({
      where: { id: produceId, farmerId: farmer.id },
    });
    if (result.count === 0) throw new NotFoundException('Produce item not found.');
    return { deleted: true };
  }

  async createInquiry(customerId: string, dto: FarmInquiryDto) {
    const farmer = await this.prisma.farmerProfile.findFirst({
      where: { id: dto.farmerId, isPublic: true },
      select: { id: true },
    });
    if (!farmer) throw new NotFoundException('Farmer not found.');
    return this.prisma.farmInquiry.create({
      data: {
        customerId,
        farmerId: farmer.id,
        produceName: dto.produceName?.trim() || null,
        quantity: dto.quantity?.trim() || null,
        message: dto.message.trim(),
      },
    });
  }

  listCustomerInquiries(customerId: string) {
    return this.prisma.farmInquiry.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      include: { farmer: { select: { id: true, userId: true, farmName: true, city: true, state: true } } },
    });
  }

  async listFarmerInquiries(userId: string) {
    const farmer = await this.requireFarmer(userId);
    return this.prisma.farmInquiry.findMany({
      where: { farmerId: farmer.id },
      orderBy: { createdAt: 'desc' },
      include: { customer: { select: { id: true, name: true } } },
    });
  }

  async quoteInquiry(userId: string, inquiryId: string, dto: FarmQuoteDto) {
    const farmer = await this.requireFarmer(userId);
    const inquiry = await this.prisma.farmInquiry.findUnique({
      where: { id: inquiryId },
      select: { farmerId: true, status: true },
    });
    if (!inquiry) throw new NotFoundException('Inquiry not found.');
    if (inquiry.farmerId !== farmer.id) {
      throw new ForbiddenException('You cannot quote another farmer’s inquiry.');
    }
    if (inquiry.status === 'closed' || inquiry.status === 'declined') {
      throw new BadRequestException('This inquiry is no longer accepting quotes.');
    }
    return this.prisma.farmInquiry.update({
      where: { id: inquiryId },
      data: {
        status: 'quoted',
        quoteAmount: dto.amount,
        quoteNotes: dto.notes?.trim() || null,
        quotedAt: new Date(),
      },
    });
  }

  async declineInquiry(userId: string, inquiryId: string) {
    const farmer = await this.requireFarmer(userId);
    const result = await this.prisma.farmInquiry.updateMany({
      where: { id: inquiryId, farmerId: farmer.id, status: 'requested' },
      data: { status: 'declined' },
    });
    if (result.count === 0) throw new NotFoundException('Open inquiry not found.');
    return { declined: true };
  }

  private async requireFarmer(userId: string) {
    const farmer = await this.prisma.farmerProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!farmer) throw new ForbiddenException('Create your farm profile first.');
    return farmer;
  }
}