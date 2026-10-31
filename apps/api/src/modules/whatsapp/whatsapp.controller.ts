import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { WhatsAppService } from './whatsapp.service';

@Controller('webhooks/whatsapp')
export class WhatsAppController {
  private readonly logger = new Logger(WhatsAppController.name);

  constructor(
    private readonly config: ConfigService,
    private readonly whatsappService: WhatsAppService,
  ) {}

  /**
   * GET /webhooks/whatsapp
   * Meta verification challenge — called once when you register the webhook URL
   */
  @Get()
  verifyWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ): string {
    const verifyToken = this.config.get<string>('WHATSAPP_WEBHOOK_VERIFY_TOKEN');
    if (mode === 'subscribe' && token === verifyToken) {
      this.logger.log('WhatsApp webhook verified successfully');
      return challenge;
    }
    throw new UnauthorizedException('Invalid webhook verification token');
  }

  /**
   * POST /webhooks/whatsapp
   * Receives all incoming WhatsApp events — MUST return 200 quickly
   * Heavy processing is handed off to the queue
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  async receiveWebhook(
    @Body() payload: any,
    @Headers('x-hub-signature-256') signature: string,
  ): Promise<{ status: string }> {
    // Verify Meta signature
    this.verifySignature(JSON.stringify(payload), signature);

    // Acknowledge immediately — Meta will retry if we don't respond fast
    // Fire-and-forget: push to processing queue
    this.whatsappService.enqueueInboundPayload(payload).catch((err) => {
      this.logger.error('Failed to enqueue WhatsApp payload', err);
    });

    return { status: 'ok' };
  }

  private verifySignature(rawBody: string, signature: string): void {
    const appSecret = this.config.get<string>('WHATSAPP_ACCESS_TOKEN');
    if (!appSecret || !signature) {
      throw new UnauthorizedException('Missing signature');
    }
    const expected = 'sha256=' + createHmac('sha256', appSecret).update(rawBody).digest('hex');
    try {
      const sigBuffer = Buffer.from(signature);
      const expectedBuffer = Buffer.from(expected);
      if (
        sigBuffer.length !== expectedBuffer.length ||
        !timingSafeEqual(sigBuffer, expectedBuffer)
      ) {
        throw new UnauthorizedException('Invalid webhook signature');
      }
    } catch {
      throw new UnauthorizedException('Signature verification failed');
    }
  }
}
