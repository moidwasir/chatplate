import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { RealtimeModule } from '../realtime/realtime.module';
import { WHATSAPP_QUEUE } from '../whatsapp/whatsapp.service';

@Module({
  // Status changes queue customer WhatsApp updates; the WhatsApp module's processor sends them
  imports: [RealtimeModule, BullModule.registerQueue({ name: WHATSAPP_QUEUE })],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}

