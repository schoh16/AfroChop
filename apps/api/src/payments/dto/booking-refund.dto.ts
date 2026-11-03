import { IsBoolean, IsString, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class BookingRefundDto {
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  reason: string;
}

export class ReviewBookingRefundDto {
  @IsBoolean()
  approved: boolean;

  @IsString()
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @MinLength(10)
  @MaxLength(2000)
  notes: string;
}
