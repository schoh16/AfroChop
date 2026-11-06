import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GroceryOrder, GroceryOrderItem, Prisma } from '@prisma/client';
import Stripe from 'stripe';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  decryptVerificationValue,
  encryptVerificationValue,
} from '../safety/verification-crypto.js';
import {
  GroceryProductDto,
  GroceryQuoteDto,
  StoreSettingsDto,
} from './grocery.dto.js';
import { ShippoService, shippingRatesSchema } from './shippo.service.js';

const addressSchema = z.object({
  name: z.string(),
  street1: z.string(),
  street2: z.string().optional(),
  city: z.string(),
  state: z.string(),
  zip: z.string(),
  phone: z.string(),
});
type Order = GroceryOrder & { items: GroceryOrderItem[] };
const publicProductSelect = {
  id: true,
  name: true,
  description: true,
  ingredients: true,
  allergenNotice: true,
  imageUrl: true,
  priceCents: true,
  stock: true,
} satisfies Prisma.GroceryProductSelect;

@Injectable()
export class GroceryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GroceryService.name);
  private timer?: ReturnType<typeof setInterval>;
  private reconciling = false;
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly shippo: ShippoService,
  ) {}

  onModuleInit() {
    if (!this.config.get<string>('STRIPE_SECRET_KEY')) return;
    this.timer = setInterval(() => {
      void this.reconcilePending();
    }, 60000);
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  private async reconcilePending() {
    if (this.reconciling) return;
    this.reconciling = true;
    try {
      const orders = await this.prisma.groceryOrder.findMany({
        where: {
          status: 'awaiting_payment',
          stripeSessionId: { not: null },
          checkoutExpiresAt: { lte: new Date() },
        },
        orderBy: { updatedAt: 'asc' },
        take: 30,
      });
      for (const order of orders) {
        try {
          await this.applySession(
            await this.stripe().checkout.sessions.retrieve(
              order.stripeSessionId!,
            ),
          );
        } catch {
          this.logger.error(
            `Grocery order ${order.id} payment reconciliation failed. Inspect Stripe before changing stock or fulfilling.`,
          );
        }
      }
    } catch {
      this.logger.error(
        'Grocery payment reconciliation queue is unavailable. Inspect database and Stripe configuration.',
      );
    } finally {
      this.reconciling = false;
    }
  }

  private encrypt(value: object) {
    return encryptVerificationValue(
      JSON.stringify(value),
      this.config.get<string>('VERIFICATION_ENCRYPTION_KEY'),
    );
  }
  private address(value: string) {
    return addressSchema.parse(
      JSON.parse(
        decryptVerificationValue(
          value,
          this.config.get<string>('VERIFICATION_ENCRYPTION_KEY'),
        ),
      ),
    );
  }
  private async owner(userId: string) {
    const ownerId = this.config.get<string>('GROCERY_OWNER_USER_ID');
    if (!ownerId)
      throw new ServiceUnavailableException(
        'The AfroChop store owner has not been configured.',
      );
    if (ownerId !== userId)
      throw new ForbiddenException(
        'Only the AfroChop store owner may sell groceries or manage store orders.',
      );
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.isActive || user.role !== 'admin')
      throw new ForbiddenException(
        'An active owner administrator account is required.',
      );
    return ownerId;
  }
  async authorizeOwner(userId: string) {
    await this.owner(userId);
  }
  private async store() {
    const store = await this.prisma.groceryStore.findUnique({
      where: { id: 'afrochop' },
    });
    if (
      !store?.enabled ||
      store.ownerId !== this.config.get<string>('GROCERY_OWNER_USER_ID')
    ) {
      throw new ServiceUnavailableException(
        'The AfroChop grocery store is not open yet.',
      );
    }
    const owner = await this.prisma.user.findUnique({
      where: { id: store.ownerId },
    });
    if (!owner?.isActive || owner.role !== 'admin')
      throw new ServiceUnavailableException(
        'The AfroChop grocery store is temporarily unavailable.',
      );
    return store;
  }
  async catalog() {
    const store = await this.prisma.groceryStore.findUnique({
      where: { id: 'afrochop' },
    });
    if (
      !store?.enabled ||
      store.ownerId !== this.config.get<string>('GROCERY_OWNER_USER_ID')
    ) {
      return { open: false, name: 'AfroChop Grocery Store', products: [] };
    }
    await this.store();
    return {
      open: true,
      name: 'AfroChop Grocery Store',
      products: await this.prisma.groceryProduct.findMany({
        where: { active: true },
        orderBy: { name: 'asc' },
        select: publicProductSelect,
      }),
    };
  }
  async settings(userId: string) {
    await this.owner(userId);
    const store = await this.prisma.groceryStore.findUnique({
      where: { id: 'afrochop' },
    });
    return store
      ? {
          origin: this.address(store.originEncrypted),
          enabled: store.enabled,
          pickupInstructions: store.pickupInstructions,
        }
      : null;
  }
  async saveSettings(userId: string, dto: StoreSettingsDto) {
    const ownerId = await this.owner(userId);
    return this.prisma.$transaction(async (tx) => {
      await tx.groceryStore.upsert({
        where: { id: 'afrochop' },
        create: {
          ownerId,
          originEncrypted: this.encrypt(dto.origin),
          pickupInstructions: dto.pickupInstructions,
          enabled: dto.enabled,
        },
        update: {
          ownerId,
          originEncrypted: this.encrypt(dto.origin),
          pickupInstructions: dto.pickupInstructions,
          enabled: dto.enabled,
        },
      });
      await tx.adminAuditLog.create({
        data: {
          actorId: userId,
          action: 'grocery_store_settings_updated',
          targetType: 'grocery_store',
          targetId: 'afrochop',
        },
      });
      return { saved: true };
    });
  }
  async products(userId: string) {
    await this.owner(userId);
    return this.prisma.groceryProduct.findMany({ orderBy: { name: 'asc' } });
  }
  async saveProduct(userId: string, dto: GroceryProductDto, id?: string) {
    await this.owner(userId);
    const { expectedUpdatedAt, ...data } = dto;
    if (id && !expectedUpdatedAt)
      throw new BadRequestException(
        'Reload the product before updating its stock.',
      );
    return this.prisma.$transaction(async (tx) => {
      if (id) {
        const changed = await tx.groceryProduct.updateMany({
          where: { id, updatedAt: new Date(expectedUpdatedAt!) },
          data,
        });
        if (!changed.count)
          throw new ConflictException(
            'This product or its stock has changed. Reload and edit the current product.',
          );
      }
      const product = id
        ? await tx.groceryProduct.findUniqueOrThrow({ where: { id } })
        : await tx.groceryProduct.create({ data });
      await tx.adminAuditLog.create({
        data: {
          actorId: userId,
          action: 'grocery_product_saved',
          targetType: 'grocery_product',
          targetId: product.id,
        },
      });
      return product;
    });
  }
  async quote(customerId: string, dto: GroceryQuoteDto) {
    const store = await this.store();
    if (dto.fulfillment === 'shipping' && !dto.destination)
      throw new BadRequestException('A full US shipping address is required.');
    if (
      new Set(dto.items.map((item) => item.productId)).size !==
        dto.items.length ||
      dto.items.reduce((sum, item) => sum + item.quantity, 0) > 20
    ) {
      throw new BadRequestException(
        'Use one line per product, with at most 20 packaged units per order.',
      );
    }
    const products = await this.prisma.groceryProduct.findMany({
      where: {
        id: { in: dto.items.map((item) => item.productId) },
        active: true,
      },
    });
    const items = dto.items.map((item) => {
      const product = products.find((product) => product.id === item.productId);
      if (!product || product.stock < item.quantity)
        throw new ConflictException(
          'A product is unavailable or does not have enough stock. Refresh your cart.',
        );
      return { product, quantity: item.quantity };
    });
    const rates =
      dto.fulfillment === 'pickup'
        ? [
            {
              id: 'pickup',
              amountCents: 0,
              service: 'Store pickup',
              estimatedDays: null,
            },
          ]
        : await this.shippo.rates(
            this.address(store.originEncrypted),
            dto.destination!,
            items,
          );
    const order = await this.prisma.groceryOrder.create({
      data: {
        customerId,
        fulfillment: dto.fulfillment,
        rates,
        originVersion: store.updatedAt,
        destinationEncrypted: this.encrypt(
          dto.fulfillment === 'shipping'
            ? dto.destination!
            : this.address(store.originEncrypted),
        ),
        subtotalCents: items.reduce(
          (sum, item) => sum + item.product.priceCents * item.quantity,
          0,
        ),
        quoteExpiresAt: new Date(Date.now() + 10 * 60000),
        items: {
          create: items.map(({ product, quantity }) => ({
            productId: product.id,
            name: product.name,
            priceCents: product.priceCents,
            quantity,
            taxCode: product.taxCode,
          })),
        },
      },
      include: { items: true },
    });
    return {
      ...this.summary(order),
      rates,
      pickup:
        dto.fulfillment === 'pickup'
          ? {
              address: this.address(store.originEncrypted),
              instructions: store.pickupInstructions,
            }
          : null,
    };
  }
  private stripe() {
    const key = this.config.get<string>('STRIPE_SECRET_KEY');
    if (!key)
      throw new ServiceUnavailableException(
        'Grocery payments are not configured.',
      );
    if (
      (key.startsWith('sk_live_') || key.startsWith('rk_live_')) &&
      (this.config.get<string>('GROCERY_LIVE_PAYMENTS_ENABLED') !== 'true' ||
        this.config.get<string>('NODE_ENV') !== 'production')
    ) {
      throw new ServiceUnavailableException(
        'Live grocery payments are not enabled.',
      );
    }
    if (!this.config.get<string>('GROCERY_STRIPE_WEBHOOK_SECRET'))
      throw new ServiceUnavailableException(
        'Payment webhook verification must be configured before checkout.',
      );
    return new Stripe(key, { timeout: 15000, maxNetworkRetries: 1 });
  }
  private returnUrl() {
    const configured = this.config.get<string>('GROCERY_CHECKOUT_RETURN_URL');
    if (!configured)
      throw new ServiceUnavailableException(
        'Grocery checkout return URL is not configured.',
      );
    const url = new URL(configured);
    if (url.protocol !== 'https:')
      throw new ServiceUnavailableException(
        'Grocery checkout requires an HTTPS return URL.',
      );
    return url;
  }
  async checkout(customerId: string, id: string, rateId: string) {
    const stripe = this.stripe();
    const returnUrl = this.returnUrl();
    const store = await this.store();
    let order = await this.prisma.groceryOrder.findFirst({
      where: { id, customerId },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('Grocery order not found.');
    if (order.status === 'paid' || order.status === 'fulfilled')
      throw new ConflictException('This grocery order is already paid.');
    if (order.status === 'expired')
      throw new ConflictException(
        'This checkout expired. Create a new cart quote.',
      );
    if (order.status === 'quoted') {
      const rate = shippingRatesSchema
        .parse(order.rates)
        .find((item) => item.id === rateId);
      if (!rate)
        throw new BadRequestException(
          'Select a shipping rate from this order quote.',
        );
      if (
        order.quoteExpiresAt <= new Date() ||
        order.originVersion.getTime() !== store.updatedAt.getTime()
      ) {
        throw new ConflictException(
          'This shipping quote has expired or the store has changed. Request new rates.',
        );
      }
      const checkoutExpiresAt = new Date(
        Math.floor((Date.now() + 35 * 60000) / 1000) * 1000,
      );
      const original = order;
      try {
        order = await this.prisma.$transaction(
          async (tx) => {
            const claimed = await tx.groceryOrder.updateMany({
              where: { id, status: 'quoted' },
              data: {
                status: 'awaiting_payment',
                shippingRateId: rate.id,
                shippingService: rate.service,
                shippingCents: rate.amountCents,
                checkoutExpiresAt,
              },
            });
            if (claimed.count !== 1)
              throw new ConflictException(
                'Checkout started concurrently. Retry the same order.',
              );
            for (const item of original.items) {
              const held = await tx.groceryProduct.updateMany({
                where: {
                  id: item.productId,
                  active: true,
                  priceCents: item.priceCents,
                  taxCode: item.taxCode,
                  stock: { gte: item.quantity },
                  updatedAt: { lte: original.createdAt },
                },
                data: { stock: { decrement: item.quantity } },
              });
              if (held.count !== 1)
                throw new ConflictException(
                  'Price, packaging, or stock has changed. Request a new quote.',
                );
            }
            return tx.groceryOrder.findUniqueOrThrow({
              where: { id },
              include: { items: true },
            });
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2034'
        )
          throw new ConflictException(
            'Another checkout changed stock. Retry your order.',
          );
        throw error;
      }
    }
    if (order.shippingRateId !== rateId)
      throw new ConflictException(
        'A different shipping rate is already locked for this checkout.',
      );
    if (order.stripeSessionId) {
      const session = await stripe.checkout.sessions.retrieve(
        order.stripeSessionId,
      );
      await this.applySession(session);
      if (session.status !== 'open' || !session.url)
        throw new ConflictException(
          'This checkout is no longer open. Refresh your orders.',
        );
      return { orderId: id, url: session.url };
    }
    if (
      !order.checkoutExpiresAt ||
      order.checkoutExpiresAt <= new Date(Date.now() + 30 * 60000)
    ) {
      this.logger.error(
        `Grocery order ${id} has an unconfirmed checkout creation. Reconcile in Stripe before releasing stock.`,
      );
      throw new ConflictException(
        'Checkout needs payment reconciliation. Contact AfroChop; do not pay a second time.',
      );
    }
    try {
      const destination = order.destinationEncrypted
        ? this.address(order.destinationEncrypted)
        : this.address(store.originEncrypted);
      const address = {
        line1: destination.street1,
        line2: destination.street2,
        city: destination.city,
        state: destination.state,
        postal_code: destination.zip,
        country: 'US',
      };
      const customer = await stripe.customers.create(
        {
          email: (
            await this.prisma.user.findUniqueOrThrow({
              where: { id: customerId },
            })
          ).email,
          address,
          shipping: {
            name: destination.name,
            address,
            phone: destination.phone,
          },
          metadata: { groceryOrderId: id },
        },
        { idempotencyKey: `afrochop-grocery-customer-${id}` },
      );
      const session = await stripe.checkout.sessions.create(
        {
          mode: 'payment',
          allowed_payment_method_types: ['card'],
          client_reference_id: order.id,
          expires_at: Math.floor(order.checkoutExpiresAt.getTime() / 1000),
          metadata: { groceryOrderId: order.id },
          automatic_tax: { enabled: true },
          line_items: order.items.map((item) => ({
            quantity: item.quantity,
            price_data: {
              currency: 'usd',
              unit_amount: item.priceCents,
              tax_behavior: 'exclusive',
              product_data: { name: item.name, tax_code: item.taxCode },
            },
          })),
          shipping_options: [
            {
              shipping_rate_data: {
                type: 'fixed_amount',
                fixed_amount: { amount: order.shippingCents!, currency: 'usd' },
                display_name: order.shippingService!,
                tax_behavior: 'exclusive',
              },
            },
          ],
          customer: customer.id,
          success_url: `${returnUrl.toString()}${returnUrl.search ? '&' : '?'}grocery=success`,
          cancel_url: `${returnUrl.toString()}${returnUrl.search ? '&' : '?'}grocery=cancelled`,
          payment_intent_data: { metadata: { groceryOrderId: id } },
        },
        { idempotencyKey: `afrochop-grocery-${id}` },
      );
      if (!session.url) throw new Error('Checkout URL missing');
      await this.prisma.groceryOrder.update({
        where: { id },
        data: {
          stripeSessionId: session.id,
          checkoutUrl: session.url,
          lastError: null,
        },
      });
      return { orderId: id, url: session.url };
    } catch {
      this.logger.error(
        `Grocery checkout creation failed for ${id}. Retry the same order or reconcile its Stripe idempotency key; stock remains reserved.`,
      );
      await this.prisma.groceryOrder.update({
        where: { id },
        data: {
          lastError:
            'Checkout creation needs reconciliation. Retry the same order promptly; inspect Stripe before releasing stock.',
        },
      });
      throw new ServiceUnavailableException(
        'Could not open checkout. Retry this same order; contact AfroChop if it persists.',
      );
    }
  }
  private summary(order: Order) {
    const { destinationEncrypted, rates, ...safe } = order;
    void destinationEncrypted;
    void rates;
    return safe;
  }
  async orders(customerId: string) {
    return (
      await this.prisma.groceryOrder.findMany({
        where: { customerId },
        include: { items: true },
        orderBy: { createdAt: 'desc' },
        take: 100,
      })
    ).map((order) => this.summary(order));
  }
  async adminOrders(userId: string) {
    await this.owner(userId);
    return (
      await this.prisma.groceryOrder.findMany({
        include: { items: true },
        orderBy: { createdAt: 'desc' },
        take: 100,
      })
    ).map((order) => this.summary(order));
  }
  async orderAddress(userId: string, id: string) {
    await this.owner(userId);
    const order = await this.prisma.groceryOrder.findUniqueOrThrow({
      where: { id },
    });
    await this.prisma.adminAuditLog.create({
      data: {
        actorId: userId,
        action: 'grocery_order_address_accessed',
        targetType: 'grocery_order',
        targetId: id,
      },
    });
    return order.destinationEncrypted
      ? this.address(order.destinationEncrypted)
      : null;
  }
  async reconcile(
    customerId: string,
    id: string,
    admin = false,
    stripeSessionId?: string,
  ) {
    if (admin) await this.owner(customerId);
    const order = await this.prisma.groceryOrder.findFirst({
      where: { id, ...(admin ? {} : { customerId }) },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('Grocery order not found.');
    const sessionId =
      order.stripeSessionId ?? (admin ? stripeSessionId : undefined);
    if (sessionId) {
      const session = await this.stripe().checkout.sessions.retrieve(sessionId);
      if (
        session.metadata?.groceryOrderId !== id ||
        session.client_reference_id !== id
      )
        throw new ConflictException(
          'This Stripe session does not belong to the grocery order.',
        );
      if (!order.stripeSessionId) {
        const linked = await this.prisma.groceryOrder.updateMany({
          where: { id, stripeSessionId: null },
          data: { stripeSessionId: session.id, checkoutUrl: session.url },
        });
        if (!linked.count)
          throw new ConflictException(
            'The checkout was reconciled concurrently. Refresh the order before retrying.',
          );
      }
      await this.applySession(session);
    } else if (order.status === 'awaiting_payment') {
      throw new ConflictException(
        'Find this grocery order in Stripe and enter its checkout session ID to reconcile payment. Do not release its reserved stock blindly.',
      );
    }
    return this.summary(
      await this.prisma.groceryOrder.findUniqueOrThrow({
        where: { id },
        include: { items: true },
      }),
    );
  }
  async fulfill(userId: string, id: string, trackingNumber?: string) {
    await this.owner(userId);
    const order = await this.prisma.groceryOrder.findUniqueOrThrow({
      where: { id },
    });
    if (order.fulfillment === 'shipping' && !trackingNumber)
      throw new BadRequestException(
        'Enter the carrier tracking number before marking a shipping order fulfilled.',
      );
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.groceryOrder.updateMany({
        where: { id, status: 'paid' },
        data: { status: 'fulfilled', trackingNumber },
      });
      if (!updated.count)
        throw new ConflictException(
          'Only paid grocery orders can be fulfilled.',
        );
      await tx.adminAuditLog.create({
        data: {
          actorId: userId,
          action: 'grocery_order_fulfilled',
          targetType: 'grocery_order',
          targetId: id,
        },
      });
      return { saved: true };
    });
  }
  async webhook(raw: Buffer | undefined, signature: string | undefined) {
    if (!raw || !signature)
      throw new BadRequestException(
        'Stripe signature and raw request body are required.',
      );
    let event: Stripe.Event;
    try {
      event = this.stripe().webhooks.constructEvent(
        raw,
        signature,
        this.config.get<string>('GROCERY_STRIPE_WEBHOOK_SECRET')!,
      );
    } catch {
      throw new UnauthorizedException(
        'Stripe webhook signature verification failed.',
      );
    }
    if (
      event.type === 'checkout.session.completed' ||
      event.type === 'checkout.session.expired'
    ) {
      await this.applySession(event.data.object);
    }
    return { received: true };
  }
  private async applySession(session: Stripe.Checkout.Session) {
    const id = session.metadata?.groceryOrderId;
    if (!id) return;
    await this.prisma.$transaction(async (tx) => {
      const order = await tx.groceryOrder.findUnique({
        where: { id },
        include: { items: true },
      });
      if (
        !order ||
        (order.stripeSessionId && order.stripeSessionId !== session.id) ||
        session.client_reference_id !== id
      ) {
        throw new ConflictException(
          'Grocery payment reference does not match the order.',
        );
      }
      if (session.payment_status === 'paid') {
        if (
          session.currency !== 'usd' ||
          session.amount_subtotal !== order.subtotalCents ||
          session.total_details?.amount_shipping !== order.shippingCents ||
          session.automatic_tax?.status !== 'complete' ||
          session.amount_total !==
            order.subtotalCents +
              order.shippingCents! +
              (session.total_details?.amount_tax ?? 0)
        ) {
          throw new ConflictException(
            'Grocery payment totals or tax calculation do not match. Reconcile in Stripe.',
          );
        }
        await tx.groceryOrder.updateMany({
          where: { id, status: 'awaiting_payment' },
          data: {
            status: 'paid',
            stripeSessionId: session.id,
            totalCents: session.amount_total,
            taxCents: session.total_details.amount_tax,
            lastError: null,
          },
        });
      } else if (session.status === 'expired') {
        const released = await tx.groceryOrder.updateMany({
          where: { id, status: 'awaiting_payment' },
          data: {
            status: 'expired',
            stripeSessionId: session.id,
            lastError: null,
          },
        });
        if (released.count)
          for (const item of order.items) {
            await tx.groceryProduct.update({
              where: { id: item.productId },
              data: { stock: { increment: item.quantity } },
            });
          }
      }
    });
  }
}
