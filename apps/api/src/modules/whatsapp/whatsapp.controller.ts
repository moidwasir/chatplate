import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  Headers,
  Req,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  Logger,
  type RawBodyRequest,
} from '@nestjs/common';
import type { Request } from 'express';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { WhatsAppService } from './whatsapp.service';
import { Public } from '../auth/decorators/public.decorator';

// Called by Meta — authenticated by verify token / signature, not JWT
@Public()
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
    @Req() req: RawBodyRequest<Request>,
    @Body() payload: any,
    @Headers('x-hub-signature-256') signature: string,
  ): Promise<{ status: string }> {
    // Verify Meta signature over the raw bytes — re-serialised JSON won't match
    this.verifySignature(req.rawBody, signature);

    // Queue it and acknowledge — the processor does the heavy work.
    // If queueing fails we return 5xx so Meta retries rather than losing the message.
    await this.whatsappService.enqueueInboundPayload(payload);

    return { status: 'ok' };
  }

  private verifySignature(rawBody: Buffer | undefined, signature: string): void {
    const appSecret = this.config.get<string>('WHATSAPP_APP_SECRET');
    const configured = !!appSecret && !appSecret.startsWith('your_');

    // Without a real app secret, only development may skip the check (local webhook testing)
    if (!configured) {
      if (this.config.get<string>('NODE_ENV') === 'production') {
        throw new UnauthorizedException('WHATSAPP_APP_SECRET is not configured');
      }
      this.logger.debug('DEV mode: no app secret set, skipping webhook signature verification');
      return;
    }

    if (!signature || !rawBody) {
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
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException('Signature verification failed');
    }
  }
}

