import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  IsNotEmpty,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateReviewDto {
  @IsUUID()
  bookingId!: string;

  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @IsOptional()
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MaxLength(3000)
  reviewText?: string;

  @IsBoolean()
  recommended!: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  foodQuality?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  communication?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  punctuality?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  professionalism?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsUrl({ protocols: ['https'], require_protocol: true }, { each: true })
  photos?: string[];
}

export class UpdateReviewDto {
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @IsOptional()
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MaxLength(3000)
  reviewText?: string;

  @IsBoolean()
  recommended!: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  foodQuality?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  communication?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  punctuality?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  professionalism?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsUrl({ protocols: ['https'], require_protocol: true }, { each: true })
  photos?: string[];
}

export class ReviewListQueryDto {
  @IsOptional()
  @IsIn(['newest', 'highest', 'lowest'])
  sort?: 'newest' | 'highest' | 'lowest' = 'newest';

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 10;
}

export class ReviewReportDto {
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  details?: string;
}

export class ChefReviewResponseDto {
  @IsString()
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsNotEmpty()
  @MaxLength(2000)
  response!: string;
}

export class ReviewDisputeDto {
  @IsString()
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsNotEmpty()
  @MaxLength(2000)
  appeal!: string;
}

export class ReviewModerationDto {
  @IsIn(['published', 'under_review', 'hidden', 'removed'])
  status!: 'published' | 'under_review' | 'hidden' | 'removed';

  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason!: string;
}

export class ReviewReportDecisionDto {
  @IsIn(['reviewed', 'dismissed'])
  status!: 'reviewed' | 'dismissed';

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  adminNotes?: string;
}

export class ReviewDisputeDecisionDto {
  @IsIn(['appeal_granted', 'appeal_denied'])
  status!: 'appeal_granted' | 'appeal_denied';

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  adminNotes?: string;
}
