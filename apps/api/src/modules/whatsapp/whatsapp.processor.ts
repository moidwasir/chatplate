import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { WhatsAppService, WHATSAPP_QUEUE } from './whatsapp.service';
import { ConversationEngine } from './conversation.engine';
import { OrderNotifier, type OrderStatusJob } from './order-notifier';

@Processor(WHATSAPP_QUEUE)
export class WhatsAppProcessor {
  private readonly logger = new Logger(WhatsAppProcessor.name);

  constructor(
    private readonly whatsappService: WhatsAppService,
    private readonly conversationEngine: ConversationEngine,
    private readonly orderNotifier: OrderNotifier,
  ) {}

  /**
   * Process an inbound WhatsApp message.
   * Delegates to the ConversationEngine state machine (Phase 2.2).
   */
  @Process('inbound-message')
  async handleInboundMessage(job: Job<{ message: any; metadata: any }>): Promise<void> {
    await this.conversationEngine.handle(job.data.message, job.data.metadata);
  }

  /**
   * Process a delivery status update from Meta.
   */
  @Process('message-status')
  async handleMessageStatus(job: Job<{ status: any }>): Promise<void> {
    await this.whatsappService.handleMessageStatus(job.data.status);
  }

  /**
   * Tell the customer their order moved to a new status (queued by OrdersService).
   */
  @Process('order-status')
  async handleOrderStatus(job: Job<OrderStatusJob>): Promise<void> {
    await this.orderNotifier.notifyStatus(job.data);
  }
}
