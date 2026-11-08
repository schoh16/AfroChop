import { CanActivate, GoneException, Injectable } from '@nestjs/common';

@Injectable()
export class GroceryRetiredGuard implements CanActivate {
  canActivate(): boolean {
    throw new GoneException('The grocery store has been removed. AfroChop now connects customers with African cooks.');
  }
}
