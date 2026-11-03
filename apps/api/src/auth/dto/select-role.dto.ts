import { IsEnum } from 'class-validator';
import { RegisterRole } from './register.dto.js';

export class SelectRoleDto {
  @IsEnum(RegisterRole)
  role: RegisterRole;
}
