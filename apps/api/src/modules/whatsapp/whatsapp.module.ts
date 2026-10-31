import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { WhatsAppController } from './whatsapp.controller';
import { WhatsAppService, WHATSAPP_QUEUE } from './whatsapp.service';

@Module({
  imports: [
    BullModule.registerQueue({ name: WHATSAPP_QUEUE }),
  ],
  controllers: [WhatsAppController],
  providers: [WhatsAppService],
  exports: [WhatsAppService],
})
export class WhatsAppModule {}

