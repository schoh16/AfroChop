import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotContains,
  IsNotIn,
  IsBoolean,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  Matches,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ChefMediaType, MajorAllergen, ServiceType } from '@prisma/client';

export class ChefProfileDto {
  @IsString()
  @MinLength(2)
  displayName: string;

  @IsOptional()
  @IsString()
  bio?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  countryCode?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(15)
  @IsString({ each: true })
  specialties?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  languages?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @IsEnum(ServiceType, { each: true })
  @ArrayNotContains([ServiceType.grocery_shopping], { message: 'Grocery shopping services are no longer available.' })
  serviceTypes?: ServiceType[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  serviceRadiusKm?: number;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  profileImageUrl?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  coverImageUrl?: string;
}

export class ChefSocialLinksDto {
  @IsOptional()
  @IsUrl({ require_protocol: true })
  @Matches(/^https:\/\/(www\.)?instagram\.com\/[A-Za-z0-9._-]+\/?$/)
  instagramUrl?: string | null;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @Matches(/^https:\/\/(www\.)?tiktok\.com\/@[A-Za-z0-9._-]+\/?$/)
  tiktokUrl?: string | null;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @Matches(/^https:\/\/(www\.)?youtube\.com\/(@[A-Za-z0-9._-]+|channel\/[A-Za-z0-9_-]+|c\/[A-Za-z0-9_-]+)\/?$/)
  youtubeUrl?: string | null;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @Matches(/^https:\/\/(www\.)?(facebook\.com|fb\.com)\/[A-Za-z0-9._-]+\/?$/)
  facebookUrl?: string | null;
}

export class FoodPhotoDto {
  @IsUrl({ require_protocol: true })
  imageUrl: string;

  @IsOptional()
  @IsEnum(ChefMediaType)
  mediaType?: ChefMediaType;

  @IsOptional()
  @IsString()
  caption?: string;
}

export class ChefMenuItemDto {
  @IsUUID()
  @IsString()
  dishId: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  price: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  knownIngredients: string[];

  @IsArray()
  @ArrayMaxSize(10)
  @IsEnum(MajorAllergen, { each: true })
  majorAllergens: MajorAllergen[];

  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  crossContactRisks: string[];

  @IsOptional()
  @IsString()
  portionSize?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(720)
  leadTimeHours?: number;
}

export class ChefAvailabilityDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek: number;

  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  startTime: string;

  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  endTime: string;
}

export class ChefAvailabilityListDto {
  @IsArray()
  @ArrayMaxSize(56)
  @Type(() => ChefAvailabilityDto)
  @ValidateNested({ each: true })
  availability: ChefAvailabilityDto[];
}

export class ChefServiceAreaDto {
  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  countryCode?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  radiusKm: number;

  @IsBoolean()
  offersDelivery: boolean;

  @IsBoolean()
  offersPickup: boolean;
}

export class ChefServiceAreasDto {
  @IsArray()
  @ArrayMaxSize(20)
  @Type(() => ChefServiceAreaDto)
  @ValidateNested({ each: true })
  areas: ChefServiceAreaDto[];
}

export class ChefPermitDto {
  @IsString()
  @MinLength(2)
  permitType: string;

  @IsString()
  jurisdictionCode: string;

  @IsEnum(ServiceType)
  @IsNotIn([ServiceType.grocery_shopping], { message: 'Grocery shopping services are no longer available.' })
  serviceType: ServiceType;

  @IsString()
  @MinLength(12)
  @MaxLength(300)
  storageObjectKey: string;

  @IsOptional()
  @IsDateString()
  issuedAt?: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
