import {
  type CanActivate,
  type ExecutionContext,
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
      .expect(410);
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
      .expect(410);
    expect(service.saveProduct).not.toHaveBeenCalled();
  });

  it('blocks product updates after grocery retirement', async () => {
    await request(app.getHttpServer()).put('/api/grocery/admin/products/11111111-1111-4111-8111-111111111111')
      .auth('admin', { type: 'bearer' }).send({
        name: 'Palm oil', description: 'Red palm oil', ingredients: 'Palm oil', allergenNotice: 'See label',
        imageUrl: null, priceCents: 500, stock: 5, weightOz: 16, lengthIn: 4, widthIn: 4, heightIn: 8,
        taxCode: 'txcd_10000000', active: true, expectedUpdatedAt: '2026-11-06T12:00:00Z',
      }).expect(410);
    expect(service.saveProduct).not.toHaveBeenCalled();
  });
  it('blocks product image uploads even for administrators', async () => {
    await request(app.getHttpServer())
      .post('/api/grocery/admin/products/image')
      .set('Authorization', 'customer')
      .attach('file', Buffer.from('photo'), { filename: 'product.jpg', contentType: 'image/jpeg' })
      .expect(403);
    expect(service.authorizeOwner).not.toHaveBeenCalled();
    expect(media.uploadGroceryProductImage).not.toHaveBeenCalled();

    await request(app.getHttpServer())
      .post('/api/grocery/admin/products/image')
      .set('Authorization', 'admin')
      .attach('file', Buffer.from('photo'), { filename: 'product.jpg', contentType: 'image/jpeg' })
      .expect(410);
    expect(media.uploadGroceryProductImage).not.toHaveBeenCalled();

    media.uploadGroceryProductImage.mockResolvedValue({ imageUrl: 'https://images.example.test/product.jpg' });
    await request(app.getHttpServer())
      .post('/api/grocery/admin/products/image')
      .set('Authorization', 'admin')
      .attach('file', Buffer.from('photo'), { filename: 'product.jpg', contentType: 'image/jpeg' })
      .expect(410);
    expect(service.authorizeOwner).not.toHaveBeenCalled();
    expect(media.uploadGroceryProductImage).not.toHaveBeenCalled();
  });
  it('keeps the public catalog closed and preserves historical order access', async () => {
    await request(app.getHttpServer()).get('/api/grocery').expect(200)
      .expect({ open: false, name: 'AfroChop', products: [], retired: true });
    expect(service.catalog).not.toHaveBeenCalled();
    service.orders.mockResolvedValue([{ id: 'historical' }]);
    await request(app.getHttpServer()).get('/api/grocery/orders/mine').auth('customer', { type: 'bearer' })
      .expect(200).expect([{ id: 'historical' }]);
  });
  it('blocks checkout before creating a new Stripe session', async () => {
    await request(app.getHttpServer()).post('/api/grocery/orders/11111111-1111-4111-8111-111111111111/checkout')
      .auth('customer', { type: 'bearer' }).send({ rateId: 'rate' }).expect(410);
  });
});
