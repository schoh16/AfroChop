import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  BookingStatus,
  QuoteStatus,
  UserRole,
  UserVerificationType,
  VerificationStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { BookingRequestDto } from './dto/booking-request.dto.js';
import {
  ChefQuoteDto,
  GroceryReceiptDto,
  UpdateQuotePriceDto,
} from './dto/chef-quote.dto.js';
import { AllergyResponseDto } from './dto/allergy-response.dto.js';
import { SmsNotificationService } from '../notifications/sms-notification.service.js';

export const ALLERGY_NOTICE_VERSION = '2026-10-08-v1';

// Local development only: skips booking compliance gates. Never honored in production.
function devComplianceBypassEnabled() {
  return process.env.DEV_SKIP_COMPLIANCE === 'true' && process.env.NODE_ENV !== 'production';
}

@Injectable()
export class QuotesService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly smsNotifications?: SmsNotificationService,
  ) {}

  async listForCustomer(customerId: string) {
    return this.prisma.bookingRequest.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      include: {
        quotes: {
          orderBy: { createdAt: 'desc' },
          include: {
            chef: {
              select: {
                id: true,
                displayName: true,
                profileImageUrl: true,
                averageRating: true,
              },
            },
          },
        },
        groceryReceipts: true,
      },
    });
  }

  async listForChef(userId: string) {
    const chef = await this.prisma.chefProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!chef) throw new NotFoundException('Chef profile not found.');

    return this.prisma.bookingRequest.findMany({
      where: { chefId: chef.id },
      orderBy: { createdAt: 'desc' },
      include: {
        customer: { select: { id: true, name: true } },
        quotes: { where: { chefId: chef.id }, orderBy: { createdAt: 'desc' } },
      },
    });
  }

  async getRequest(userId: string, role: UserRole, bookingRequestId: string) {
    const request = await this.prisma.bookingRequest.findUnique({
      where: { id: bookingRequestId },
      include: {
        chef: {
          select: {
            id: true,
            userId: true,
            displayName: true,
            profileImageUrl: true,
          },
        },
        quotes: {
          orderBy: { createdAt: 'desc' },
          include: {
            chef: {
              select: {
                id: true,
                userId: true,
                displayName: true,
                profileImageUrl: true,
              },
            },
          },
        },
        groceryReceipts: true,
      },
    });

    if (!request) throw new NotFoundException('Booking request not found.');
    const allowed =
      role === UserRole.customer
        ? request.customerId === userId
        : role === UserRole.chef && request.chef?.userId === userId;
    if (!allowed) throw new ForbiddenException('You cannot view this booking request.');

    return request;
  }

  async createBookingRequest(customerId: string, dto: BookingRequestDto) {
    const requestedDate = new Date(dto.requestedDate);
    if (requestedDate <= new Date()) {
      throw new BadRequestException('The requested service time must be in the future.');
    }
    if (!dto.allergyNoticeAcknowledged || dto.allergyNoticeVersion !== ALLERGY_NOTICE_VERSION) {
      throw new BadRequestException(
        'Review and acknowledge the current food allergy notice before requesting a booking.',
      );
    }

    const chef = await this.prisma.chefProfile.findFirst({
      where: {
        id: dto.chefId,
        isPublic: true,
        verificationStatus: 'approved',
        serviceTypes: { has: dto.serviceType },
      },
      select: { id: true, userId: true, verificationStatus: true },
    });

    if (!chef) {
      throw new NotFoundException('Approved chef offering this service was not found.');
    }

    const now = new Date();
    const serviceAddressId = devComplianceBypassEnabled()
      ? undefined
      : await this.enforceBookingCompliance(customerId, chef, dto, now);

    const serviceEndAt = new Date(requestedDate.getTime() + dto.durationMinutes * 60_000);
    const finalPaymentDueAt = new Date(requestedDate.getTime() - 24 * 60 * 60_000);
    const disclosedAllergens = dto.disclosedAllergens ?? [];

    const booking = await this.prisma.bookingRequest.create({
      data: {
        customerId,
        chefId: chef.id,
        customerServiceAddressId: serviceAddressId,
        serviceType: dto.serviceType,
        status: BookingStatus.requested,
        requestedDate,
        desiredDate: requestedDate,
        serviceEndAt,
        serviceJurisdictionCode: dto.jurisdictionCode.toUpperCase(),
        durationMinutes: dto.durationMinutes,
        notes: dto.notes,
        disclosedAllergens,
        dietaryRestrictions: dto.dietaryRestrictions ?? [],
        allergyAcknowledgedAt: now,
        allergyNoticeVersion: ALLERGY_NOTICE_VERSION,
        allergyReviewStatus: disclosedAllergens.length ? 'pending' : 'not_required',
        budget: dto.budget,
        downPaymentPercent: 50,
        finalPaymentDueAt,
      },
    });
    await this.smsNotifications?.notifyCustomerOrderStatus(booking.id, 'requested');
    return booking;
  }

  async respondToAllergyRequest(
    chefUserId: string,
    bookingRequestId: string,
    dto: AllergyResponseDto,
  ) {
    const chef = await this.getApprovedChefForUser(chefUserId);
    const request = await this.prisma.bookingRequest.findUnique({
      where: { id: bookingRequestId },
      select: {
        chefId: true,
        status: true,
        allergyReviewStatus: true,
        disclosedAllergens: true,
      },
    });
    if (!request) throw new NotFoundException('Booking request not found.');
    if (request.chefId !== chef.id) {
      throw new ForbiddenException('You cannot respond to another chef’s booking request.');
    }
    if (!request.disclosedAllergens.length || request.allergyReviewStatus !== 'pending') {
      throw new BadRequestException('This request is not awaiting an allergy safety response.');
    }
    if (request.status !== BookingStatus.requested && request.status !== BookingStatus.quoted) {
      throw new BadRequestException('This request can no longer receive a safety response.');
    }

    const updated = await this.prisma.bookingRequest.update({
      where: { id: bookingRequestId },
      data: {
        allergyReviewStatus: dto.canAccommodate ? 'accepted' : 'declined',
        allergyReviewedAt: new Date(),
        allergyResponseNote: dto.responseNote,
        ...(dto.canAccommodate ? {} : { status: BookingStatus.cancelled }),
      },
      select: {
        id: true,
        status: true,
        allergyReviewStatus: true,
        allergyReviewedAt: true,
        allergyResponseNote: true,
      },
    });
    if (!dto.canAccommodate) {
      await this.smsNotifications?.notifyCustomerOrderStatus(bookingRequestId, 'cancelled');
    }
    return updated;
  }

  async createChefQuote(chefUserId: string, bookingRequestId: string, dto: ChefQuoteDto) {
    const chef = await this.getApprovedChefForUser(chefUserId);
    const request = await this.prisma.bookingRequest.findUnique({
      where: { id: bookingRequestId },
      select: {
        chefId: true,
        status: true,
        allergyReviewStatus: true,
        serviceType: true,
        serviceJurisdictionCode: true,
      },
    });

    if (!request) {
      throw new NotFoundException('Booking request not found.');
    }
    if (request.chefId !== chef.id) {
      throw new ForbiddenException('You cannot quote another chef’s booking request.');
    }
    if (request.allergyReviewStatus === 'pending') {
      throw new BadRequestException(
        'Review and respond to the customer’s allergy disclosure before quoting.',
      );
    }
    if (request.allergyReviewStatus === 'declined') {
      throw new BadRequestException('A booking cannot proceed after the chef declines the allergy request.');
    }
    if (request.status !== BookingStatus.requested && request.status !== BookingStatus.quoted) {
      throw new BadRequestException('This request is no longer accepting quotes.');
    }
    if (!devComplianceBypassEnabled()) {
      if (!request.serviceJurisdictionCode) {
        throw new ForbiddenException('The booking has no jurisdiction configured for verification.');
      }
      const approval = await this.prisma.chefServiceApproval.findUnique({
        where: {
          chefId_serviceType_jurisdictionCode: {
            chefId: chef.id,
            serviceType: request.serviceType,
            jurisdictionCode: request.serviceJurisdictionCode,
          },
        },
        select: { status: true },
      });
      const stripeAccount = await this.prisma.stripeConnectedAccount.findUnique({
        where: { chefId: chef.id },
        select: { status: true },
      });
      if (approval?.status !== VerificationStatus.verified || stripeAccount?.status !== 'eligible') {
        throw new ForbiddenException(
          'Only chefs approved for this service and eligible for Stripe transfers can quote paid bookings.',
        );
      }
    }

    const quote = await this.prisma.$transaction(async (transaction) => {
      const quote = await transaction.quote.create({
        data: {
          bookingRequestId,
          chefId: chef.id,
          amount: dto.amount,
          downPaymentPercent: 50,
          notes: dto.notes,
        },
      });
      await transaction.bookingRequest.update({
        where: { id: bookingRequestId },
        data: { status: BookingStatus.quoted, quoteAmount: dto.amount },
      });
      return quote;
    });
    await this.smsNotifications?.notifyCustomerOrderStatus(bookingRequestId, 'quoted');
    return quote;
  }

  async updatePrice(chefUserId: string, quoteId: string, dto: UpdateQuotePriceDto) {
    const chef = await this.getApprovedChefForUser(chefUserId);
    const quote = await this.prisma.quote.findUnique({
      where: { id: quoteId },
      select: { chefId: true, status: true, bookingRequestId: true },
    });

    if (!quote) throw new NotFoundException('Quote not found.');
    if (quote.chefId !== chef.id) throw new ForbiddenException('You cannot change this quote.');
    if (quote.status !== QuoteStatus.pending) {
      throw new BadRequestException('Only pending quotes can be revised.');
    }

    return this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.quote.update({
        where: { id: quoteId },
        data: { amount: dto.amount },
      });
      await transaction.bookingRequest.update({
        where: { id: quote.bookingRequestId },
        data: { quoteAmount: dto.amount },
      });
      return updated;
    });
  }

  async submitReceipt(
    chefUserId: string,
    bookingRequestId: string,
    dto: GroceryReceiptDto,
  ) {
    const chef = await this.getApprovedChefForUser(chefUserId);
    const request = await this.prisma.bookingRequest.findUnique({
      where: { id: bookingRequestId },
      select: { chefId: true, serviceType: true },
    });

    if (!request) throw new NotFoundException('Booking request not found.');
    if (request.chefId !== chef.id) {
      throw new ForbiddenException('You cannot submit a receipt for another chef’s booking.');
    }
    if (request.serviceType !== 'grocery_shopping') {
      throw new BadRequestException('Receipts are only accepted for grocery-shopping services.');
    }

    return this.prisma.groceryReceipt.create({
      data: {
        bookingRequestId,
        chefId: chef.id,
        fileUrl: dto.fileUrl,
        totalSpent: dto.totalSpent,
        notes: dto.notes,
      },
    });
  }

  async confirmCompletion(userId: string, role: UserRole, bookingRequestId: string) {
    const booking = await this.prisma.bookingRequest.findUnique({
      where: { id: bookingRequestId },
      select: {
        id: true,
        customerId: true,
        chefId: true,
        status: true,
        chefCompletedAt: true,
        customerCompletedAt: true,
        chef: { select: { userId: true } },
      },
    });
    if (!booking) throw new NotFoundException('Booking request not found.');
    const isCustomer = role === UserRole.customer && booking.customerId === userId;
    const isAssignedChef =
      role === UserRole.chef && booking.chef?.userId === userId;
    if (!isCustomer && !isAssignedChef) {
      throw new ForbiddenException('You cannot confirm another user’s booking completion.');
    }
    if (
      booking.status !== BookingStatus.confirmed &&
      booking.status !== BookingStatus.in_progress &&
      booking.status !== BookingStatus.completed
    ) {
      throw new BadRequestException('Only a confirmed booking can be completed.');
    }
    if (booking.status === BookingStatus.completed) {
      return {
        id: booking.id,
        status: booking.status,
        chefCompletedAt: booking.chefCompletedAt,
        customerCompletedAt: booking.customerCompletedAt,
      };
    }
    if (
      (isCustomer && booking.customerCompletedAt) ||
      (isAssignedChef && booking.chefCompletedAt)
    ) {
      return {
        id: booking.id,
        status: booking.status,
        chefCompletedAt: booking.chefCompletedAt,
        customerCompletedAt: booking.customerCompletedAt,
      };
    }
    const completedAt = new Date();

    const updatedBooking = await this.prisma.$transaction(async (transaction) => {
      await transaction.bookingRequest.update({
        where: { id: bookingRequestId },
        data: isCustomer
          ? { customerCompletedAt: completedAt }
          : { chefCompletedAt: completedAt },
      });
      await transaction.bookingRequest.updateMany({
        where: {
          id: bookingRequestId,
          status: { in: [BookingStatus.confirmed, BookingStatus.in_progress] },
          chefCompletedAt: { not: null },
          customerCompletedAt: { not: null },
        },
        data: { status: BookingStatus.completed },
      });
      return transaction.bookingRequest.findUniqueOrThrow({
        where: { id: bookingRequestId },
        select: {
          id: true,
          status: true,
          chefCompletedAt: true,
          customerCompletedAt: true,
        },
      });
    });
    if (updatedBooking.status === BookingStatus.completed) {
      await this.smsNotifications?.notifyCustomerOrderStatus(bookingRequestId, 'completed');
    }
    return updatedBooking;
  }

  private async getApprovedChefForUser(userId: string) {
    const chef = await this.prisma.chefProfile.findFirst({
      where: { userId, verificationStatus: 'approved', isPublic: true },
      select: { id: true },
    });
    if (!chef) {
      throw new ForbiddenException('An approved public chef profile is required.');
    }
    return chef;
  }

  private async enforceBookingCompliance(
    customerId: string,
    chef: { id: string; userId: string; verificationStatus: string },
    dto: BookingRequestDto,
    now: Date,
  ): Promise<string | undefined> {
    const complianceRule = await this.prisma.complianceRule.findFirst({
      where: {
        jurisdictionCode: dto.jurisdictionCode.toUpperCase(),
        serviceType: dto.serviceType,
        isActive: true,
        AND: [
          { OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: now } }] },
          { OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: now } }] },
        ],
      },
    });
    if (!complianceRule) {
      throw new ForbiddenException(
        'This jurisdiction and service type are not configured for compliance review yet.',
      );
    }
    const customerVerifications = await this.prisma.userVerification.findMany({
      where: { userId: customerId },
      select: { type: true, status: true, expiresAt: true },
    });
    const verifiedCustomerTypes = new Set(
      customerVerifications
        .filter(
          (verification) =>
            verification.status === VerificationStatus.verified &&
            (!verification.expiresAt || verification.expiresAt > now),
        )
        .map((verification) => verification.type),
    );
    if (
      !verifiedCustomerTypes.has(UserVerificationType.email) ||
      !verifiedCustomerTypes.has(UserVerificationType.phone)
    ) {
      throw new ForbiddenException(
        'Verify your email and phone number before requesting a booking.',
      );
    }
    if (
      complianceRule.requiresCustomerIdentityVerification &&
      !verifiedCustomerTypes.has(UserVerificationType.identity)
    ) {
      throw new ForbiddenException(
        'Additional identity verification is required for this service before booking.',
      );
    }
    let serviceAddressId: string | undefined;
    if (dto.serviceType === 'in_home_cooking') {
      if (!dto.serviceAddressId) {
        throw new ForbiddenException(
          'An AfroChop-verified service address is required for in-home appointments.',
        );
      }
      const serviceAddress = await this.prisma.customerServiceAddress.findFirst({
        where: {
          id: dto.serviceAddressId,
          userId: customerId,
          status: VerificationStatus.verified,
          jurisdictionCode: dto.jurisdictionCode.toUpperCase(),
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        select: { id: true },
      });
      if (!serviceAddress) {
        throw new ForbiddenException(
          'The selected service address is not currently verified for this jurisdiction.',
        );
      }
      serviceAddressId = serviceAddress.id;
    } else if (dto.serviceAddressId) {
      throw new BadRequestException(
        'A service address can only be attached to an in-home appointment.',
      );
    }
    if (complianceRule.requiresApprovedProvider && chef.verificationStatus !== 'approved') {
      throw new ForbiddenException(
        'This service requires an approved provider in the selected jurisdiction.',
      );
    }
    if (complianceRule.requiresServiceApproval) {
      const approval = await this.prisma.chefServiceApproval.findUnique({
        where: {
          chefId_serviceType_jurisdictionCode: {
            chefId: chef.id,
            serviceType: dto.serviceType,
            jurisdictionCode: dto.jurisdictionCode.toUpperCase(),
          },
        },
        select: { status: true },
      });
      if (approval?.status !== VerificationStatus.verified) {
        throw new ForbiddenException(
          'The chef is not approved for this service type and jurisdiction.',
        );
      }
    }
    if (complianceRule.requiresIdentityVerification) {
      const chefIdentity = await this.prisma.userVerification.findUnique({
        where: {
          userId_type: { userId: chef.userId, type: UserVerificationType.identity },
        },
        select: { status: true, expiresAt: true },
      });
      if (
        chefIdentity?.status !== VerificationStatus.verified ||
        (chefIdentity.expiresAt && chefIdentity.expiresAt <= now)
      ) {
        throw new ForbiddenException(
          'The chef does not have current identity verification for this service.',
        );
      }
    }
    if (complianceRule.requiresFoodSafetyCredential) {
      const credential = await this.prisma.chefCredential.findFirst({
        where: {
          chefId: chef.id,
          type: 'food_safety_training',
          status: VerificationStatus.verified,
          OR: [{ serviceType: null }, { serviceType: dto.serviceType }],
          AND: [
            { OR: [{ jurisdictionCode: null }, { jurisdictionCode: dto.jurisdictionCode.toUpperCase() }] },
            { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
          ],
        },
        select: { id: true },
      });
      if (!credential) {
        throw new ForbiddenException(
          'The chef lacks a current food-safety credential for this service.',
        );
      }
    }
    if (complianceRule.requiresBackgroundScreening) {
      const screening = await this.prisma.backgroundScreeningRecord.findFirst({
        where: {
          chefId: chef.id,
          serviceType: dto.serviceType,
          jurisdictionCode: dto.jurisdictionCode.toUpperCase(),
          status: VerificationStatus.verified,
          consentedAt: { not: null },
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        select: { id: true },
      });
      if (!screening) {
        throw new ForbiddenException(
          'The chef lacks current consented background screening for this service.',
        );
      }
    }
    const stripeAccount = await this.prisma.stripeConnectedAccount.findUnique({
      where: { chefId: chef.id },
      select: { status: true },
    });
    if (stripeAccount?.status !== 'eligible') {
      throw new ForbiddenException(
        'The chef must complete Stripe Connect payout verification before accepting paid bookings.',
      );
    }
    if (complianceRule.requiredPermitTypes.length) {
      const permits = await this.prisma.chefPermit.findMany({
        where: {
          chefId: chef.id,
          jurisdictionCode: dto.jurisdictionCode.toUpperCase(),
          serviceType: dto.serviceType,
          permitType: { in: complianceRule.requiredPermitTypes },
          verificationStatus: 'verified',
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        select: { permitType: true },
      });
      const validPermitTypes = new Set(permits.map(({ permitType }) => permitType));
      const missingPermit = complianceRule.requiredPermitTypes.find(
        (permitType) => !validPermitTypes.has(permitType),
      );
      if (missingPermit) {
        throw new ForbiddenException(
          `The chef is not verified for the required ${missingPermit} permit in this jurisdiction.`,
        );
      }
    }
    return serviceAddressId;
  }
}