import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';

export const WHATSAPP_QUEUE = 'whatsapp-inbound';

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);

  constructor(
    @InjectQueue(WHATSAPP_QUEUE) private readonly inboundQueue: Queue,
  ) {}

  /**
   * Push the raw Meta webhook payload into BullMQ for processing.
   * The controller returns 200 immediately; the queue worker handles the message.
   */
  async enqueueInboundPayload(payload: any): Promise<void> {
    const messages = payload?.entry?.[0]?.changes?.[0]?.value?.messages ?? [];
    const statuses = payload?.entry?.[0]?.changes?.[0]?.value?.statuses ?? [];

    for (const message of messages) {
      // Deduplicate by wa_message_id — handled inside the processor
      await this.inboundQueue.add(
        'inbound-message',
        { message, metadata: payload?.entry?.[0]?.changes?.[0]?.value },
        {
          jobId: `wa_msg_${message.id}`, // BullMQ will skip if same jobId exists
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
          removeOnComplete: 1000,
          removeOnFail: 500,
        },
      );
    }

    for (const status of statuses) {
      await this.inboundQueue.add(
        'message-status',
        { status },
        {
          jobId: `wa_status_${status.id}_${status.status}`,
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
          removeOnComplete: 500,
          removeOnFail: 200,
        },
      );
    }
  }

  /**
   * Send a message via WhatsApp Cloud API.
   * Used by the conversation engine and notification service.
   */
  async sendMessage(to: string, payload: object): Promise<string | null> {
    // TODO: implement HTTP call to Meta Cloud API
    // POST https://graph.facebook.com/v21.0/{PHONE_NUMBER_ID}/messages
    this.logger.debug(`Sending WhatsApp message to ${to}`);
    return null;
  }
}

