import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  // No WebSockets on serverless hosts (Vercel); the dashboard polls there instead
  imports: process.env.VERCEL ? [] : [RealtimeModule],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}

