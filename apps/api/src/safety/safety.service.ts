import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { createCipheriv, createHmac, hkdfSync, randomBytes } from 'node:crypto';
import {
  ChefCredentialType,
  ChefApplicationStatus,
  ChefVerificationStatus,
  PermitVerificationStatus,
  SafetyIncidentStatus,
  ServiceType,
  UserVerificationType,
  VerificationStatus,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { StaffApplicationNotificationService } from '../notifications/staff-application-notification.service.js';
import { decryptVerificationValue } from './verification-crypto.js';
import {
  ChefStatusReviewDto,
  ChefApplicationDto,
  ChefApplicationReviewDto,
  ChefCredentialDto,
  ChefCredentialReviewDto,
  ChefServiceApprovalDto,
  CustomerServiceAddressDto,
  ComplianceRuleDto,
  PhoneNumberDto,
  PermitReviewDto,
  SafetyIncidentDto,
  SafetyIncidentReviewDto,
  ServiceAddressReviewDto,
  UserVerificationReviewDto,
} from './dto/safety.dto.js';

@Injectable()
export class SafetyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly staffNotifications: StaffApplicationNotificationService,
  ) {}

  private readAddress(encryptedAddress: string) {
    const value: unknown = JSON.parse(
      decryptVerificationValue(
        encryptedAddress,
        this.config.get<string>('VERIFICATION_ENCRYPTION_KEY'),
      ),
    );
    if (
      !value ||
      typeof value !== 'object' ||
      !('line1' in value) ||
      typeof value.line1 !== 'string' ||
      !('city' in value) ||
      typeof value.city !== 'string' ||
      !('region' in value) ||
      typeof value.region !== 'string' ||
      !('postalCode' in value) ||
      typeof value.postalCode !== 'string' ||
      !('countryCode' in value) ||
      typeof value.countryCode !== 'string'
    ) {
      throw new ServiceUnavailableException(
        'Stored service address cannot be read. Contact support.',
      );
    }
    return {
      line1: value.line1,
      line2:
        'line2' in value && typeof value.line2 === 'string'
          ? value.line2
          : null,
      city: value.city,
      region: value.region,
      postalCode: value.postalCode,
      countryCode: value.countryCode,
    };
  }

  async getAdminServiceAddress(adminId: string, addressId: string) {
    const address = await this.prisma.customerServiceAddress.findUnique({
      where: { id: addressId },
    });
    if (!address) throw new NotFoundException('Service address not found.');
    await this.prisma.verificationAuditLog.create({
      data: {
        actorId: adminId,
        subjectId: address.userId,
        action: 'service_address_review_accessed',
        targetType: 'customer_service_address',
        targetId: addressId,
      },
    });
    return this.readAddress(address.encryptedAddress);
  }

  async submitChefApplication(userId: string, dto: ChefApplicationDto) {
    const chef = await this.prisma.chefProfile.findUnique({
      where: { userId },
      select: {
        id: true,
        application: {
          select: {
            id: true,
            status: true,
            submittedAt: true,
            visitScheduledAt: true,
            interviewedAt: true,
            profileSetupAt: true,
          },
        },
      },
    });
    if (!chef)
      throw new NotFoundException('Complete chef onboarding before applying.');
    if (
      chef.application &&
      chef.application.status !== ChefApplicationStatus.rejected
    ) {
      return chef.application;
    }

    const encryptionKey = this.verificationEncryptionKey();
    const countryCode = dto.countryCode.trim().toUpperCase();
    const line1 = dto.line1.trim();
    const city = dto.city.trim();
    const region = dto.region.trim();
    const postalCode = dto.postalCode.trim();
    if (!line1 || !city || !region || !postalCode) {
      throw new BadRequestException('Enter a complete home visit address.');
    }
    const address = JSON.stringify({
      line1,
      line2: dto.line2?.trim() || null,
      city,
      region,
      postalCode,
      countryCode,
    });

    const submitted = await this.prisma.$transaction(async (transaction) => {
      const application = chef.application
        ? await transaction.chefApplication.update({
            where: { id: chef.application.id },
            data: {
              encryptedHomeAddress: this.encryptVerificationValue(
                address,
                encryptionKey,
              ),
              status: ChefApplicationStatus.submitted,
              submittedAt: new Date(),
              visitScheduledAt: null,
              interviewedAt: null,
              profileSetupAt: null,
              adminNotes: null,
            },
            select: {
              id: true,
              status: true,
              submittedAt: true,
              visitScheduledAt: true,
              interviewedAt: true,
              profileSetupAt: true,
            },
          })
        : await transaction.chefApplication.create({
            data: {
              chefId: chef.id,
              encryptedHomeAddress: this.encryptVerificationValue(
                address,
                encryptionKey,
              ),
            },
            select: {
              id: true,
              status: true,
              submittedAt: true,
              visitScheduledAt: true,
              interviewedAt: true,
              profileSetupAt: true,
            },
          });
      await transaction.chefProfile.update({
        where: { id: chef.id },
        data: { isPublic: false },
      });
      await transaction.verificationAuditLog.create({
        data: {
          actorId: userId,
          subjectId: userId,
          action: 'chef_application_submitted',
          targetType: 'chef_application',
          targetId: application.id,
          details: { countryCode },
        },
      });
      return application;
    });
    await this.staffNotifications.notifySubmitted({
      id: submitted.id,
      submittedAt: submitted.submittedAt,
    });
    return submitted;
  }

  async getMyChefApplication(userId: string) {
    const chef = await this.prisma.chefProfile.findUnique({
      where: { userId },
      select: {
        application: {
          select: {
            id: true,
            status: true,
            submittedAt: true,
            visitScheduledAt: true,
            interviewedAt: true,
            profileSetupAt: true,
          },
        },
      },
    });
    return chef?.application ?? null;
  }

  async listChefApplications() {
    return this.prisma.chefApplication.findMany({
      orderBy: [{ status: 'asc' }, { submittedAt: 'asc' }],
      select: {
        id: true,
        status: true,
        submittedAt: true,
        visitScheduledAt: true,
        interviewedAt: true,
        profileSetupAt: true,
        adminNotes: true,
        chef: {
          select: {
            displayName: true,
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                phoneNumberLast4: true,
              },
            },
          },
        },
      },
    });
  }

  async getChefApplicationAddress(adminId: string, id: string) {
    const application = await this.prisma.chefApplication.findUnique({
      where: { id },
      select: {
        id: true,
        encryptedHomeAddress: true,
        chef: { select: { userId: true } },
      },
    });
    if (!application)
      throw new NotFoundException('Chef application not found.');
    await this.prisma.verificationAuditLog.create({
      data: {
        actorId: adminId,
        subjectId: application.chef.userId,
        action: 'chef_application_address_accessed',
        targetType: 'chef_application',
        targetId: application.id,
      },
    });
    return this.readAddress(application.encryptedHomeAddress);
  }

  async reviewChefApplication(
    adminId: string,
    id: string,
    dto: ChefApplicationReviewDto,
  ) {
    const application = await this.prisma.chefApplication.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        chef: {
          select: {
            id: true,
            userId: true,
            profileImageUrl: true,
            _count: { select: { menuEntries: true } },
          },
        },
      },
    });
    if (!application)
      throw new NotFoundException('Chef application not found.');

    const nextStatuses: Partial<
      Record<ChefApplicationStatus, ChefApplicationStatus[]>
    > = {
      [ChefApplicationStatus.submitted]: [
        ChefApplicationStatus.visit_scheduled,
        ChefApplicationStatus.rejected,
      ],
      [ChefApplicationStatus.visit_scheduled]: [
        ChefApplicationStatus.interviewed,
        ChefApplicationStatus.rejected,
      ],
      [ChefApplicationStatus.interviewed]: [
        ChefApplicationStatus.profile_setup,
        ChefApplicationStatus.rejected,
      ],
    };
    if (
      dto.status !== application.status &&
      !nextStatuses[application.status]?.includes(dto.status)
    ) {
      throw new BadRequestException(
        'Chef applications must follow the visit and interview workflow.',
      );
    }
    if (
      dto.status === ChefApplicationStatus.visit_scheduled &&
      !dto.visitScheduledAt &&
      application.status !== ChefApplicationStatus.visit_scheduled
    ) {
      throw new BadRequestException(
        'Choose a date and time for the home visit.',
      );
    }
    if (dto.visitScheduledAt && new Date(dto.visitScheduledAt) <= new Date()) {
      throw new BadRequestException(
        'The home visit must be scheduled for a future date and time.',
      );
    }
    if (
      dto.status === ChefApplicationStatus.profile_setup &&
      (!application.chef.profileImageUrl ||
        application.chef._count.menuEntries === 0)
    ) {
      throw new BadRequestException(
        'Add a profile photo and at least one food before publishing this cook.',
      );
    }

    const now = new Date();
    return this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.chefApplication.update({
        where: { id },
        data: {
          status: dto.status,
          ...(dto.visitScheduledAt
            ? { visitScheduledAt: new Date(dto.visitScheduledAt) }
            : {}),
          ...(dto.status === ChefApplicationStatus.interviewed &&
          application.status !== ChefApplicationStatus.interviewed
            ? { interviewedAt: now }
            : {}),
          ...(dto.status === ChefApplicationStatus.profile_setup
            ? {
                profileSetupAt:
                  application.status === ChefApplicationStatus.profile_setup
                    ? undefined
                    : now,
              }
            : {}),
          ...(dto.adminNotes !== undefined
            ? { adminNotes: dto.adminNotes }
            : {}),
        },
        select: {
          id: true,
          status: true,
          submittedAt: true,
          visitScheduledAt: true,
          interviewedAt: true,
          profileSetupAt: true,
          adminNotes: true,
        },
      });
      if (dto.status === ChefApplicationStatus.profile_setup) {
        await transaction.chefProfile.update({
          where: { id: application.chef.id },
          data: { isPublic: true },
        });
      } else if (dto.status === ChefApplicationStatus.rejected) {
        await transaction.chefProfile.update({
          where: { id: application.chef.id },
          data: { isPublic: false },
        });
      }
      await transaction.adminAuditLog.create({
        data: {
          actorId: adminId,
          action: 'chef_application_status_changed',
          targetType: 'chef_application',
          targetId: id,
          details: {
            previousStatus: application.status,
            status: dto.status,
            reviewerNotes: dto.adminNotes ?? null,
          },
        },
      });
      await transaction.verificationAuditLog.create({
        data: {
          actorId: adminId,
          subjectId: application.chef.userId,
          action: `chef_application_${dto.status}`,
          targetType: 'chef_application',
          targetId: id,
          details: {
            previousStatus: application.status,
            status: dto.status,
          },
        },
      });
      return updated;
    });
  }

  async getBookingServiceAddress(
    userId: string,
    role: UserRole,
    bookingId: string,
  ) {
    const booking = await this.prisma.bookingRequest.findUnique({
      where: { id: bookingId },
      include: { chef: { select: { userId: true } }, serviceAddress: true },
    });
    if (!booking) throw new NotFoundException('Booking not found.');
    const customer = role === 'customer' && booking.customerId === userId;
    const chef =
      role === 'chef' &&
      booking.chef?.userId === userId &&
      Boolean(booking.depositPaidAt) &&
      ['confirmed', 'in_progress'].includes(booking.status);
    if (!customer && !chef)
      throw new ForbiddenException(
        'Service addresses are private and only available to the assigned cook during a paid active booking.',
      );
    if (!booking.serviceAddress)
      throw new NotFoundException('This booking has no service address.');
    await this.prisma.verificationAuditLog.create({
      data: {
        actorId: userId,
        subjectId: booking.customerId,
        action: 'booking_service_address_accessed',
        targetType: 'booking_request',
        targetId: bookingId,
      },
    });
    return this.readAddress(booking.serviceAddress.encryptedAddress);
  }

  async getMyVerification(userId: string, role: UserRole) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        email: true,
        phoneNumberLast4: true,
        verifications: {
          select: {
            type: true,
            status: true,
            verifiedAt: true,
            expiresAt: true,
          },
        },
        serviceAddresses: {
          select: {
            id: true,
            countryCode: true,
            jurisdictionCode: true,
            status: true,
            validatedAt: true,
            expiresAt: true,
            encryptedAddress: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!user) throw new NotFoundException('User not found.');
    const serviceAddresses = user.serviceAddresses.map(
      ({ encryptedAddress, ...address }) => {
        const value = this.readAddress(encryptedAddress);
        return { ...address, displayLabel: `${value.line1}, ${value.city}` };
      },
    );
    if (role !== UserRole.chef) {
      return {
        email: user.email,
        phoneNumberLast4: user.phoneNumberLast4,
        verifications: user.verifications,
        serviceAddresses,
      };
    }

    const chef = await this.prisma.chefProfile.findUnique({
      where: { userId },
      select: {
        id: true,
        verificationStatus: true,
        credentials: {
          select: {
            id: true,
            type: true,
            name: true,
            jurisdictionCode: true,
            serviceType: true,
            status: true,
            expiresAt: true,
            verifiedAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
        permits: {
          select: {
            id: true,
            permitType: true,
            jurisdictionCode: true,
            serviceType: true,
            verificationStatus: true,
            expiresAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
        serviceApprovals: {
          select: {
            serviceType: true,
            jurisdictionCode: true,
            status: true,
            reviewerNotes: true,
            reviewedAt: true,
          },
          orderBy: [{ serviceType: 'asc' }, { jurisdictionCode: 'asc' }],
        },
        stripeConnectedAccount: {
          select: {
            status: true,
            transferCapabilityStatus: true,
            payoutsEnabled: true,
          },
        },
      },
    });
    if (!chef) throw new NotFoundException('Chef profile not found.');
    const statuses = new Map(
      user.verifications.map((item) => [item.type, item.status]),
    );
    const nextSteps = [
      ...(statuses.get(UserVerificationType.email) !==
      VerificationStatus.verified
        ? ['Verify email']
        : []),
      ...(statuses.get(UserVerificationType.phone) !==
      VerificationStatus.verified
        ? ['Verify phone']
        : []),
      ...(statuses.get(UserVerificationType.identity) !==
      VerificationStatus.verified
        ? ['Complete identity verification with the approved provider']
        : []),
      ...(chef.verificationStatus !== ChefVerificationStatus.approved
        ? ['Await AfroChop administrator approval']
        : []),
      ...(chef.stripeConnectedAccount?.status !== 'eligible'
        ? ['Complete Stripe Connect payout onboarding']
        : []),
    ];
    return {
      email: user.email,
      phoneNumberLast4: user.phoneNumberLast4,
      verifications: user.verifications,
      serviceAddresses,
      chef: {
        id: chef.id,
        approvalStatus: chef.verificationStatus,
        credentials: chef.credentials,
        permits: chef.permits,
        serviceApprovals: chef.serviceApprovals,
        stripePayments: chef.stripeConnectedAccount,
        nextSteps,
      },
    };
  }

  async updateMyPhoneNumber(userId: string, dto: PhoneNumberDto) {
    const encryptionKey = this.verificationEncryptionKey();
    const phoneHash = createHmac(
      'sha256',
      this.deriveVerificationKey(encryptionKey, 'phone-number-index'),
    )
      .update(dto.phoneNumber)
      .digest('hex');
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const user = await transaction.user.update({
          where: { id: userId },
          data: {
            phoneNumberEncrypted: this.encryptVerificationValue(
              dto.phoneNumber,
              encryptionKey,
            ),
            phoneNumberHash: phoneHash,
            phoneNumberLast4: dto.phoneNumber.slice(-4),
          },
          select: { phoneNumberLast4: true },
        });
        const verification = await transaction.userVerification.upsert({
          where: { userId_type: { userId, type: UserVerificationType.phone } },
          create: {
            userId,
            type: UserVerificationType.phone,
            status: VerificationStatus.pending,
            submittedAt: new Date(),
          },
          update: {
            status: VerificationStatus.pending,
            submittedAt: new Date(),
            verifiedAt: null,
            expiresAt: null,
            reviewerNotes: null,
          },
          select: { type: true, status: true, submittedAt: true },
        });
        return { ...user, verification };
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('This phone number is already in use.');
      }
      throw error;
    }
  }

  async createMyServiceAddress(userId: string, dto: CustomerServiceAddressDto) {
    const encryptionKey = this.verificationEncryptionKey();
    const countryCode = dto.countryCode.toUpperCase();
    const jurisdictionCode = dto.jurisdictionCode.trim().toUpperCase();
    if (!jurisdictionCode.startsWith(`${countryCode}-`)) {
      throw new BadRequestException(
        'The service jurisdiction must start with its country code, for example US-MD.',
      );
    }
    const addressValue = JSON.stringify({
      line1: dto.line1.trim(),
      line2: dto.line2?.trim() ?? null,
      city: dto.city.trim(),
      region: dto.region.trim(),
      postalCode: dto.postalCode.trim(),
      countryCode,
      jurisdictionCode,
    });
    const addressHash = createHmac(
      'sha256',
      this.deriveVerificationKey(encryptionKey, 'service-address-index'),
    )
      .update(addressValue.toLowerCase())
      .digest('hex');
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const address = await transaction.customerServiceAddress.create({
          data: {
            userId,
            encryptedAddress: this.encryptVerificationValue(
              addressValue,
              encryptionKey,
            ),
            addressHash,
            countryCode,
            jurisdictionCode,
          },
          select: {
            id: true,
            countryCode: true,
            jurisdictionCode: true,
            status: true,
            createdAt: true,
          },
        });
        await transaction.verificationAuditLog.create({
          data: {
            actorId: userId,
            subjectId: userId,
            action: 'customer_service_address_submitted',
            targetType: 'customer_service_address',
            targetId: address.id,
            details: { countryCode, jurisdictionCode },
          },
        });
        return address;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'This service address has already been submitted.',
        );
      }
      throw error;
    }
  }

  async reviewServiceAddress(
    adminId: string,
    addressId: string,
    dto: ServiceAddressReviewDto,
  ) {
    if (
      dto.status === VerificationStatus.verified &&
      this.config.get<string>('ADDRESS_VERIFICATION_ENABLED') !== 'true'
    ) {
      throw new ForbiddenException(
        'Address verification is disabled until an approved validation provider is configured.',
      );
    }
    if (
      dto.status === VerificationStatus.verified &&
      (!dto.provider?.trim() || !dto.providerReference?.trim())
    ) {
      throw new BadRequestException(
        'Verified address decisions require a provider and evidence reference.',
      );
    }
    if (dto.expiresAt && new Date(dto.expiresAt) <= new Date()) {
      throw new BadRequestException(
        'Address verification expiration must be in the future.',
      );
    }
    const address = await this.prisma.customerServiceAddress.findUnique({
      where: { id: addressId },
      select: { id: true, userId: true },
    });
    if (!address)
      throw new NotFoundException('Customer service address not found.');
    return this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.customerServiceAddress.update({
        where: { id: addressId },
        data: {
          status: dto.status,
          provider: dto.provider,
          providerReference: dto.providerReference,
          validatedAt:
            dto.status === VerificationStatus.verified ? new Date() : null,
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        },
        select: {
          id: true,
          userId: true,
          countryCode: true,
          jurisdictionCode: true,
          status: true,
          validatedAt: true,
          expiresAt: true,
        },
      });
      await transaction.verificationAuditLog.create({
        data: {
          actorId: adminId,
          subjectId: address.userId,
          action: `customer_address_${dto.status}`,
          targetType: 'customer_service_address',
          targetId: addressId,
          details: {
            provider: dto.provider ?? null,
            providerReference: dto.providerReference ?? null,
          },
        },
      });
      return updated;
    });
  }

  async reviewUserVerification(
    adminId: string,
    userId: string,
    type: UserVerificationType,
    dto: UserVerificationReviewDto,
  ) {
    if (
      dto.status === VerificationStatus.verified &&
      (!dto.provider?.trim() || !dto.providerReference?.trim())
    ) {
      throw new BadRequestException(
        'Verified decisions require a provider and an evidence reference.',
      );
    }
    if (
      type === UserVerificationType.identity &&
      dto.status === VerificationStatus.verified &&
      this.config.get<string>('IDENTITY_VERIFICATION_ENABLED') !== 'true'
    ) {
      throw new ForbiddenException(
        'Identity verification is disabled until an approved provider and legal/privacy review are configured.',
      );
    }
    if (
      dto.status === VerificationStatus.verified &&
      dto.expiresAt &&
      new Date(dto.expiresAt) <= new Date()
    ) {
      throw new BadRequestException(
        'A verification cannot be approved with an expired date.',
      );
    }
    const existingUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    });
    if (!existingUser) throw new NotFoundException('User not found.');

    return this.prisma.$transaction(async (transaction) => {
      const verification = await transaction.userVerification.upsert({
        where: { userId_type: { userId, type } },
        create: {
          userId,
          type,
          status: dto.status,
          provider: dto.provider,
          providerReference: dto.providerReference,
          submittedAt: new Date(),
          verifiedAt:
            dto.status === VerificationStatus.verified ? new Date() : null,
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
          reviewedAt: new Date(),
          reviewerNotes: dto.reviewerNotes,
        },
        update: {
          status: dto.status,
          provider: dto.provider,
          providerReference: dto.providerReference,
          verifiedAt:
            dto.status === VerificationStatus.verified ? new Date() : null,
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
          reviewedAt: new Date(),
          reviewerNotes: dto.reviewerNotes,
        },
        select: {
          id: true,
          type: true,
          status: true,
          verifiedAt: true,
          expiresAt: true,
        },
      });
      await transaction.verificationAuditLog.create({
        data: {
          actorId: adminId,
          subjectId: userId,
          action: `user_${type}_verification_${dto.status}`,
          targetType: 'user_verification',
          targetId: verification.id,
          details: {
            provider: dto.provider ?? null,
            providerReference: dto.providerReference ?? null,
            reviewerNotes: dto.reviewerNotes ?? null,
          },
        },
      });
      return verification;
    });
  }

  async getVerificationQueue() {
    const now = new Date();
    const [
      userVerifications,
      permits,
      credentials,
      serviceApprovals,
      documents,
      addresses,
    ] = await Promise.all([
      this.prisma.userVerification.findMany({
        where: {
          OR: [
            {
              status: {
                in: [
                  VerificationStatus.pending,
                  VerificationStatus.needs_more_info,
                ],
              },
            },
            { status: VerificationStatus.verified, expiresAt: { lte: now } },
          ],
        },
        orderBy: { submittedAt: 'asc' },
        select: {
          id: true,
          userId: true,
          type: true,
          status: true,
          provider: true,
          providerReference: true,
          submittedAt: true,
          user: { select: { name: true, email: true, role: true } },
        },
      }),
      this.prisma.chefPermit.findMany({
        where: {
          OR: [
            { verificationStatus: PermitVerificationStatus.pending },
            {
              verificationStatus: PermitVerificationStatus.verified,
              expiresAt: { lte: now },
            },
          ],
        },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          chefId: true,
          permitType: true,
          jurisdictionCode: true,
          serviceType: true,
          expiresAt: true,
          chef: { select: { displayName: true } },
        },
      }),
      this.prisma.chefCredential.findMany({
        where: {
          OR: [
            {
              status: {
                in: [
                  VerificationStatus.pending,
                  VerificationStatus.needs_more_info,
                ],
              },
            },
            { status: VerificationStatus.verified, expiresAt: { lte: now } },
          ],
        },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          chefId: true,
          type: true,
          name: true,
          issuer: true,
          jurisdictionCode: true,
          serviceType: true,
          providerReference: true,
          status: true,
          expiresAt: true,
          chef: { select: { displayName: true } },
        },
      }),
      this.prisma.chefServiceApproval.findMany({
        where: {
          status: {
            in: [
              VerificationStatus.pending,
              VerificationStatus.needs_more_info,
            ],
          },
        },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          chefId: true,
          serviceType: true,
          jurisdictionCode: true,
          status: true,
          chef: { select: { displayName: true } },
        },
      }),
      this.prisma.verificationDocument.findMany({
        where: {
          status: {
            in: [
              VerificationStatus.pending,
              VerificationStatus.needs_more_info,
            ],
          },
          malwareScanStatus: 'clean',
        },
        orderBy: { uploadedAt: 'asc' },
        select: {
          id: true,
          userId: true,
          chefId: true,
          documentType: true,
          status: true,
          uploadedAt: true,
          retentionUntil: true,
        },
      }),
      this.prisma.customerServiceAddress.findMany({
        where: {
          status: {
            in: [
              VerificationStatus.pending,
              VerificationStatus.needs_more_info,
            ],
          },
        },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          userId: true,
          countryCode: true,
          jurisdictionCode: true,
          status: true,
          provider: true,
          providerReference: true,
          createdAt: true,
        },
      }),
    ]);
    return {
      userVerifications,
      permits,
      credentials,
      serviceApprovals,
      documents,
      addresses,
    };
  }

  async createChefCredential(userId: string, dto: ChefCredentialDto) {
    const chef = await this.prisma.chefProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!chef) throw new NotFoundException('Chef profile not found.');
    if (
      dto.type === ChefCredentialType.identity ||
      dto.type === ChefCredentialType.background_screening
    ) {
      throw new ServiceUnavailableException(
        'Identity and background checks must be completed through an approved provider; do not upload or submit raw reports.',
      );
    }
    if (
      dto.expiresAt &&
      dto.issuedAt &&
      new Date(dto.expiresAt) <= new Date(dto.issuedAt)
    ) {
      throw new BadRequestException(
        'Credential expiration must be after its issue date.',
      );
    }
    return this.prisma.chefCredential.create({
      data: {
        chefId: chef.id,
        type: dto.type,
        name: dto.name.trim(),
        issuer: dto.issuer?.trim(),
        jurisdictionCode: dto.jurisdictionCode?.trim().toUpperCase(),
        serviceType: dto.serviceType,
        providerReference: dto.providerReference,
        issuedAt: dto.issuedAt ? new Date(dto.issuedAt) : null,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      },
      select: {
        id: true,
        type: true,
        name: true,
        status: true,
        expiresAt: true,
      },
    });
  }

  async reviewChefCredential(
    adminId: string,
    credentialId: string,
    dto: ChefCredentialReviewDto,
  ) {
    const credential = await this.prisma.chefCredential.findUnique({
      where: { id: credentialId },
      select: {
        id: true,
        chefId: true,
        expiresAt: true,
        status: true,
        issuer: true,
        providerReference: true,
      },
    });
    if (!credential) throw new NotFoundException('Chef credential not found.');
    if (
      dto.status === VerificationStatus.verified &&
      !credential.issuer?.trim() &&
      !credential.providerReference?.trim()
    ) {
      throw new BadRequestException(
        'A credential requires issuer or provider evidence before it can be verified.',
      );
    }
    if (
      dto.status === VerificationStatus.verified &&
      credential.expiresAt &&
      credential.expiresAt <= new Date()
    ) {
      throw new BadRequestException(
        'An expired credential cannot be verified.',
      );
    }
    return this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.chefCredential.update({
        where: { id: credentialId },
        data: {
          status: dto.status,
          verifiedAt:
            dto.status === VerificationStatus.verified ? new Date() : null,
          reviewerNotes: dto.reviewerNotes,
        },
        select: {
          id: true,
          chefId: true,
          type: true,
          status: true,
          expiresAt: true,
        },
      });
      await transaction.verificationAuditLog.create({
        data: {
          actorId: adminId,
          action: `chef_credential_${dto.status}`,
          targetType: 'chef_credential',
          targetId: credentialId,
          details: { reviewerNotes: dto.reviewerNotes ?? null },
        },
      });
      return updated;
    });
  }

  async reviewChefServiceApproval(
    adminId: string,
    chefId: string,
    dto: ChefServiceApprovalDto,
  ) {
    const jurisdictionCode = dto.jurisdictionCode.trim().toUpperCase();
    if (dto.status === VerificationStatus.verified) {
      await this.assertServiceApprovalRequirements(
        chefId,
        dto.serviceType,
        jurisdictionCode,
      );
    }
    return this.prisma.$transaction(async (transaction) => {
      const approval = await transaction.chefServiceApproval.upsert({
        where: {
          chefId_serviceType_jurisdictionCode: {
            chefId,
            serviceType: dto.serviceType,
            jurisdictionCode,
          },
        },
        create: {
          chefId,
          serviceType: dto.serviceType,
          jurisdictionCode,
          status: dto.status,
          reviewedAt: new Date(),
          reviewerNotes: dto.reviewerNotes,
        },
        update: {
          status: dto.status,
          reviewedAt: new Date(),
          reviewerNotes: dto.reviewerNotes,
        },
        select: {
          id: true,
          chefId: true,
          serviceType: true,
          jurisdictionCode: true,
          status: true,
          reviewedAt: true,
        },
      });
      await transaction.verificationAuditLog.create({
        data: {
          actorId: adminId,
          action: `chef_service_approval_${dto.status}`,
          targetType: 'chef_service_approval',
          targetId: approval.id,
          details: {
            chefId,
            serviceType: dto.serviceType,
            jurisdictionCode,
            reviewerNotes: dto.reviewerNotes ?? null,
          },
        },
      });
      return approval;
    });
  }

  async reportIncident(
    reporterId: string,
    role: UserRole,
    dto: SafetyIncidentDto,
  ) {
    if (!dto.bookingRequestId && !dto.chefId && !dto.targetUserId) {
      throw new BadRequestException(
        'Provide a booking, chef, or user to identify the incident.',
      );
    }

    let chefId = dto.chefId;
    if (dto.targetUserId) {
      if (dto.targetUserId === reporterId) {
        throw new BadRequestException('You cannot report your own account.');
      }
      const target = await this.prisma.user.findUnique({
        where: { id: dto.targetUserId },
        select: { id: true },
      });
      if (!target) throw new NotFoundException('Reported user not found.');
    }
    if (dto.bookingRequestId) {
      const booking = await this.prisma.bookingRequest.findUnique({
        where: { id: dto.bookingRequestId },
        select: {
          customerId: true,
          chefId: true,
          chef: { select: { userId: true } },
        },
      });
      if (!booking) throw new NotFoundException('Booking request not found.');
      const canReport =
        role === UserRole.admin ||
        booking.customerId === reporterId ||
        booking.chef?.userId === reporterId;
      if (!canReport)
        throw new ForbiddenException(
          'You cannot report an incident for this booking.',
        );
      if (chefId && chefId !== booking.chefId) {
        throw new BadRequestException(
          'The chef does not match the selected booking.',
        );
      }
      if (
        dto.targetUserId &&
        dto.targetUserId !== booking.customerId &&
        dto.targetUserId !== booking.chef?.userId
      ) {
        throw new BadRequestException(
          'The reported user is not a participant in this booking.',
        );
      }
      chefId = booking.chefId ?? undefined;
    }

    if (chefId) {
      const chef = await this.prisma.chefProfile.findUnique({
        where: { id: chefId },
        select: { id: true },
      });
      if (!chef) throw new NotFoundException('Chef profile not found.');
    }

    const isUrgent = dto.severity === 'urgent';
    return this.prisma.safetyIncident.create({
      data: {
        reporterId,
        targetUserId: dto.targetUserId,
        chefId,
        bookingRequestId: dto.bookingRequestId,
        category: dto.category.trim(),
        description: dto.description.trim(),
        severity: dto.severity,
        status: isUrgent
          ? SafetyIncidentStatus.escalated
          : SafetyIncidentStatus.reported,
        urgentReportedAt: isUrgent ? new Date() : null,
        escalatedAt: isUrgent ? new Date() : null,
      },
      select: {
        id: true,
        category: true,
        severity: true,
        status: true,
        urgentReportedAt: true,
        createdAt: true,
      },
    });
  }

  async listOwnIncidents(reporterId: string) {
    return this.prisma.safetyIncident.findMany({
      where: { reporterId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        category: true,
        severity: true,
        status: true,
        urgentReportedAt: true,
        createdAt: true,
        bookingRequestId: true,
      },
    });
  }

  async getAdminIncidents() {
    return this.prisma.safetyIncident.findMany({
      where: { status: { not: SafetyIncidentStatus.closed } },
      orderBy: [{ severity: 'asc' }, { createdAt: 'asc' }],
      include: {
        reporter: { select: { id: true, name: true, email: true } },
        targetUser: { select: { id: true, name: true, email: true } },
        chef: {
          select: { id: true, displayName: true, verificationStatus: true },
        },
      },
    });
  }

  async reviewIncident(
    adminId: string,
    id: string,
    dto: SafetyIncidentReviewDto,
  ) {
    const incident = await this.prisma.safetyIncident.findUnique({
      where: { id },
      select: { id: true, chefId: true, severity: true },
    });
    if (!incident) throw new NotFoundException('Safety incident not found.');

    const shouldSuspend =
      dto.suspendChef ??
      (incident.severity === 'urgent' && dto.status === 'escalated');
    return this.prisma.$transaction(async (transaction) => {
      const reviewed = await transaction.safetyIncident.update({
        where: { id },
        data: {
          status: dto.status,
          adminNotes: dto.adminNotes,
          escalatedAt:
            dto.status === SafetyIncidentStatus.escalated
              ? new Date()
              : undefined,
          chefSuspendedAt: shouldSuspend ? new Date() : undefined,
        },
      });
      if (shouldSuspend && incident.chefId) {
        await transaction.chefProfile.update({
          where: { id: incident.chefId },
          data: { verificationStatus: ChefVerificationStatus.suspended },
        });
      }
      await transaction.adminAuditLog.create({
        data: {
          actorId: adminId,
          action: shouldSuspend
            ? 'safety_incident_review_and_chef_suspension'
            : 'safety_incident_review',
          targetType: 'safety_incident',
          targetId: id,
          details: {
            status: dto.status,
            suspendedChefId: shouldSuspend ? incident.chefId : null,
            adminNotes: dto.adminNotes ?? null,
          },
        },
      });
      return reviewed;
    });
  }

  async saveComplianceRule(adminId: string, dto: ComplianceRuleDto) {
    if (
      dto.effectiveFrom &&
      dto.effectiveUntil &&
      new Date(dto.effectiveUntil) <= new Date(dto.effectiveFrom)
    ) {
      throw new BadRequestException(
        'Compliance rule effective-until must be after effective-from.',
      );
    }
    const jurisdictionCode = dto.jurisdictionCode.trim().toUpperCase();
    return this.prisma.$transaction(async (transaction) => {
      const rule = await transaction.complianceRule.upsert({
        where: {
          jurisdictionCode_serviceType: {
            jurisdictionCode,
            serviceType: dto.serviceType,
          },
        },
        create: {
          jurisdictionCode,
          serviceType: dto.serviceType,
          requiresApprovedProvider: dto.requiresApprovedProvider,
          requiresServiceApproval: dto.requiresServiceApproval ?? true,
          requiresIdentityVerification:
            dto.requiresIdentityVerification ?? true,
          requiresCustomerIdentityVerification:
            dto.requiresCustomerIdentityVerification ?? false,
          requiresFoodSafetyCredential:
            dto.requiresFoodSafetyCredential ?? false,
          requiresBackgroundScreening: dto.requiresBackgroundScreening ?? false,
          requiredPermitTypes: dto.requiredPermitTypes,
          effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom) : null,
          effectiveUntil: dto.effectiveUntil
            ? new Date(dto.effectiveUntil)
            : null,
          sourceReference: dto.sourceReference,
        },
        update: {
          requiresApprovedProvider: dto.requiresApprovedProvider,
          requiresServiceApproval: dto.requiresServiceApproval ?? true,
          requiresIdentityVerification:
            dto.requiresIdentityVerification ?? true,
          requiresCustomerIdentityVerification:
            dto.requiresCustomerIdentityVerification ?? false,
          requiresFoodSafetyCredential:
            dto.requiresFoodSafetyCredential ?? false,
          requiresBackgroundScreening: dto.requiresBackgroundScreening ?? false,
          requiredPermitTypes: dto.requiredPermitTypes,
          effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom) : null,
          effectiveUntil: dto.effectiveUntil
            ? new Date(dto.effectiveUntil)
            : null,
          sourceReference: dto.sourceReference,
          isActive: true,
        },
      });
      await transaction.adminAuditLog.create({
        data: {
          actorId: adminId,
          action: 'compliance_rule_upsert',
          targetType: 'compliance_rule',
          targetId: rule.id,
          details: {
            jurisdictionCode,
            serviceType: dto.serviceType,
            requiredPermitTypes: dto.requiredPermitTypes,
            sourceReference: dto.sourceReference ?? null,
          },
        },
      });
      return rule;
    });
  }

  async listPendingPermits() {
    return this.prisma.chefPermit.findMany({
      where: { verificationStatus: PermitVerificationStatus.pending },
      orderBy: { createdAt: 'asc' },
      include: {
        chef: { select: { id: true, displayName: true, userId: true } },
      },
    });
  }

  async updateChefStatus(
    adminId: string,
    chefId: string,
    dto: ChefStatusReviewDto,
  ) {
    const chef = await this.prisma.chefProfile.findUnique({
      where: { id: chefId },
      select: { id: true, userId: true, verificationStatus: true },
    });
    if (!chef) throw new NotFoundException('Chef profile not found.');
    if (dto.verificationStatus === ChefVerificationStatus.approved) {
      await this.assertBaseChefReadiness(chef.id, chef.userId);
    }

    return this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.chefProfile.update({
        where: { id: chefId },
        data: { verificationStatus: dto.verificationStatus },
        select: { id: true, verificationStatus: true, updatedAt: true },
      });
      await transaction.adminAuditLog.create({
        data: {
          actorId: adminId,
          action: 'chef_verification_status_changed',
          targetType: 'chef_profile',
          targetId: chefId,
          details: {
            previousStatus: chef.verificationStatus,
            verificationStatus: dto.verificationStatus,
            reviewerNotes: dto.reviewerNotes ?? null,
          },
        },
      });
      await transaction.verificationAuditLog.create({
        data: {
          actorId: adminId,
          subjectId: chef.userId,
          action: `chef_status_${dto.verificationStatus}`,
          targetType: 'chef_profile',
          targetId: chefId,
          details: {
            previousStatus: chef.verificationStatus,
            verificationStatus: dto.verificationStatus,
            reviewerNotes: dto.reviewerNotes ?? null,
          },
        },
      });
      return updated;
    });
  }

  async reviewPermit(adminId: string, id: string, dto: PermitReviewDto) {
    const permit = await this.prisma.chefPermit.findUnique({
      where: { id },
      select: {
        id: true,
        chefId: true,
        expiresAt: true,
        verificationStatus: true,
        malwareScanStatus: true,
      },
    });
    if (!permit) throw new NotFoundException('Chef permit not found.');
    if (permit.malwareScanStatus !== 'clean') {
      throw new ForbiddenException(
        'Permit documents cannot be reviewed until a trusted malware scanner marks the private object clean.',
      );
    }
    if (permit.verificationStatus !== PermitVerificationStatus.pending) {
      throw new BadRequestException('Only pending permits can be reviewed.');
    }
    if (dto.approved && permit.expiresAt && permit.expiresAt <= new Date()) {
      throw new BadRequestException('An expired permit cannot be approved.');
    }

    return this.prisma.$transaction(async (transaction) => {
      const reviewed = await transaction.chefPermit.update({
        where: { id },
        data: {
          verificationStatus: dto.approved
            ? PermitVerificationStatus.verified
            : PermitVerificationStatus.rejected,
          verifiedAt: dto.approved ? new Date() : null,
          reviewerNotes: dto.reviewerNotes,
        },
        select: {
          id: true,
          permitType: true,
          jurisdictionCode: true,
          serviceType: true,
          verificationStatus: true,
          expiresAt: true,
          verifiedAt: true,
          reviewerNotes: true,
        },
      });
      await transaction.adminAuditLog.create({
        data: {
          actorId: adminId,
          action: dto.approved
            ? 'chef_permit_verified'
            : 'chef_permit_rejected',
          targetType: 'chef_permit',
          targetId: id,
          details: { reviewerNotes: dto.reviewerNotes ?? null },
        },
      });
      await transaction.verificationAuditLog.create({
        data: {
          actorId: adminId,
          subjectId: permit.chefId,
          action: dto.approved
            ? 'chef_permit_verified'
            : 'chef_permit_rejected',
          targetType: 'chef_permit',
          targetId: id,
          details: { reviewerNotes: dto.reviewerNotes ?? null },
        },
      });
      return reviewed;
    });
  }

  private async assertBaseChefReadiness(chefId: string, userId: string) {
    const now = new Date();
    const [verifications, paymentAccount] = await Promise.all([
      this.prisma.userVerification.findMany({
        where: { userId },
        select: { type: true, status: true, expiresAt: true },
      }),
      this.prisma.stripeConnectedAccount.findUnique({
        where: { chefId },
        select: { status: true },
      }),
    ]);
    const currentVerified = new Set(
      verifications
        .filter(
          (item) =>
            item.status === VerificationStatus.verified &&
            (!item.expiresAt || item.expiresAt > now),
        )
        .map((item) => item.type),
    );
    const missing = [
      ...(!currentVerified.has(UserVerificationType.email)
        ? ['verified email']
        : []),
      ...(!currentVerified.has(UserVerificationType.phone)
        ? ['verified phone']
        : []),
      ...(!currentVerified.has(UserVerificationType.identity)
        ? ['identity verification']
        : []),
      ...(paymentAccount?.status !== 'eligible'
        ? ['eligible Stripe Connect account']
        : []),
    ];
    if (missing.length) {
      throw new ForbiddenException(
        `Chef cannot be approved until completing: ${missing.join(', ')}.`,
      );
    }
  }

  private verificationEncryptionKey() {
    const encodedKey = this.config.get<string>('VERIFICATION_ENCRYPTION_KEY');
    if (!encodedKey) {
      throw new ServiceUnavailableException(
        'Verification data storage is not configured; set a 32-byte VERIFICATION_ENCRYPTION_KEY.',
      );
    }
    const key = Buffer.from(encodedKey, 'base64');
    if (key.length !== 32) {
      throw new ServiceUnavailableException(
        'VERIFICATION_ENCRYPTION_KEY must be a base64-encoded 32-byte key.',
      );
    }
    return key;
  }

  private encryptVerificationValue(value: string, key: Buffer) {
    const iv = randomBytes(12);
    const cipher = createCipheriv(
      'aes-256-gcm',
      this.deriveVerificationKey(key, 'field-encryption'),
      iv,
    );
    const ciphertext = Buffer.concat([
      cipher.update(value, 'utf8'),
      cipher.final(),
    ]);
    return [
      'v1',
      iv.toString('base64url'),
      cipher.getAuthTag().toString('base64url'),
      ciphertext.toString('base64url'),
    ].join('.');
  }

  private deriveVerificationKey(masterKey: Buffer, purpose: string) {
    return Buffer.from(
      hkdfSync(
        'sha256',
        masterKey,
        Buffer.from('afrochop-verification-v1'),
        Buffer.from(purpose),
        32,
      ),
    );
  }

  private async assertServiceApprovalRequirements(
    chefId: string,
    serviceType: ServiceType,
    jurisdictionCode: string,
  ) {
    const now = new Date();
    const [chef, rule] = await Promise.all([
      this.prisma.chefProfile.findUnique({
        where: { id: chefId },
        select: {
          id: true,
          userId: true,
          verificationStatus: true,
          credentials: {
            where: {
              type: ChefCredentialType.food_safety_training,
              status: VerificationStatus.verified,
              OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
            },
            select: { id: true },
          },
          permits: {
            where: {
              jurisdictionCode,
              serviceType,
              verificationStatus: PermitVerificationStatus.verified,
              OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
            },
            select: { permitType: true },
          },
          backgroundScreenings: {
            where: {
              jurisdictionCode,
              serviceType,
              status: VerificationStatus.verified,
              consentedAt: { not: null },
              OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
            },
            select: { id: true },
          },
        },
      }),
      this.prisma.complianceRule.findFirst({
        where: {
          jurisdictionCode,
          serviceType,
          isActive: true,
          AND: [
            { OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: now } }] },
            { OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: now } }] },
          ],
        },
      }),
    ]);
    if (!chef) throw new NotFoundException('Chef profile not found.');
    if (!rule) {
      throw new ForbiddenException(
        'No active verification requirements are configured for this service.',
      );
    }
    if (chef.verificationStatus !== ChefVerificationStatus.approved) {
      throw new ForbiddenException(
        'The chef must complete general administrator approval first.',
      );
    }
    if (rule.requiresIdentityVerification) {
      const identity = await this.prisma.userVerification.findUnique({
        where: {
          userId_type: {
            userId: chef.userId,
            type: UserVerificationType.identity,
          },
        },
        select: { status: true, expiresAt: true },
      });
      if (
        identity?.status !== VerificationStatus.verified ||
        (identity.expiresAt && identity.expiresAt <= now)
      ) {
        throw new ForbiddenException(
          'Current identity verification is required for this service.',
        );
      }
    }
    if (rule.requiresFoodSafetyCredential && chef.credentials.length === 0) {
      throw new ForbiddenException(
        'A current food-safety credential is required for this service.',
      );
    }
    if (
      rule.requiresBackgroundScreening &&
      chef.backgroundScreenings.length === 0
    ) {
      throw new ForbiddenException(
        'A current, consented background screening is required for this service.',
      );
    }
    const approvedPermitTypes = new Set(
      chef.permits.map(({ permitType }) => permitType),
    );
    const missingPermit = rule.requiredPermitTypes.find(
      (type) => !approvedPermitTypes.has(type),
    );
    if (missingPermit) {
      throw new ForbiddenException(
        `A verified ${missingPermit} permit is required for this service.`,
      );
    }
    const stripeAccount = await this.prisma.stripeConnectedAccount.findUnique({
      where: { chefId },
      select: { status: true },
    });
    if (stripeAccount?.status !== 'eligible') {
      throw new ForbiddenException(
        'An eligible Stripe Connect account is required before approving paid services.',
      );
    }
  }
}
