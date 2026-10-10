import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

export class PaymentConfigurationDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000)
  chefCommissionBps!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000)
  customerMarketplaceFeeBps!: number;
}
