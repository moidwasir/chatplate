import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './common/prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { MenuModule } from './modules/menu/menu.module';
import { OrdersModule } from './modules/orders/orders.module';
import { WhatsAppModule } from './modules/whatsapp/whatsapp.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { HealthModule } from './common/health/health.module';

@Module({
  imports: [
    // Config — loads .env
    ConfigModule.forRoot({ isGlobal: true }),

    // Rate limiting — 100 requests per minute per IP globally
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),

    // Shared
    PrismaModule,
    HealthModule,

    // Feature modules
    AuthModule,
    MenuModule,
    OrdersModule,
    WhatsAppModule,
    RealtimeModule,
  ],
})
export class AppModule {}
