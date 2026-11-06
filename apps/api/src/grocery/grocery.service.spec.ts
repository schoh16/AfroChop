import { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GroceryService } from './grocery.service.js';
import { ShippoService } from './shippo.service.js';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  customer: vi.fn(),
  retrieve: vi.fn(),
  event: vi.fn(),
}));
vi.mock('stripe', () => ({
  default: class {
    checkout = { sessions: { create: mocks.create, retrieve: mocks.retrieve } };
    customers = { create: mocks.customer };
    webhooks = { constructEvent: mocks.event };
  },
}));

function setup() {
  const settings: Record<string, string> = {
    GROCERY_OWNER_USER_ID: 'owner',
    STRIPE_SECRET_KEY: 'sk_test_dummy',
    GROCERY_STRIPE_WEBHOOK_SECRET: 'whsec_dummy',
    GROCERY_CHECKOUT_RETURN_URL: 'https://afrochop.example/grocery',
    VERIFICATION_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  };
  const db = {
    user: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn() },
    groceryStore: { findUnique: vi.fn(), upsert: vi.fn() },
    groceryProduct: {
      findMany: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    groceryOrder: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
    },
    adminAuditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  };
  db.$transaction.mockImplementation((callback) => callback(db));
  db.user.findUnique.mockResolvedValue({
    id: 'owner',
    role: 'admin',
    isActive: true,
  });
  const shippo = { rates: vi.fn() };
  const service = new GroceryService(
    db as never,
    new ConfigService(settings),
    shippo as never,
  );
  return { settings, db, service, shippo };
}

