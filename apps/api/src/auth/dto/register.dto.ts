import { IsBoolean, IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export enum RegisterRole {
  CUSTOMER = 'customer',
  CHEF = 'chef',
  FARMER = 'farmer',
}

export class RegisterDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(120)
  name: string;

  @IsEmail()
  email: string;

  @MinLength(8)
  @IsString()
  @MaxLength(256)
  password: string;

  @IsEnum(RegisterRole)
  role: RegisterRole = RegisterRole.CUSTOMER;

  @IsOptional()
  @IsBoolean()
  smsOrderUpdates?: boolean;
}
