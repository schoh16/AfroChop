import 'reflect-metadata';
import { ServiceType } from '@prisma/client';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { ChefProfileDto, ChefPermitDto } from '../chefs/dto/chef-profile.dto.js';
import { ChefSearchDto } from '../chefs/dto/chef-search.dto.js';
import { BookingRequestDto } from '../quotes/dto/booking-request.dto.js';
import { ChefCredentialDto, ChefServiceApprovalDto, ComplianceRuleDto } from '../safety/dto/safety.dto.js';

describe('Chef-only service validation', () => {
  it.each([
    ChefPermitDto, ChefSearchDto, BookingRequestDto, ChefCredentialDto,
    ChefServiceApprovalDto, ComplianceRuleDto,
  ])('rejects shopping at the %s API boundary', (Dto) => {
    const dto = Object.assign(new Dto(), { serviceType: ServiceType.grocery_shopping });
    expect(validateSync(dto).find((error) => error.property === 'serviceType')?.constraints)
      .toHaveProperty('isNotIn');
  });

  it('rejects mixed cooking and shopping profile offerings', () => {
    const dto = Object.assign(new ChefProfileDto(), {
      displayName: 'Chef Amara', serviceTypes: [ServiceType.prepared_meals, ServiceType.grocery_shopping],
    });
    expect(validateSync(dto).find((error) => error.property === 'serviceTypes')?.constraints)
      .toHaveProperty('arrayNotContains');
  });
});
