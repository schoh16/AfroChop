import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class EmailDto {
  @IsEmail()
  email: string;
}

export class ConfirmationDto extends EmailDto {
  @IsString()
  @Matches(/^\d{6}$/)
  code: string;
}

export class ResetPasswordDto extends ConfirmationDto {
  @IsString()
  @MinLength(8)
  @MaxLength(256)
  password: string;
}

export class RefreshSessionDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(8192)
  refreshToken?: string;
}
