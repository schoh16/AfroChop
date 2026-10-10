import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { MajorAllergen } from '@prisma/client';

export class ChefMenuEntryDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsUUID()
  cuisineCountryId?: string;

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
}

export class ChefMenuTemplateDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  serves?: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  menuEntryIds: string[];
}
