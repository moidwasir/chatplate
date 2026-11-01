import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { WhatsAppController } from './whatsapp.controller';
import { WhatsAppService, WHATSAPP_QUEUE } from './whatsapp.service';
import { WhatsAppProcessor } from './whatsapp.processor';
import { ConversationEngine } from './conversation.engine';
import { SessionService } from './session.service';
import { OrderNotifier } from './order-notifier';
import { MenuModule } from '../menu/menu.module';
import { OrdersModule } from '../orders/orders.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: WHATSAPP_QUEUE }),
    MenuModule,
    OrdersModule,
  ],
  controllers: [WhatsAppController],
  providers: [
    WhatsAppService,
    WhatsAppProcessor,
    ConversationEngine,
    SessionService,
    OrderNotifier,
  ],
  exports: [WhatsAppService],
})
export class WhatsAppModule {}