describe('owner grocery store', () => {
  beforeEach(() => vi.clearAllMocks());

  it('persists explicit product photo removal and audits the update', async () => {
    const { service, db } = setup();
    db.groceryProduct.updateMany.mockResolvedValue({ count: 1 });
    db.groceryProduct.findUniqueOrThrow.mockResolvedValue({ id: 'product', imageUrl: null });
    const product = await service.saveProduct('owner', {
      name: 'Palm oil', description: 'Red palm oil', ingredients: 'Palm oil', allergenNotice: 'See label',
      imageUrl: null, priceCents: 500, stock: 5, weightOz: 16, lengthIn: 4, widthIn: 4, heightIn: 8,
      taxCode: 'txcd_10000000', active: true, expectedUpdatedAt: '2026-11-06T12:00:00Z',
    }, 'product');
    expect(db.groceryProduct.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ imageUrl: null }),
    }));
    expect(product.imageUrl).toBeNull();
    expect(db.adminAuditLog.create).toHaveBeenCalled();
  });

  it('refuses product management by other admins or independent sellers', async () => {
    const { service, db } = setup();
    await expect(service.products('other-admin')).rejects.toThrow(
      'Only the AfroChop store owner',
    );
    await expect(service.products('farmer')).rejects.toThrow(
      'Only the AfroChop store owner',
    );
    expect(db.groceryProduct.findMany).not.toHaveBeenCalled();
  });

  it('requires the configured owner to be an active administrator', async () => {
    const { service, db } = setup();
    db.user.findUnique.mockResolvedValue({
      id: 'owner',
      role: 'customer',
      isActive: true,
    });
    await expect(service.products('owner')).rejects.toThrow(
      'active owner administrator',
    );
  });

  it('keeps the catalog closed without store setup', async () => {
    const { service, db } = setup();
    db.groceryStore.findUnique.mockResolvedValue(null);
    expect(await service.catalog()).toMatchObject({
      open: false,
      products: [],
    });
    expect(db.groceryProduct.findMany).not.toHaveBeenCalled();
  });

  it('stores the origin encrypted and logs no address in the audit event', async () => {
    const { service, db } = setup();
    const origin = {
      name: 'Owner',
      street1: '123 Private Street',
      city: 'La Plata',
      state: 'MD',
      zip: '20646',
      phone: '+14155550123',
    };
    await service.saveSettings('owner', {
      origin,
      pickupInstructions: 'Collect during opening hours',
      enabled: false,
    });
    const saved =
      db.groceryStore.upsert.mock.calls[0][0].create.originEncrypted;
    expect(saved).toMatch(/^v1\./);
    expect(saved).not.toContain('123 Private Street');
    expect(JSON.stringify(db.adminAuditLog.create.mock.calls)).not.toContain(
      '123 Private Street',
    );
  });

  it('calculates quotes from server prices and excludes private addresses from order lists', async () => {
    const { service, db } = setup();
    const origin = {
      name: 'Test Store',
      street1: '123 Private Street',
      city: 'La Plata',
      state: 'MD',
      zip: '20646',
      phone: '+14155550123',
    };
    await service.saveSettings('owner', {
      origin,
      pickupInstructions: 'Open noon to five',
      enabled: true,
    });
    db.groceryStore.findUnique.mockResolvedValue({
      ...db.groceryStore.upsert.mock.calls[0][0].create,
      id: 'afrochop',
      updatedAt: new Date(),
    });
    db.groceryProduct.findMany.mockResolvedValue([
      {
        id: 'product',
        name: 'Plantain chips',
        stock: 4,
        priceCents: 500,
        taxCode: 'txcd_40060000',
      },
    ]);
    db.groceryOrder.create.mockImplementation(({ data }) => ({
      ...data,
      id: 'order',
      items: data.items.create,
    }));
    const result = await service.quote('customer', {
      fulfillment: 'pickup',
      items: [{ productId: 'product', quantity: 2 }],
    });
    expect(result.subtotalCents).toBe(1000);
    expect(result.rates).toEqual([
      {
        id: 'pickup',
        amountCents: 0,
        service: 'Store pickup',
        estimatedDays: null,
      },
    ]);
    expect(result).not.toHaveProperty('destinationEncrypted');
    expect(result.pickup?.address.street1).toBe('123 Private Street');
  });

  it.each([
    {
      items: [
        { productId: 'product', quantity: 11 },
        { productId: 'product-2', quantity: 10 },
      ],
    },
    {
      items: [
        { productId: 'product', quantity: 1 },
        { productId: 'product', quantity: 1 },
      ],
    },
  ])(
    'rejects excessive or duplicated cart units before contacting Shippo',
    async ({ items }) => {
      const { service, db, shippo } = setup();
      db.groceryStore.findUnique.mockResolvedValue({
        id: 'afrochop',
        ownerId: 'owner',
        enabled: true,
      });
      await expect(
        service.quote('customer', { fulfillment: 'pickup', items }),
      ).rejects.toThrow('20 packaged units');
      expect(shippo.rates).not.toHaveBeenCalled();
      expect(db.groceryOrder.create).not.toHaveBeenCalled();
    },
  );

  it('does not create a checkout when another buyer has reserved the available stock', async () => {
    const { service, db } = setup();
    const now = new Date();
    db.groceryStore.findUnique.mockResolvedValue({
      id: 'afrochop',
      ownerId: 'owner',
      enabled: true,
      updatedAt: now,
    });
    db.groceryOrder.findFirst.mockResolvedValue({
      id: 'order',
      customerId: 'customer',
      status: 'quoted',
      originVersion: now,
      createdAt: now,
      quoteExpiresAt: new Date(Date.now() + 60000),
      rates: [
        {
          id: 'pickup',
          amountCents: 0,
          service: 'Store pickup',
          estimatedDays: null,
        },
      ],
      items: [
        {
          productId: 'product',
          quantity: 1,
          priceCents: 500,
          taxCode: 'txcd_40060000',
        },
      ],
    });
    db.groceryOrder.updateMany.mockResolvedValue({ count: 1 });
    db.groceryProduct.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.checkout('customer', 'order', 'pickup'),
    ).rejects.toThrow('Price, packaging, or stock');
    expect(db.groceryProduct.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          active: true,
          stock: { gte: 1 },
          priceCents: 500,
        }),
        data: { stock: { decrement: 1 } },
      }),
    );
    expect(mocks.create).not.toHaveBeenCalled();
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
  });

  it('rejects stale owner stock edits without overwriting reserved units', async () => {
    const { service, db } = setup();
    db.groceryProduct.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.saveProduct(
        'owner',
        {
          name: 'Chips',
          description: 'Plantain chips',
          ingredients: 'Plantains',
          allergenNotice: 'None declared',
          priceCents: 500,
          stock: 10,
          weightOz: 12,
          lengthIn: 5,
          widthIn: 4,
          heightIn: 3,
          taxCode: 'txcd_40060000',
          active: true,
          expectedUpdatedAt: '2026-11-05T00:00:00Z',
        },
        'product',
      ),
    ).rejects.toThrow('stock has changed');
    expect(db.adminAuditLog.create).not.toHaveBeenCalled();
  });

  it('refuses live payment keys without deliberate production enablement', async () => {
    const { service, settings, db } = setup();
    settings.STRIPE_SECRET_KEY = 'sk_live_dummy';
    await expect(
      service.checkout('customer', 'order', 'pickup'),
    ).rejects.toThrow('Live grocery payments');
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a Stripe session belonging to another customer order during operator repair', async () => {
    const { service, db } = setup();
    db.groceryOrder.findFirst.mockResolvedValue({
      id: 'order',
      stripeSessionId: null,
      status: 'awaiting_payment',
    });
    mocks.retrieve.mockResolvedValue({
      id: 'cs_test_wrong',
      metadata: { groceryOrderId: 'other-order' },
      client_reference_id: 'other-order',
    });
    await expect(
      service.reconcile('owner', 'order', true, 'cs_test_wrong'),
    ).rejects.toThrow('does not belong');
    expect(db.groceryOrder.updateMany).not.toHaveBeenCalled();
  });

  it('makes signed paid grocery events idempotent and never releases paid stock', async () => {
    const { service, db } = setup();
    const order = {
      id: 'order',
      status: 'awaiting_payment',
      stripeSessionId: 'cs_test_1',
      subtotalCents: 1000,
      shippingCents: 250,
      items: [{ productId: 'product', quantity: 2 }],
    };
    db.groceryOrder.findUnique.mockResolvedValue(order);
    db.groceryOrder.updateMany.mockImplementation(({ where, data }) => {
      if (order.status !== where.status) return { count: 0 };
      Object.assign(order, data);
      return { count: 1 };
    });
    const session = {
      id: 'cs_test_1',
      metadata: { groceryOrderId: 'order' },
      client_reference_id: 'order',
      payment_status: 'paid',
      currency: 'usd',
      amount_subtotal: 1000,
      amount_total: 1300,
      total_details: { amount_shipping: 250, amount_tax: 50 },
      automatic_tax: { status: 'complete' },
    };
    mocks.event.mockReturnValue({
      type: 'checkout.session.completed',
      data: { object: session },
    });
    await service.webhook(Buffer.from('{}'), 'signature');
    await service.webhook(Buffer.from('{}'), 'signature');
    expect(order.status).toBe('paid');
    expect(db.groceryProduct.update).not.toHaveBeenCalled();
  });

  it('releases reserved stock once after a signed expired checkout', async () => {
    const { service, db } = setup();
    db.groceryOrder.findUnique.mockResolvedValue({
      id: 'order',
      stripeSessionId: 'cs_test_1',
      items: [{ productId: 'product', quantity: 2 }],
    });
    db.groceryOrder.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    mocks.event.mockReturnValue({
      type: 'checkout.session.expired',
      data: {
        object: {
          id: 'cs_test_1',
          status: 'expired',
          payment_status: 'unpaid',
          metadata: { groceryOrderId: 'order' },
          client_reference_id: 'order',
        },
      },
    });
    await service.webhook(Buffer.from('{}'), 'signature');
    await service.webhook(Buffer.from('{}'), 'signature');
    expect(db.groceryProduct.update).toHaveBeenCalledExactlyOnceWith({
      where: { id: 'product' },
      data: { stock: { increment: 2 } },
    });
  });

  it('rejects a payment with different quoted totals', async () => {
    const { service, db } = setup();
    db.groceryOrder.findUnique.mockResolvedValue({
      id: 'order',
      stripeSessionId: 'cs_test_1',
      subtotalCents: 1000,
      shippingCents: 250,
      items: [],
    });
    mocks.event.mockReturnValue({
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_1',
          payment_status: 'paid',
          currency: 'usd',
          metadata: { groceryOrderId: 'order' },
          client_reference_id: 'order',
          amount_subtotal: 1,
          total_details: { amount_shipping: 0 },
          automatic_tax: { status: 'complete' },
        },
      },
    });
    await expect(
      service.webhook(Buffer.from('{}'), 'signature'),
    ).rejects.toThrow('totals');
    expect(db.groceryOrder.updateMany).not.toHaveBeenCalled();
  });

  it('does not fulfill unpaid orders', async () => {
    const { service, db } = setup();
    db.groceryOrder.findUniqueOrThrow.mockResolvedValue({
      fulfillment: 'pickup',
    });
    db.groceryOrder.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.fulfill('owner', 'order')).rejects.toThrow(
      'Only paid',
    );
  });
});

