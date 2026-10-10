import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class AllergyResponseDto {
  @IsBoolean()
  canAccommodate: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  responseNote?: string;
}
