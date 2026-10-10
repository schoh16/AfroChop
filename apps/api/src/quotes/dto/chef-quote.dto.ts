import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, IsUrl, Min } from 'class-validator';

export class ChefQuoteDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateQuotePriceDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;
}

export class GroceryReceiptDto {
  @IsUrl({ require_protocol: true })
  @IsString()
  fileUrl: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  totalSpent: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
