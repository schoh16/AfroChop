import { SetMetadata } from '@nestjs/common';

export const ALLOW_ROLE_SELECTION = 'allow-role-selection';
export const AllowRoleSelection = () => SetMetadata(ALLOW_ROLE_SELECTION, true);
