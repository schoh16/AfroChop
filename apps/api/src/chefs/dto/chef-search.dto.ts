import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNotIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ServiceType } from '@prisma/client';

export class ChefSearchDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  foodName?: string;

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
  @IsString()
  jurisdictionCode?: string;

  @IsOptional()
  @IsUUID()
  @IsString()
  countryId?: string;

  @IsOptional()
  @IsUUID()
  @IsString()
  dishId?: string;

  @IsOptional()
  @IsEnum(ServiceType)
  @IsNotIn([ServiceType.grocery_shopping], { message: 'Grocery shopping services are no longer available.' })
  serviceType?: ServiceType;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(6)
  availableDay?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 20;
}
