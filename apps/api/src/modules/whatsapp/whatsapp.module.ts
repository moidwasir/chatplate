import { Module } from '@nestjs/common';
import { WhatsAppController } from './whatsapp.controller';
import { WhatsAppService } from './whatsapp.service';
import { ConversationEngine } from './conversation.engine';
import { SessionService } from './session.service';
import { OrderNotifier } from './order-notifier';
import { MenuModule } from '../menu/menu.module';
import { OrdersModule } from '../orders/orders.module';

@Module({
  imports: [
    MenuModule,
    OrdersModule,
  ],
  controllers: [WhatsAppController],
  providers: [
    WhatsAppService,
    ConversationEngine,
    SessionService,
    OrderNotifier,
  ],
  exports: [WhatsAppService],
})
export class WhatsAppModule {}
