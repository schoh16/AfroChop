import { describe, expect, it } from 'vitest';
import {
  cartSubtotalCents, cartUnits, changeCartQuantity, dollarsToCents, normalizeUsPhone, reconcileCart,
  validateGroceryAddress, type GroceryProduct,
} from './grocery';

const product = (id: string, stock: number, priceCents = 500): GroceryProduct => ({
  id, name: id, description: '', ingredients: '', allergenNotice: '', imageUrl: null, priceCents, stock,
});

describe('grocery cart', () => {
  it('caps quantities at stock and the 20-unit order limit', () => {
    const rice = product('rice', 3);
    const oil = product('oil', 50);
    let cart = changeCartQuantity({}, rice, 5);
    expect(cart).toEqual({ rice: 3 });
    cart = changeCartQuantity(cart, oil, 30);
    expect(cart).toEqual({ rice: 3, oil: 17 });
    expect(cartUnits(cart)).toBe(20);
    expect(changeCartQuantity(cart, rice, -3)).toEqual({ oil: 17 });
    expect(cartSubtotalCents(cart, [rice, oil])).toBe(20 * 500);
  });

  it('drops missing products and lowers quantities to fresh stock', () => {
    expect(reconcileCart({ rice: 4, gone: 2, oil: 1 }, [product('rice', 2), product('oil', 0)])).toEqual({ rice: 2 });
  });
});

describe('grocery shipping address', () => {
  it('normalizes US phone numbers to E.164', () => {
    expect(normalizeUsPhone('(410) 555-0100')).toBe('+14105550100');
    expect(normalizeUsPhone('1 410 555 0100')).toBe('+14105550100');
    expect(normalizeUsPhone('+44 20 1234 5678')).toBe('+442012345678');
  });

  it('accepts a complete US address and rejects bad state or ZIP', () => {
    const base = { name: ' Ada ', street1: '1 Main St', street2: ' ', city: 'Baltimore', state: 'md', zip: '21201', phone: '410-555-0100' };
    expect(validateGroceryAddress(base).value).toEqual({
      name: 'Ada', street1: '1 Main St', city: 'Baltimore', state: 'MD', zip: '21201', phone: '+14105550100',
    });
    expect(validateGroceryAddress({ ...base, state: 'UK' }).error).toMatch(/state/);
    expect(validateGroceryAddress({ ...base, zip: 'SW1A' }).error).toMatch(/ZIP/);
  });

  it('parses dollar prices without floating point drift', () => {
    expect(dollarsToCents('$12.99')).toBe(1299);
    expect(dollarsToCents('4.1')).toBe(410);
    expect(dollarsToCents('1.234')).toBeNull();
  });
});
