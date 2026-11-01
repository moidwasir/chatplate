import { NestFactory } from '@nestjs/core';
import { ExpressAdapter, type NestExpressApplication } from '@nestjs/platform-express';
import express from 'express';
import type { IncomingMessage, ServerResponse } from 'http';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';

/**
 * Vercel function entry: the Nest app is built once per warm instance and reused.
 * Requests reach it through apps/api/api/index.js (see vercel.json rewrites).
 */
let server: Promise<express.Express> | undefined;

async function createServer(): Promise<express.Express> {
  const expressApp = express();
  // rawBody: the WhatsApp webhook signature is computed over the exact bytes Meta sent
  const app = await NestFactory.create<NestExpressApplication>(AppModule, new ExpressAdapter(expressApp), {
    rawBody: true,
  });
  configureApp(app);
  await app.init();
  return expressApp;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  server ??= createServer().catch((err) => {
    // Don't cache a failed start; the next request tries again
    server = undefined;
    throw err;
  });
  const app = await server;
  app(req as express.Request, res as express.Response);
}
