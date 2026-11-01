import type { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { LOCAL_UPLOAD_DIR } from './common/storage/storage.service';

/** Shared by the normal server (main.ts) and the Vercel function (serverless.ts) */
export function configureApp(app: NestExpressApplication) {
  // Local uploads (dev fallback when no cloud storage is configured)
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
    origin: process.env.FRONTEND_URL?.split(',').map((o) => o.trim()) ?? ['http://localhost:3000'],
    credentials: true,
  });

  // Swagger docs (dev only)
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('ChatPlate API')
      .setDescription('WhatsApp Restaurant Ordering System — REST API')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config));
    new Logger('Bootstrap').log('Swagger docs available at /docs');
  }
}
