export type GroceryAddress = {
  name: string;
  street1: string;
  street2?: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
};

export type GroceryProduct = {
  id: string;
  name: string;
  description: string;
  ingredients: string;
  allergenNotice: string;
  imageUrl: string | null;
  priceCents: number;
  stock: number;
};

export type GroceryAdminProduct = GroceryProduct & {
  weightOz: number;
  lengthIn: number;
  widthIn: number;
  heightIn: number;
  taxCode: string;
  active: boolean;
  updatedAt: string;
};

export type GroceryCatalog = { open: boolean; name: string; products: GroceryProduct[] };

export type GroceryRate = { id: string; amountCents: number; service: string; estimatedDays: number | null };

export type GroceryOrderStatus = 'quoted' | 'awaiting_payment' | 'paid' | 'fulfilled' | 'expired';

export type GroceryOrder = {
  id: string;
  status: GroceryOrderStatus;
  fulfillment: 'shipping' | 'pickup';
  subtotalCents: number;
  shippingCents: number | null;
  shippingService: string | null;
  taxCents: number | null;
  totalCents: number | null;
  quoteExpiresAt: string;
  checkoutExpiresAt: string | null;
  checkoutUrl: string | null;
  lastError: string | null;
  trackingNumber: string | null;
  createdAt: string;
  items: { id: string; productId: string; name: string; priceCents: number; quantity: number }[];
};

export type GroceryQuote = GroceryOrder & { rates: GroceryRate[] };

export type GroceryCart = Record<string, number>;

export const MAX_GROCERY_UNITS = 20;

export const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS',
  'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC',
  'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
] as const;

export const groceryStatusLabels: Record<GroceryOrderStatus, string> = {
  quoted: 'Quote ready · choose shipping to pay',
  awaiting_payment: 'Waiting for payment',
  paid: 'Paid · preparing your package',
  fulfilled: 'Shipped',
  expired: 'Expired · start a new order',
};

export const emptyGroceryAddress: GroceryAddress = {
  name: '', street1: '', street2: '', city: '', state: '', zip: '', phone: '',
};

export function formatCents(cents: number | null | undefined) {
  return `$${((cents ?? 0) / 100).toFixed(2)}`;
}

export function cartUnits(cart: GroceryCart) {
  return Object.values(cart).reduce((sum, quantity) => sum + quantity, 0);
}

export function cartSubtotalCents(cart: GroceryCart, products: GroceryProduct[]) {
  return products.reduce((sum, product) => sum + product.priceCents * (cart[product.id] ?? 0), 0);
}

export function changeCartQuantity(cart: GroceryCart, product: GroceryProduct, delta: number): GroceryCart {
  const current = cart[product.id] ?? 0;
  const roomLeft = MAX_GROCERY_UNITS - (cartUnits(cart) - current);
  const next = Math.max(0, Math.min(current + delta, product.stock, roomLeft));
  const { [product.id]: _removed, ...rest } = cart;
  return next ? { ...rest, [product.id]: next } : rest;
}

/** Drops products that disappeared and caps quantities at the latest stock. */
export function reconcileCart(cart: GroceryCart, products: GroceryProduct[]): GroceryCart {
  const result: GroceryCart = {};
  for (const product of products) {
    const quantity = Math.min(cart[product.id] ?? 0, product.stock);
    if (quantity > 0) result[product.id] = quantity;
  }
  return result;
}

/** Converts a US phone number typed in any common format to E.164. */
export function normalizeUsPhone(value: string) {
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (trimmed.startsWith('+')) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return trimmed;
}

export function validateGroceryAddress(address: GroceryAddress): { value?: GroceryAddress; error?: string } {
  const value: GroceryAddress = {
    name: address.name.trim(),
    street1: address.street1.trim(),
    city: address.city.trim(),
    state: address.state.trim().toUpperCase(),
    zip: address.zip.trim(),
    phone: normalizeUsPhone(address.phone),
  };
  const street2 = address.street2?.trim();
  if (street2) value.street2 = street2;
  if (!value.name || !value.street1 || !value.city) return { error: 'Enter the recipient name, street and city.' };
  if (!(US_STATES as readonly string[]).includes(value.state)) return { error: 'Choose a US state.' };
  if (!/^\d{5}(-\d{4})?$/.test(value.zip)) return { error: 'Enter a 5-digit ZIP code.' };
  if (!/^\+[1-9]\d{7,14}$/.test(value.phone)) return { error: 'Enter a phone number the carrier can call.' };
  return { value };
}

export function dollarsToCents(value: string) {
  const trimmed = value.trim().replace(/^\$/, '');
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  return Math.round(Number(trimmed) * 100);
}
