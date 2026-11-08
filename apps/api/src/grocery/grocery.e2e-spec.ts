import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  type INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import {
  JwtAuthGuard,
  type AuthenticatedRequest,
} from '../auth/jwt-auth.guard.js';
import { GroceryController } from './grocery.controller.js';
import { GroceryService } from './grocery.service.js';
import { MediaService } from '../media/media.service.js';

vi.mock('@nestjs/jwt', () => ({ JwtService: class TestJwtService {} }));
class TestGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const role = req.headers.authorization?.replace('Bearer ', '') as
      UserRole | undefined;
    if (!role || !Object.values(UserRole).includes(role))
      throw new UnauthorizedException();
    req.user = { sub: 'user-id', role };
    return true;
  }
}
describe('Grocery HTTP authorization and validation', () => {
  let app: INestApplication<App>;
  const service = {
    catalog: vi.fn(),
    settings: vi.fn(),
    saveProduct: vi.fn(),
    quote: vi.fn(),
    authorizeOwner: vi.fn(),
    orders: vi.fn(),
    checkout: vi.fn(),
    fulfill: vi.fn(),
  };
  const media = { uploadGroceryProductImage: vi.fn() };
  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await Test.createTestingModule({
      controllers: [GroceryController],
      providers: [
        { provide: GroceryService, useValue: service },
        { provide: MediaService, useValue: media },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(TestGuard)
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  });
  afterEach(async () => {
    await app.close();
  });

  it('permits a public catalog but no unauthenticated administration', async () => {
    service.catalog.mockResolvedValue({ open: false, products: [] });
    await request(app.getHttpServer())
      .get('/api/grocery')
      .expect(200)
      .expect('Cache-Control', 'no-store');
    await request(app.getHttpServer())
      .get('/api/grocery/admin/settings')
      .expect(401);
  });
  it.each(['customer', 'chef', 'farmer'])(
    'blocks store administration for %s',
    async (role) => {
      await request(app.getHttpServer())
        .get('/api/grocery/admin/settings')
        .set('Authorization', `Bearer ${role}`)
        .expect(403);
      expect(service.settings).not.toHaveBeenCalled();
    },
  );
  it('rejects international destinations and malformed quantities', async () => {
    await request(app.getHttpServer())
      .post('/api/grocery/quotes')
      .set('Authorization', 'Bearer customer')
      .send({
        fulfillment: 'shipping',
        destination: {
          name: 'Test',
          street1: '1 Test Street',
          city: 'London',
          state: 'UK',
          zip: 'SW1A',
          phone: '+442012345678',
        },
        items: [
          { productId: '11111111-1111-4111-8111-111111111111', quantity: 1.5 },
        ],
      })
      .expect(400);
    expect(service.quote).not.toHaveBeenCalled();
  });
  it('rejects missing price, package and allergen information', async () => {
    await request(app.getHttpServer())
      .post('/api/grocery/admin/products')
      .set('Authorization', 'Bearer admin')
      .send({
        name: 'Product',
        active: true,
        weightOz: -1,
      })
      .expect(400);
    expect(service.saveProduct).not.toHaveBeenCalled();
  });
  it('returns the live catalog from the store service', async () => {
    const catalog = { open: true, name: 'AfroChop Grocery Store', products: [{ id: 'p1' }] };
    service.catalog.mockResolvedValue(catalog);
    await request(app.getHttpServer()).get('/api/grocery').expect(200).expect(catalog);
    expect(service.catalog).toHaveBeenCalledTimes(1);
  });
  it('quotes a valid US shipping cart for a signed-in customer', async () => {
    service.quote.mockResolvedValue({ id: 'order', rates: [] });
    const body = {
      fulfillment: 'shipping',
      destination: {
        name: 'Ada Customer', street1: '1 Main Street', city: 'Baltimore', state: 'MD',
        zip: '21201', phone: '+14105550100',
      },
      items: [{ productId: '11111111-1111-4111-8111-111111111111', quantity: 2 }],
    };
    await request(app.getHttpServer()).post('/api/grocery/quotes').send(body).expect(401);
    await request(app.getHttpServer()).post('/api/grocery/quotes')
      .auth('customer', { type: 'bearer' }).send(body).expect(201);
    expect(service.quote).toHaveBeenCalledWith('user-id', expect.objectContaining({ fulfillment: 'shipping' }));
  });
  it('opens checkout only for customers and cooks', async () => {
    service.checkout.mockResolvedValue({ orderId: 'order', url: 'https://checkout.stripe.com/test' });
    const path = '/api/grocery/orders/11111111-1111-4111-8111-111111111111/checkout';
    await request(app.getHttpServer()).post(path).auth('admin', { type: 'bearer' }).send({ rateId: 'rate' }).expect(403);
    await request(app.getHttpServer()).post(path).auth('customer', { type: 'bearer' }).send({ rateId: 'rate' })
      .expect(201).expect({ orderId: 'order', url: 'https://checkout.stripe.com/test' });
    expect(service.checkout).toHaveBeenCalledWith('user-id', '11111111-1111-4111-8111-111111111111', 'rate');
  });
  it('lets the store administrator save a complete product', async () => {
    service.saveProduct.mockResolvedValue({ id: 'product' });
    await request(app.getHttpServer()).put('/api/grocery/admin/products/11111111-1111-4111-8111-111111111111')
      .auth('admin', { type: 'bearer' }).send({
        name: 'Palm oil', description: 'Red palm oil', ingredients: 'Palm oil', allergenNotice: 'See label',
        imageUrl: null, priceCents: 500, stock: 5, weightOz: 16, lengthIn: 4, widthIn: 4, heightIn: 8,
        taxCode: 'txcd_40060003', active: true, expectedUpdatedAt: '2026-11-06T12:00:00Z',
      }).expect(200);
    expect(service.saveProduct).toHaveBeenCalledWith('user-id', expect.objectContaining({ priceCents: 500 }),
      '11111111-1111-4111-8111-111111111111');
  });
  it('authorizes the owner before storing product images', async () => {
    await request(app.getHttpServer())
      .post('/api/grocery/admin/products/image')
      .set('Authorization', 'Bearer customer')
      .attach('file', Buffer.from('photo'), { filename: 'product.jpg', contentType: 'image/jpeg' })
      .expect(403);
    expect(media.uploadGroceryProductImage).not.toHaveBeenCalled();

    service.authorizeOwner.mockRejectedValueOnce(new ForbiddenException('Only the AfroChop store owner may sell groceries.'));
    await request(app.getHttpServer())
      .post('/api/grocery/admin/products/image')
      .set('Authorization', 'Bearer admin')
      .attach('file', Buffer.from('photo'), { filename: 'product.jpg', contentType: 'image/jpeg' })
      .expect(403);
    expect(media.uploadGroceryProductImage).not.toHaveBeenCalled();

    media.uploadGroceryProductImage.mockResolvedValue({ imageUrl: 'https://images.example.test/product.jpg' });
    await request(app.getHttpServer())
      .post('/api/grocery/admin/products/image')
      .set('Authorization', 'Bearer admin')
      .attach('file', Buffer.from('photo'), { filename: 'product.jpg', contentType: 'image/jpeg' })
      .expect(201).expect({ imageUrl: 'https://images.example.test/product.jpg' });
    expect(media.uploadGroceryProductImage).toHaveBeenCalledWith('user-id', expect.anything());
  });
  it('requires a tracking number format when fulfilling', async () => {
    await request(app.getHttpServer()).patch('/api/grocery/admin/orders/11111111-1111-4111-8111-111111111111/fulfill')
      .auth('admin', { type: 'bearer' }).send({ trackingNumber: '<script>' }).expect(400);
    expect(service.fulfill).not.toHaveBeenCalled();
    service.fulfill.mockResolvedValue({ saved: true });
    await request(app.getHttpServer()).patch('/api/grocery/admin/orders/11111111-1111-4111-8111-111111111111/fulfill')
      .auth('admin', { type: 'bearer' }).send({ trackingNumber: '9400 1000 0000 0000 0000 00' }).expect(200);
  });
  it('lists a customer order history', async () => {
    service.orders.mockResolvedValue([{ id: 'order' }]);
    await request(app.getHttpServer()).get('/api/grocery/orders/mine').auth('customer', { type: 'bearer' })
      .expect(200).expect([{ id: 'order' }]);
  });
});