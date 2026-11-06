import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { GroceryFulfillment } from '@prisma/client';

export class StoreAddressDto {
  @IsString() @MaxLength(120) @Matches(/\S/) name: string;
  @IsString() @MaxLength(200) @Matches(/\S/) street1: string;
  @IsString() @IsOptional() @MaxLength(200) street2?: string;
  @IsString() @MaxLength(100) @Matches(/\S/) city: string;
  @Matches(
    /^(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)$/,
  )
  state: string;
  @Matches(/^\d{5}(-\d{4})?$/) zip: string;
  @Matches(/^\+[1-9]\d{7,14}$/) phone: string;
}

export class StoreSettingsDto {
  @ValidateNested() @Type(() => StoreAddressDto) origin: StoreAddressDto;
  @IsString() @MaxLength(2000) @Matches(/\S/) pickupInstructions: string;
  @IsBoolean() enabled: boolean;
}

export class GroceryProductDto {
  @IsString() @MaxLength(120) @Matches(/\S/) name: string;
  @IsString() @MaxLength(3000) @Matches(/\S/) description: string;
  @IsString() @MaxLength(3000) @Matches(/\S/) ingredients: string;
  @IsString() @MaxLength(2000) @Matches(/\S/) allergenNotice: string;
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  imageUrl?: string | null;
  @IsInt() @Min(1) @Max(1000000) priceCents: number;
  @IsInt() @Min(0) @Max(100000) stock: number;
  @Type(() => Number) @IsNumber() @Min(0.1) @Max(1120) weightOz: number;
  @Type(() => Number) @IsNumber() @Min(0.1) @Max(108) lengthIn: number;
  @Type(() => Number) @IsNumber() @Min(0.1) @Max(108) widthIn: number;
  @Type(() => Number) @IsNumber() @Min(0.1) @Max(108) heightIn: number;
  @Matches(/^txcd_\d{8}$/) taxCode: string;
  @IsBoolean() active: boolean;
  @IsOptional() @IsDateString() expectedUpdatedAt?: string;
}

class CartItemDto {
  @IsUUID() productId: string;
  @IsInt() @Min(1) @Max(20) quantity: number;
}

export class GroceryQuoteDto {
  @IsEnum(GroceryFulfillment) fulfillment: GroceryFulfillment;
  @IsOptional()
  @ValidateNested()
  @Type(() => StoreAddressDto)
  destination?: StoreAddressDto;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => CartItemDto)
  items: CartItemDto[];
}

export class GroceryCheckoutDto {
  @IsString() @MaxLength(150) rateId: string;
}

export class GroceryFulfillDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Matches(/^[A-Za-z0-9 -]+$/)
  trackingNumber?: string;
}

export class GroceryReconcileDto {
  @IsOptional()
  @IsString()
  @Matches(/^cs_(test_|live_)?[A-Za-z0-9]+$/)
  stripeSessionId?: string;
}
