import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

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
      .setTitle('Safi Restaurant API')
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
