import { IsBoolean, IsEmail, IsEnum, IsNotEmpty, IsOptional, MinLength } from 'class-validator';

export enum RegisterRole {
  CUSTOMER = 'customer',
  CHEF = 'chef',
}

export class RegisterDto {
  @IsNotEmpty()
  name: string;

  @IsEmail()
  email: string;

  @MinLength(8)
  password: string;

  @IsEnum(RegisterRole)
  role: RegisterRole = RegisterRole.CUSTOMER;

  @IsOptional()
  @IsBoolean()
  smsOrderUpdates?: boolean;
}
