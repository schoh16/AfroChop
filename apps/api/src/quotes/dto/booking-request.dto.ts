import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { MajorAllergen, ServiceType } from '@prisma/client';

export class BookingRequestDto {
  @IsUUID()
  chefId: string;

  @IsOptional()
  @IsUUID()
  serviceAddressId?: string;

  @IsEnum(ServiceType)
  serviceType: ServiceType;

  @IsDateString()
  requestedDate: string;

  @IsString()
  jurisdictionCode: string;

  @Type(() => Number)
  @IsInt()
  @Min(30)
  @Max(720)
  durationMinutes: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  budget?: number;

  @IsOptional()
  @IsString()
  @MinLength(2)
  notes?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsEnum(MajorAllergen, { each: true })
  disclosedAllergens: MajorAllergen[] = [];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  dietaryRestrictions: string[] = [];

  @IsBoolean()
  allergyNoticeAcknowledged: boolean;

  @IsString()
  allergyNoticeVersion: string;
}
