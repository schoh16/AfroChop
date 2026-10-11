import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const produceCategories = ['vegetable', 'fruit', 'grain', 'herb', 'tuber', 'other'] as const;

export class FarmerProfileDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  farmName: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  bio?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  city: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  state?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2)
  countryCode?: string;

  @IsOptional()
  @IsBoolean()
  offersPickup?: boolean;

  @IsOptional()
  @IsBoolean()
  offersDelivery?: boolean;

  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ['https'] })
  profileImageUrl?: string;
}

export class FarmProduceDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsIn(produceCategories)
  category?: (typeof produceCategories)[number];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100000)
  price?: number;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  unit?: string;

  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;

  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ['https'] })
  imageUrl?: string;
}

export class FarmerSearchDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  state?: string;
}

export class FarmInquiryDto {
  @IsUUID()
  farmerId: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  produceName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  quantity?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  message: string;
}

export class FarmQuoteDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(100000)
  amount: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}