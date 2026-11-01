import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  // rawBody: the WhatsApp webhook signature is computed over the exact bytes Meta sent
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  configureApp(app);

  const port = process.env.PORT ?? 3001;
  await app.listen(port);
  logger.log(`API running on port ${port}`);
}

bootstrap();
