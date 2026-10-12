import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ServiceType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { ChefSearchDto } from './dto/chef-search.dto.js';
import {
  ChefAvailabilityListDto,
  ChefMenuItemDto,
  ChefPermitDto,
  ChefProfileDto,
  ChefSocialLinksDto,
  ChefServiceAreasDto,
  FoodPhotoDto,
} from './dto/chef-profile.dto.js';
import { ChefMenuEntryDto, ChefMenuTemplateDto } from './dto/chef-menu.dto.js';

@Injectable()
export class ChefsService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async saveProfile(userId: string, dto: ChefProfileDto) {
    const existingProfile = await this.prisma.chefProfile.findUnique({
      where: { userId },
      select: {
        stripeConnectedAccount: { select: { countryCode: true } },
      },
    });
    const requestedCountryCode = dto.countryCode?.trim().toUpperCase();
    const connectedCountryCode =
      existingProfile?.stripeConnectedAccount?.countryCode;
    if (
      connectedCountryCode &&
      requestedCountryCode !== connectedCountryCode
    ) {
      throw new BadRequestException(
        'A connected Stripe account cannot change countries. Contact support for payout account changes.',
      );
    }

    const profile = await this.prisma.chefProfile.upsert({
      where: { userId },
      create: {
        userId,
        displayName: dto.displayName,
        bio: dto.bio,
        city: dto.city,
        state: dto.state,
        countryCode: requestedCountryCode,
        specialties: dto.specialties ?? [],
        languages: dto.languages ?? [],
        serviceTypes: dto.serviceTypes ?? [],
        serviceRadiusKm: dto.serviceRadiusKm,
        profileImageUrl: dto.profileImageUrl,
        coverImageUrl: dto.coverImageUrl,
        isPublic: true,
      },
      update: {
        displayName: dto.displayName,
        bio: dto.bio,
        city: dto.city,
        state: dto.state,
        countryCode: requestedCountryCode,
        specialties: dto.specialties ?? [],
        languages: dto.languages ?? [],
        serviceTypes: dto.serviceTypes ?? [],
        serviceRadiusKm: dto.serviceRadiusKm,
        profileImageUrl: dto.profileImageUrl,
        coverImageUrl: dto.coverImageUrl,
      },
    });
    return profile;
  }

  async getMyProfile(userId: string) {
    const chef = await this.findChefByUserId(userId);
    return this.prisma.chefProfile.findUniqueOrThrow({
      where: { id: chef.id },
      include: { serviceAreas: true },
    });
  }

  async getMyMenu(userId: string) {
    const chef = await this.findChefByUserId(userId);
    return this.prisma.chefMenuEntry.findMany({
      where: { chefId: chef.id },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: {
        cuisineCountry: { select: { id: true, name: true, flag: true } },
      },
    });
  }

  async createMenuEntry(userId: string, dto: ChefMenuEntryDto) {
    const chef = await this.findChefByUserId(userId);
    await this.ensureCuisineCountry(dto.cuisineCountryId);
    return this.prisma.chefMenuEntry.create({
      data: {
        chefId: chef.id,
        name: dto.name.trim(),
        description: dto.description?.trim(),
        cuisineCountryId: dto.cuisineCountryId,
        knownIngredients: dto.knownIngredients.map((item) => item.trim()).filter(Boolean),
        majorAllergens: dto.majorAllergens,
        crossContactRisks: dto.crossContactRisks.map((risk) => risk.trim()).filter(Boolean),
      },
      include: {
        cuisineCountry: { select: { id: true, name: true, flag: true } },
      },
    });
  }

  async updateMenuEntry(userId: string, entryId: string, dto: ChefMenuEntryDto) {
    const chef = await this.findChefByUserId(userId);
    await this.ensureCuisineCountry(dto.cuisineCountryId);
    const updated = await this.prisma.chefMenuEntry.updateMany({
      where: { id: entryId, chefId: chef.id },
      data: {
        name: dto.name.trim(),
        description: dto.description?.trim(),
        cuisineCountryId: dto.cuisineCountryId,
        knownIngredients: dto.knownIngredients.map((item) => item.trim()).filter(Boolean),
        majorAllergens: dto.majorAllergens,
        crossContactRisks: dto.crossContactRisks.map((risk) => risk.trim()).filter(Boolean),
      },
    });
    if (updated.count === 0) throw new NotFoundException('Menu item not found.');
    return this.prisma.chefMenuEntry.findUnique({
      where: { id: entryId },
      include: { cuisineCountry: { select: { id: true, name: true, flag: true } } },
    });
  }

  async deleteMenuEntry(userId: string, entryId: string) {
    const chef = await this.findChefByUserId(userId);
    const deleted = await this.prisma.chefMenuEntry.deleteMany({
      where: { id: entryId, chefId: chef.id },
    });
    if (deleted.count === 0) throw new NotFoundException('Menu item not found.');
    return { deleted: true };
  }

  async getMyMenuTemplates(userId: string) {
    const chef = await this.findChefByUserId(userId);
    return this.prisma.chefMenuTemplate.findMany({
      where: { chefId: chef.id },
      orderBy: { createdAt: 'desc' },
      include: {
        items: {
          orderBy: { sortOrder: 'asc' },
          include: { menuEntry: true },
        },
      },
    });
  }

  async createMenuTemplate(userId: string, dto: ChefMenuTemplateDto) {
    const chef = await this.findChefByUserId(userId);
    const uniqueEntryIds = [...new Set(dto.menuEntryIds)];
    if (uniqueEntryIds.length !== dto.menuEntryIds.length) {
      throw new BadRequestException('A menu template cannot include the same menu item twice.');
    }
    const entries = await this.prisma.chefMenuEntry.findMany({
      where: { chefId: chef.id, id: { in: uniqueEntryIds } },
      select: { id: true },
    });
    if (entries.length !== uniqueEntryIds.length) {
      throw new BadRequestException('Templates can only include your own menu items.');
    }
    return this.prisma.chefMenuTemplate.create({
      data: {
        chefId: chef.id,
        name: dto.name.trim(),
        description: dto.description?.trim(),
        serves: dto.serves,
        items: {
          create: uniqueEntryIds.map((menuEntryId, sortOrder) => ({
            menuEntryId,
            sortOrder,
          })),
        },
      },
      include: {
        items: {
          orderBy: { sortOrder: 'asc' },
          include: { menuEntry: true },
        },
      },
    });
  }

  async deleteMenuTemplate(userId: string, templateId: string) {
    const chef = await this.findChefByUserId(userId);
    const deleted = await this.prisma.chefMenuTemplate.deleteMany({
      where: { id: templateId, chefId: chef.id },
    });
    if (deleted.count === 0) throw new NotFoundException('Menu template not found.');
    return { deleted: true };
  }

  async getMySocialLinks(userId: string) {
    const chef = await this.findChefByUserId(userId);
    return this.prisma.chefProfile.findUniqueOrThrow({
      where: { id: chef.id },
      select: {
        instagramUrl: true,
        tiktokUrl: true,
        youtubeUrl: true,
        facebookUrl: true,
      },
    });
  }

  async updateMySocialLinks(userId: string, dto: ChefSocialLinksDto) {
    const chef = await this.findChefByUserId(userId);
    return this.prisma.chefProfile.update({
      where: { id: chef.id },
      data: {
        instagramUrl: dto.instagramUrl,
        tiktokUrl: dto.tiktokUrl,
        youtubeUrl: dto.youtubeUrl,
        facebookUrl: dto.facebookUrl,
      },
      select: {
        instagramUrl: true,
        tiktokUrl: true,
        youtubeUrl: true,
        facebookUrl: true,
      },
    });
  }

  private async ensureCuisineCountry(countryId?: string) {
    if (!countryId) return;
    const country = await this.prisma.country.findUnique({
      where: { id: countryId },
      select: { id: true },
    });
    if (!country) throw new BadRequestException('Choose a country from the cuisine list.');
  }

  async addFoodPhoto(userId: string, dto: FoodPhotoDto) {
    const chef = await this.findChefByUserId(userId);
    return this.prisma.chefFoodPhoto.create({
      data: {
        chefId: chef.id,
        imageUrl: dto.imageUrl,
        mediaType: dto.mediaType ?? 'image',
        caption: dto.caption,
      },
    });
  }

  async saveMenuItem(userId: string, dto: ChefMenuItemDto) {
    const chef = await this.findChefByUserId(userId);
    const dish = await this.prisma.dish.findFirst({
      where: { id: dto.dishId, isApproved: true },
      select: { id: true },
    });

    if (!dish) {
      throw new NotFoundException('Approved catalog dish not found.');
    }

    return this.prisma.chefDish.upsert({
      where: { chefId_dishId: { chefId: chef.id, dishId: dish.id } },
      create: {
        chefId: chef.id,
        dishId: dish.id,
        price: dto.price,
        description: dto.description,
        knownIngredients: dto.knownIngredients,
        majorAllergens: dto.majorAllergens,
        crossContactRisks: dto.crossContactRisks,
        portionSize: dto.portionSize,
        leadTimeHours: dto.leadTimeHours ?? 24,
      },
      update: {
        price: dto.price,
        description: dto.description,
        knownIngredients: dto.knownIngredients,
        majorAllergens: dto.majorAllergens,
        crossContactRisks: dto.crossContactRisks,
        portionSize: dto.portionSize,
        leadTimeHours: dto.leadTimeHours ?? 24,
      },
      include: { dish: { select: { id: true, name: true } } },
    });
  }

  async saveAvailability(userId: string, dto: ChefAvailabilityListDto) {
    const chef = await this.findChefByUserId(userId);

    for (const slot of dto.availability) {
      if (slot.startTime >= slot.endTime) {
        throw new BadRequestException('Availability end time must be later than start time.');
      }
    }

    return this.prisma.$transaction(async (transaction) => {
      await transaction.chefAvailability.deleteMany({ where: { chefId: chef.id } });
      if (dto.availability.length === 0) return [];
      await transaction.chefAvailability.createMany({
        data: dto.availability.map((slot) => ({
          chefId: chef.id,
          dayOfWeek: slot.dayOfWeek,
          startTime: slot.startTime,
          endTime: slot.endTime,
        })),
      });
      return transaction.chefAvailability.findMany({
        where: { chefId: chef.id },
        orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
      });
    });
  }

  async saveServiceAreas(userId: string, dto: ChefServiceAreasDto) {
    const chef = await this.findChefByUserId(userId);

    return this.prisma.$transaction(async (transaction) => {
      await transaction.chefServiceArea.deleteMany({ where: { chefId: chef.id } });
      if (dto.areas.length === 0) return [];
      await transaction.chefServiceArea.createMany({
        data: dto.areas.map((area) => ({
          chefId: chef.id,
          city: area.city,
          state: area.state,
          countryCode: area.countryCode?.toUpperCase(),
          radiusKm: area.radiusKm,
          offersDelivery: area.offersDelivery,
          offersPickup: area.offersPickup,
        })),
      });
      return transaction.chefServiceArea.findMany({
        where: { chefId: chef.id },
        orderBy: [{ countryCode: 'asc' }, { state: 'asc' }, { city: 'asc' }],
      });
    });
  }

  async submitPermit(userId: string, dto: ChefPermitDto) {
    const chef = await this.findChefByUserId(userId);
    if (!dto.storageObjectKey.startsWith(`chef/${chef.id}/verification/`)) {
      throw new BadRequestException(
        'Permit documents must reference a private object in this chef’s verification storage prefix.',
      );
    }
    return this.prisma.chefPermit.create({
      data: {
        chefId: chef.id,
        permitType: dto.permitType.trim(),
        jurisdictionCode: dto.jurisdictionCode.trim().toUpperCase(),
        serviceType: dto.serviceType,
        storageObjectKey: dto.storageObjectKey,
        issuedAt: dto.issuedAt ? new Date(dto.issuedAt) : null,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      },
      select: {
        id: true,
        permitType: true,
        jurisdictionCode: true,
        serviceType: true,
        verificationStatus: true,
        issuedAt: true,
        expiresAt: true,
        createdAt: true,
      },
    });
  }

  private async findChefByUserId(userId: string) {
    const chef = await this.prisma.chefProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!chef) {
      throw new NotFoundException('Create a chef profile before managing its details.');
    }
    return chef;
  }

  async search(query: ChefSearchDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const permitConstraints: Prisma.ChefProfileWhereInput[] = [];
    const discoveryConstraints: Prisma.ChefProfileWhereInput[] = [];
    const selectedCountry = query.countryId
      ? await this.prisma.country.findUnique({
          where: { id: query.countryId },
          select: { name: true },
        })
      : null;
    if (query.jurisdictionCode && query.serviceType) {
      const now = new Date();
      const rule = await this.prisma.complianceRule.findFirst({
        where: {
          jurisdictionCode: query.jurisdictionCode.toUpperCase(),
          serviceType: query.serviceType,
          isActive: true,
          AND: [
            { OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: now } }] },
            { OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: now } }] },
          ],
        },
      });
      if (!rule) return { items: [], page, limit, total: 0, pages: 0 };
      for (const permitType of rule.requiredPermitTypes) {
        permitConstraints.push({
          permits: {
            some: {
              permitType,
              jurisdictionCode: query.jurisdictionCode.toUpperCase(),
              serviceType: query.serviceType,
              verificationStatus: 'verified',
              OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
            },
          },
        });
      }
    }
    const dishFilter: Prisma.ChefDishWhereInput | undefined =
      query.dishId || query.minPrice !== undefined || query.maxPrice !== undefined
        ? {
            ...(query.dishId ? { dishId: query.dishId } : {}),
            ...(query.minPrice !== undefined || query.maxPrice !== undefined
              ? {
                  price: {
                    ...(query.minPrice !== undefined ? { gte: query.minPrice } : {}),
                    ...(query.maxPrice !== undefined ? { lte: query.maxPrice } : {}),
                  },
                }
              : {}),
          }
        : undefined;

    if (query.q) {
      discoveryConstraints.push({
        OR: [
          { displayName: { contains: query.q, mode: 'insensitive' } },
          { bio: { contains: query.q, mode: 'insensitive' } },
          { specialties: { has: query.q } },
          {
            chefDishes: {
              some: {
                dish: { name: { contains: query.q, mode: 'insensitive' } },
              },
            },
          },
          { menuEntries: { some: { name: { contains: query.q, mode: 'insensitive' } } } },
        ],
      });
    }
    if (query.countryId) {
      discoveryConstraints.push({
        OR: [
          {
            chefDishes: {
              some: {
                ...dishFilter,
                dish: {
                  dishCountries: { some: { countryId: query.countryId } },
                },
              },
            },
          },
          ...(selectedCountry
            ? [{ specialties: { has: selectedCountry.name } }]
            : []),
          { menuEntries: { some: { cuisineCountryId: query.countryId } } },
        ],
      });
    }

    const where: Prisma.ChefProfileWhereInput = {
      isPublic: true,
      verificationStatus: 'approved',
      ...(permitConstraints.length || discoveryConstraints.length
        ? { AND: [...permitConstraints, ...discoveryConstraints] }
        : {}),
      ...(query.serviceType ? { serviceTypes: { has: query.serviceType as ServiceType } } : {}),
      ...(query.city || query.state || query.countryCode
        ? {
            serviceAreas: {
              some: {
                ...(query.city ? { city: { equals: query.city, mode: 'insensitive' as const } } : {}),
                ...(query.state ? { state: { equals: query.state, mode: 'insensitive' as const } } : {}),
                ...(query.countryCode ? { countryCode: query.countryCode.toUpperCase() } : {}),
              },
            },
          }
        : {}),
      ...(query.availableDay !== undefined
        ? {
            availability: {
              some: { dayOfWeek: query.availableDay, isAvailable: true },
            },
          }
        : {}),
      ...(!query.countryId && dishFilter
          ? { chefDishes: { some: dishFilter } }
          : undefined),
    };

    const [chefs, total] = await this.prisma.$transaction([
      this.prisma.chefProfile.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ averageRating: 'desc' }, { createdAt: 'desc' }],
        select: {
          id: true,
          displayName: true,
          bio: true,
          city: true,
          state: true,
          countryCode: true,
          specialties: true,
          serviceTypes: true,
          profileImageUrl: true,
          coverImageUrl: true,
          instagramUrl: true,
          tiktokUrl: true,
          youtubeUrl: true,
          facebookUrl: true,
          averageRating: true,
          reviewCount: true,
          serviceRadiusKm: true,
          chefDishes: {
            select: {
              id: true,
              portionSize: true,
              description: true,
              knownIngredients: true,
              majorAllergens: true,
              crossContactRisks: true,
              dish: {
                select: {
                  id: true,
                  name: true,
                  dishCountries: {
                    select: { country: { select: { id: true, name: true, flag: true } } },
                  },
                },
              },
            },
          },
          menuEntries: {
            where: { isAvailable: true },
            orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
            select: {
              id: true,
              name: true,
              description: true,
              knownIngredients: true,
              majorAllergens: true,
              crossContactRisks: true,
              cuisineCountry: { select: { id: true, name: true, flag: true } },
            },
          },
          foodPhotos: {
            take: 6,
            orderBy: { createdAt: 'desc' },
            select: { id: true, imageUrl: true, mediaType: true, caption: true },
          },
          serviceAreas: {
            select: {
              city: true,
              state: true,
              countryCode: true,
              radiusKm: true,
              offersDelivery: true,
              offersPickup: true,
            },
          },
          availability: {
            where: { isAvailable: true },
            orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
            select: { dayOfWeek: true, startTime: true, endTime: true },
          },
        },
      }),
      this.prisma.chefProfile.count({ where }),
    ]);

    return { items: chefs, page, limit, total, pages: Math.ceil(total / limit) };
  }

  async getPublicProfile(id: string) {
    const chef = await this.prisma.chefProfile.findFirst({
      where: { id, isPublic: true, verificationStatus: 'approved' },
      select: {
        id: true,
        userId: true,
        displayName: true,
        bio: true,
        city: true,
        state: true,
        countryCode: true,
        specialties: true,
        serviceTypes: true,
        profileImageUrl: true,
        coverImageUrl: true,
        instagramUrl: true,
        tiktokUrl: true,
        youtubeUrl: true,
        facebookUrl: true,
        averageRating: true,
        reviewCount: true,
        serviceRadiusKm: true,
        chefDishes: {
          select: {
            id: true,
            portionSize: true,
            leadTimeHours: true,
            description: true,
            knownIngredients: true,
            majorAllergens: true,
            crossContactRisks: true,
            dish: {
              select: {
                id: true,
                name: true,
                description: true,
                dishCountries: {
                  select: { country: { select: { id: true, name: true, flag: true } } },
                },
              },
            },
          },
        },
        menuEntries: {
          where: { isAvailable: true },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          select: {
            id: true,
            name: true,
            description: true,
            knownIngredients: true,
            majorAllergens: true,
            crossContactRisks: true,
            cuisineCountry: { select: { id: true, name: true, flag: true } },
          },
        },
        menuTemplates: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            name: true,
            description: true,
            serves: true,
            items: {
              orderBy: { sortOrder: 'asc' },
              select: {
                menuEntry: { select: { id: true, name: true } },
              },
            },
          },
        },
        foodPhotos: {
          orderBy: { createdAt: 'desc' },
          select: { id: true, imageUrl: true, mediaType: true, caption: true, createdAt: true },
        },
        serviceAreas: {
          select: {
            city: true,
            state: true,
            countryCode: true,
            radiusKm: true,
            offersDelivery: true,
            offersPickup: true,
          },
        },
        availability: {
          where: { isAvailable: true },
          orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
          select: { dayOfWeek: true, startTime: true, endTime: true },
        },
      },
    });

    if (!chef) {
      throw new NotFoundException('Chef profile not found.');
    }

    return chef;
  }
}
