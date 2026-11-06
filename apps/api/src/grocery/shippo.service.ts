import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import { GroceryProduct } from '@prisma/client';
import { StoreAddressDto } from './grocery.dto.js';

export const shippingRatesSchema = z.array(
  z.object({
    id: z.string(),
    amountCents: z.number().int().nonnegative(),
    service: z.string(),
    estimatedDays: z.number().int().nullable(),
  }),
);
export type ShippingRate = z.infer<typeof shippingRatesSchema>[number];
const shipmentSchema = z.object({
  status: z.string(),
  rates: z.array(
    z.object({
      object_id: z.string(),
      amount: z.string(),
      currency: z.string(),
      provider: z.string(),
      servicelevel: z.object({ name: z.string() }),
      estimated_days: z.number().int().nullable().optional(),
      test: z.boolean().optional(),
    }),
  ),
});

@Injectable()
export class ShippoService {
  private readonly logger = new Logger(ShippoService.name);
  constructor(private readonly config: ConfigService) {}

  async rates(
    origin: StoreAddressDto,
    destination: StoreAddressDto,
    items: { product: GroceryProduct; quantity: number }[],
  ): Promise<ShippingRate[]> {
    const key = this.config.get<string>('SHIPPO_API_TOKEN');
    if (!key)
      throw new ServiceUnavailableException(
        'Shipping is not configured. Choose pickup or contact AfroChop.',
      );
    // Each unit is a separately packed parcel; no guessed combined carton dimensions.
    const parcels = items.flatMap(({ product, quantity }) =>
      Array.from({ length: quantity }, () => ({
        length: String(product.lengthIn),
        width: String(product.widthIn),
        height: String(product.heightIn),
        distance_unit: 'in',
        weight: String(product.weightOz),
        mass_unit: 'oz',
      })),
    );
    try {
      const response = await fetch('https://api.goshippo.com/shipments/', {
        method: 'POST',
        headers: {
          Authorization: `ShippoToken ${key}`,
          'Content-Type': 'application/json',
          'SHIPPO-API-VERSION': '2018-02-08',
        },
        body: JSON.stringify({
          address_from: this.shippoAddress(origin),
          address_to: this.shippoAddress(destination),
          parcels,
          async: false,
        }),
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok) throw new Error(`Shippo HTTP ${response.status}`);
      const shipment = shipmentSchema.parse(await response.json());
      if (shipment.status !== 'SUCCESS')
        throw new Error('Shipment rates unavailable');
      const live =
        this.config.get<string>('GROCERY_LIVE_PAYMENTS_ENABLED') === 'true';
      const rates = shipment.rates
        .filter(
          (rate) => rate.currency === 'USD' && (!live || rate.test === false),
        )
        .map((rate) => {
          if (!/^\d+\.\d{2}$/.test(rate.amount))
            throw new Error('Invalid shipping amount');
          const [dollars, cents] = rate.amount.split('.');
          return {
            id: rate.object_id,
            amountCents: Number(dollars) * 100 + Number(cents),
            service: `${rate.provider} ${rate.servicelevel.name}`,
            estimatedDays: rate.estimated_days ?? null,
          };
        })
        .sort((a, b) => a.amountCents - b.amountCents);
      if (!rates.length) throw new Error('No eligible US shipping rates');
      return rates;
    } catch {
      this.logger.error(
        'Shippo shipping rates unavailable. Check carrier accounts, US address, and packed parcel configuration.',
      );
      throw new ServiceUnavailableException(
        'No shipping quote is available for this order. Check the address, try pickup, or contact AfroChop.',
      );
    }
  }

  private shippoAddress(address: StoreAddressDto) {
    return {
      name: address.name,
      street1: address.street1,
      street2: address.street2,
      city: address.city,
      state: address.state,
      zip: address.zip,
      phone: address.phone,
      country: 'US',
    };
  }
}
