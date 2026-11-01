import { Module } from '@nestjs/common';
import { WhatsAppController } from './whatsapp.controller';
import { WhatsAppService } from './whatsapp.service';
import { ConversationEngine } from './conversation.engine';
import { SessionService } from './session.service';
import { OrderNotifier } from './order-notifier';
import { ChatsController } from './chats.controller';
import { ChatsService } from './chats.service';
import { MenuGridService } from './menu-grid.service';
import { MenuModule } from '../menu/menu.module';
import { OrdersModule } from '../orders/orders.module';

@Module({
  imports: [
    MenuModule,
    OrdersModule,
  ],
  controllers: [WhatsAppController, ChatsController],
  providers: [
    WhatsAppService,
    ConversationEngine,
    SessionService,
    OrderNotifier,
    ChatsService,
    MenuGridService,
  ],
  exports: [WhatsAppService],
})
export class WhatsAppModule {}
