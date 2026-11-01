import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { randomUUID } from 'crypto';
import { MessageDirection } from '@safi/types';
import { PrismaService } from '../../common/prisma/prisma.service';

/** Meta delivery statuses in the order they progress */
const STATUS_RANK: Record<string, number> = { sent: 1, delivered: 2, read: 3 };

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);

  private readonly apiUrl: string;
  private readonly phoneNumberId: string;
  private readonly accessToken: string;
  private readonly minSendGapMs: number;
  private nextSendAt = 0;

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.apiUrl = config.get<string>('WHATSAPP_API_URL') ?? 'https://graph.facebook.com/v21.0';
    this.phoneNumberId = config.get<string>('WHATSAPP_PHONE_NUMBER_ID') ?? '';
    this.accessToken = config.get<string>('WHATSAPP_ACCESS_TOKEN') ?? '';
    const perSecond = Number(config.get<string>('WHATSAPP_MAX_SENDS_PER_SECOND') ?? 20);
    this.minSendGapMs = Math.ceil(1000 / Math.max(1, perSecond));
  }

  /**
   * Pull the messages and delivery statuses out of a Meta webhook payload.
   * Only events for our own number are returned: a business account can hold several
   * numbers, and Meta sends all of them to every subscribed app.
   */
  parseWebhook(payload: any): { messages: { message: any; metadata: any }[]; statuses: any[] } {
    const messages: { message: any; metadata: any }[] = [];
    const statuses: any[] = [];
    for (const entry of payload?.entry ?? []) {
      for (const change of entry?.changes ?? []) {
        const value = change?.value ?? {};
        const toNumber = value?.metadata?.phone_number_id;
        if (!this.isDevOutbox() && toNumber && toNumber !== this.phoneNumberId) {
          this.logger.debug(`Ignoring webhook for another number (phone_number_id=${toNumber})`);
          continue;
        }
        for (const message of value.messages ?? []) messages.push({ message, metadata: value });
        statuses.push(...(value.statuses ?? []));
      }
    }
    return { messages, statuses };
  }

  /**
   * Send a message via WhatsApp Cloud API and record it on the conversation.
   * Sends are spaced out to stay under Meta's per-number throughput limit.
   * Without real credentials (dev), the message is logged and stored instead of sent.
   *
   * @param to              Recipient phone number in E.164 without "+" (e.g. "923001234567")
   * @param payload         WhatsApp message object (text, interactive, template, etc.)
   * @param conversationId  When given, the outbound message is saved for status tracking
   * @returns               WhatsApp message ID from Meta, or null on error
   */
  async sendMessage(to: string, payload: object, conversationId?: string): Promise<string | null> {
    await this.waitForSendSlot();

    let messageId: string | null = null;
    let status = 'sent';

    if (this.isDevOutbox()) {
      messageId = `dev_${randomUUID()}`;
      this.logger.log(`[dev outbox] → ${to}: ${summarise(payload)}`);
    } else {
      try {
        const response = await axios.post(
          `${this.apiUrl}/${this.phoneNumberId}/messages`,
          { messaging_product: 'whatsapp', to, ...payload },
          {
            headers: {
              Authorization: `Bearer ${this.accessToken}`,
              'Content-Type': 'application/json',
            },
            timeout: 10_000,
          },
        );
        messageId = response.data?.messages?.[0]?.id ?? null;
        this.logger.debug(`WhatsApp message sent to ${to}, id=${messageId}`);
      } catch (err: any) {
        const responseBody = err?.response?.data
          ? JSON.stringify(err.response.data)
          : err?.message;
        this.logger.error(`Failed to send WhatsApp message to ${to}: ${responseBody}`);
        status = 'failed';
        // Swallow error — notification failures must not crash orders
      }
    }

    if (conversationId) {
      await this.recordOutbound(conversationId, messageId ?? `failed_${randomUUID()}`, payload, status);
    }
    return messageId;
  }

  /** True while WhatsApp credentials are unset or still the .env.example placeholders */
  isDevOutbox(): boolean {
    return !this.accessToken || this.accessToken.startsWith('your_') ||
      !this.phoneNumberId || this.phoneNumberId.startsWith('your_');
  }

  private async recordOutbound(conversationId: string, waMessageId: string, payload: any, status: string) {
    try {
      await this.prisma.message.create({
        data: {
          conversationId,
          waMessageId,
          direction: MessageDirection.OUTBOUND,
          type: payload?.type ?? 'text',
          content: payload,
          status,
        },
      });
      await this.prisma.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: new Date() },
      });
    } catch (err: any) {
      this.logger.warn(`Could not record outbound message on ${conversationId}: ${err?.message}`);
    }
  }

  /** Space sends evenly: at most WHATSAPP_MAX_SENDS_PER_SECOND across the process */
  private waitForSendSlot(): Promise<void> {
    const now = Date.now();
    const slot = Math.max(now, this.nextSendAt);
    this.nextSendAt = slot + this.minSendGapMs;
    const wait = slot - now;
    return wait > 0 ? new Promise((r) => setTimeout(r, wait)) : Promise.resolve();
  }

  /**
   * Handle an incoming delivery-status update from Meta and persist it.
   *
   * @param status  The status object from the webhook payload
   *                (e.g. { id: 'wamid.xxx', status: 'delivered', ... })
   */
  async handleMessageStatus(status: any): Promise<void> {
    const waMessageId: string = status?.id;
    const newStatus: string = status?.status;

    if (!waMessageId || !newStatus) {
      this.logger.warn('handleMessageStatus called with incomplete status object', status);
      return;
    }

    try {
      // Statuses can arrive out of order — never move backwards (e.g. read → delivered)
      const rank = STATUS_RANK[newStatus] ?? 0;
      const lower = Object.keys(STATUS_RANK).filter((s) => STATUS_RANK[s] < rank);
      await this.prisma.message.updateMany({
        where:
          newStatus === 'failed'
            ? { waMessageId }
            : { waMessageId, OR: [{ status: null }, { status: { in: lower } }] },
        data: { status: newStatus },
      });
      this.logger.debug(`Message ${waMessageId} status updated to "${newStatus}"`);
      if (newStatus === 'failed') {
        // Meta explains why (e.g. 131047 outside the 24 h window, 131026 undeliverable)
        const reasons = (status?.errors ?? [])
          .map((e: any) => `${e?.code} ${e?.title ?? ''}${e?.error_data?.details ? `: ${e.error_data.details}` : ''}`)
          .join('; ');
        this.logger.error(`WhatsApp could not deliver ${waMessageId} to ${status?.recipient_id}: ${reasons || 'no reason given'}`);
      }
    } catch (err: any) {
      this.logger.error(
        `Failed to update message status for ${waMessageId}: ${err?.message}`,
      );
    }
  }
}

/** One-line description of an outbound payload for logs */
function summarise(payload: any): string {
  const body =
    payload?.text?.body ??
    payload?.interactive?.body?.text ??
    (payload?.template ? `template ${payload.template.name}` : payload?.type);
  const options =
    payload?.interactive?.action?.buttons?.map((b: any) => b.reply.title) ??
    payload?.interactive?.action?.sections?.flatMap((sec: any) => sec.rows.map((r: any) => r.title));
  const text = String(body ?? '').replace(/\s+/g, ' ').slice(0, 160);
  return options?.length ? `${text} [${options.join(' | ')}]` : text;
}
