import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './common/prisma/prisma.module';
import { StorageModule } from './common/storage/storage.module';
import { AuthModule } from './modules/auth/auth.module';
import { MenuModule } from './modules/menu/menu.module';
import { DeliveryModule } from './modules/delivery/delivery.module';
import { OrdersModule } from './modules/orders/orders.module';
import { WhatsAppModule } from './modules/whatsapp/whatsapp.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { HealthModule } from './common/health/health.module';

@Module({
  imports: [
    // Config — loads .env
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
    }),

    // Rate limiting — 100 requests per minute per IP globally
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),

    // Shared
    PrismaModule,
    StorageModule,
    HealthModule,

    // Feature modules
    AuthModule,
    MenuModule,
    DeliveryModule,
    OrdersModule,
    WhatsAppModule,
    // WebSockets need a long-running server; on Vercel the dashboard polls instead
    ...(process.env.VERCEL ? [] : [RealtimeModule]),
  ],
})
export class AppModule {}
