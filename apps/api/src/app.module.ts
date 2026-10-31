import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { BullModule } from '@nestjs/bull';
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
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
    }),

    // Rate limiting — 100 requests per minute per IP globally
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),

    // BullMQ / Redis — shared queue configuration
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        redis: config.get<string>('REDIS_URL') ?? 'redis://localhost:6379',
      }),
    }),

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
