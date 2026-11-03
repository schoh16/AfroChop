import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsOptional, IsString, IsUUID,
  MaxLength, MinLength, ValidateNested,
} from 'class-validator';

export class OnboardingFoodDto {
  @IsOptional()
  @IsUUID()
  dishId?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @IsOptional()
  @IsUUID()
  cuisineCountryId?: string;
}

export class ChefOnboardingDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => OnboardingFoodDto)
  foods: OnboardingFoodDto[];
}
