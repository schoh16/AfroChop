import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import helmet from 'helmet';

function corsOrigin(): boolean | string[] {
  const allowed = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  // Native apps send no Origin header; browsers are restricted in production.
  if (allowed.length > 0) return allowed;
  return process.env.NODE_ENV === 'production' ? false : true;
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, new ExpressAdapter(), { rawBody: true });

  app.setGlobalPrefix('api');
  app.use(helmet());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors({ origin: corsOrigin(), credentials: true });

  const config = new DocumentBuilder()
    .setTitle('AfroChef Connect API')
    .setDescription('Marketplace API for African food discovery, chef booking, and local services.')
    .setVersion('1.0')
    .build();

  if (process.env.NODE_ENV !== 'production') {
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document);
  }

  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
}

void bootstrap();
