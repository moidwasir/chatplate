import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { LOCAL_UPLOAD_DIR } from './common/storage/storage.service';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  // rawBody: the WhatsApp webhook signature is computed over the exact bytes Meta sent
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });

  // Local uploads (dev fallback when S3 isn't configured)
  app.useStaticAssets(LOCAL_UPLOAD_DIR, { prefix: '/uploads/' });

  // Global validation pipe — strips unknown fields, transforms types
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // API versioning prefix
  app.setGlobalPrefix('v1');

  // CORS — lock down in production to known frontend origins
  app.enableCors({
    origin: process.env.FRONTEND_URL?.split(',') ?? ['http://localhost:3000'],
    credentials: true,
  });

  // Swagger docs (dev only)
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('ChatPlate API')
      .setDescription('WhatsApp Restaurant Ordering System — REST + WebSocket API')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document);
    logger.log('Swagger docs available at /docs');
  }

  const port = process.env.PORT ?? 3001;
  await app.listen(port);
  logger.log(`API running on port ${port}`);
}

bootstrap();
