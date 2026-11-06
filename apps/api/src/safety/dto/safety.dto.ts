import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNotIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  SafetyIncidentSeverity,
  SafetyIncidentStatus,
  ServiceType,
  ChefApplicationStatus,
  ChefVerificationStatus,
  ChefCredentialType,
  VerificationStatus,
} from '@prisma/client';

export class SafetyIncidentDto {
  @IsOptional()
  @IsUUID()
  bookingRequestId?: string;

  @IsOptional()
  @IsUUID()
  targetUserId?: string;

  @IsOptional()
  @IsUUID()
  chefId?: string;

  @IsString()
  @MinLength(3)
  @MaxLength(100)
  category: string;

  @IsString()
  @MinLength(10)
  @MaxLength(10000)
  description: string;

  @IsEnum(SafetyIncidentSeverity)
  severity: SafetyIncidentSeverity;
}

export class SafetyIncidentReviewDto {
  @IsEnum(SafetyIncidentStatus)
  status: SafetyIncidentStatus;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  adminNotes?: string;

  @IsOptional()
  @IsBoolean()
  suspendChef?: boolean;
}

export class PermitReviewDto {
  @IsBoolean()
  approved: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reviewerNotes?: string;
}

export class ChefStatusReviewDto {
  @IsEnum(ChefVerificationStatus)
  verificationStatus: ChefVerificationStatus;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reviewerNotes?: string;
}

export class ChefApplicationDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  phoneNumber?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  experienceYears?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  countryOfOrigin?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  meetingAvailability?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  line1?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  line2?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  region?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  postalCode?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z]{2}$/)
  countryCode?: string;
}

export class ChefApplicationReviewDto {
  @IsEnum(ChefApplicationStatus)
  status: ChefApplicationStatus;

  @IsOptional()
  @IsEnum(ChefApplicationStatus)
  expectedStatus?: ChefApplicationStatus;

  @IsOptional()
  @IsDateString()
  visitScheduledAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  adminNotes?: string;
}

export class ComplianceRuleDto {
  @IsString()
  @MinLength(2)
  jurisdictionCode: string;

  @IsEnum(ServiceType)
  @IsNotIn([ServiceType.grocery_shopping], { message: 'Grocery shopping services are no longer available.' })
  serviceType: ServiceType;

  @IsBoolean()
  requiresApprovedProvider: boolean;

  @IsOptional()
  @IsBoolean()
  requiresServiceApproval?: boolean;

  @IsOptional()
  @IsBoolean()
  requiresIdentityVerification?: boolean;

  @IsOptional()
  @IsBoolean()
  requiresCustomerIdentityVerification?: boolean;

  @IsOptional()
  @IsBoolean()
  requiresFoodSafetyCredential?: boolean;

  @IsOptional()
  @IsBoolean()
  requiresBackgroundScreening?: boolean;

  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  requiredPermitTypes: string[];

  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  @IsOptional()
  @IsDateString()
  effectiveUntil?: string;

  @IsOptional()
  @IsString()
  sourceReference?: string;
}

export class UserVerificationReviewDto {
  @IsEnum(VerificationStatus)
  status: VerificationStatus;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  provider?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  providerReference?: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reviewerNotes?: string;
}

export class ChefCredentialDto {
  @IsEnum(ChefCredentialType)
  type: ChefCredentialType;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  issuer?: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  jurisdictionCode?: string;

  @IsOptional()
  @IsEnum(ServiceType)
  @IsNotIn([ServiceType.grocery_shopping], { message: 'Grocery shopping services are no longer available.' })
  serviceType?: ServiceType;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  providerReference?: string;

  @IsOptional()
  @IsDateString()
  issuedAt?: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

export class ChefCredentialReviewDto {
  @IsEnum(VerificationStatus)
  status: VerificationStatus;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reviewerNotes?: string;
}

export class ChefServiceApprovalDto {
  @IsEnum(ServiceType)
  @IsNotIn([ServiceType.grocery_shopping], { message: 'Grocery shopping services are no longer available.' })
  serviceType: ServiceType;

  @IsString()
  @MinLength(2)
  @MaxLength(16)
  jurisdictionCode: string;

  @IsEnum(VerificationStatus)
  status: VerificationStatus;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reviewerNotes?: string;
}

export class PhoneNumberDto {
  @IsString()
  @Matches(/^\+[1-9]\d{7,14}$/)
  phoneNumber: string;
}

export class VerificationCodeDto {
  @IsString()
  @Matches(/^\d{4,10}$/)
  code: string;
}

export class CustomerServiceAddressDto {
  @IsString()
  @MinLength(3)
  @MaxLength(160)
  line1: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  line2?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  city: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  region: string;

  @IsString()
  @MinLength(2)
  @MaxLength(20)
  postalCode: string;

  @IsString()
  @Matches(/^[A-Za-z]{2}$/)
  countryCode: string;

  @IsString()
  @MinLength(2)
  @MaxLength(16)
  jurisdictionCode: string;
}

export class ServiceAddressReviewDto {
  @IsEnum(VerificationStatus)
  status: VerificationStatus;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  provider?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  providerReference?: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