describe('Shippo rate calculation', () => {
  const address = {
    name: 'Test',
    street1: '123 Test Street',
    city: 'La Plata',
    state: 'MD',
    zip: '20646',
    phone: '+14155550123',
  };
  it('quotes actual packed units in USD without buying labels', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({
        status: 'SUCCESS',
        rates: [
          {
            object_id: 'rate-1',
            amount: '12.34',
            currency: 'USD',
            provider: 'USPS',
            servicelevel: { name: 'Ground' },
            estimated_days: 3,
          },
        ],
      }),
    );
    const service = new ShippoService(
      new ConfigService({ SHIPPO_API_TOKEN: 'shippo_test_dummy' }),
    );
    try {
      const rates = await service.rates(
        address,
        { ...address, state: 'AK', zip: '99501' },
        [
          {
            quantity: 2,
            product: {
              weightOz: 12,
              lengthIn: 5,
              widthIn: 4,
              heightIn: 3,
            } as never,
          },
        ],
      );
      expect(rates[0].amountCents).toBe(1234);
      const body = fetchMock.mock.calls[0][1]?.body;
      if (typeof body !== 'string')
        throw new Error('Expected a JSON shipping request body.');
      const request = JSON.parse(body);
      expect(request.address_to.country).toBe('US');
      expect(request.parcels).toHaveLength(2);
      expect(request.parcels[0]).toMatchObject({
        weight: '12',
        mass_unit: 'oz',
        length: '5',
        distance_unit: 'in',
      });
      expect(fetchMock.mock.calls[0][0]).toBe(
        'https://api.goshippo.com/shipments/',
      );
    } finally {
      fetchMock.mockRestore();
    }
  });
});
