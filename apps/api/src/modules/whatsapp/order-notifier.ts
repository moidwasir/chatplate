import { Injectable, Logger } from '@nestjs/common';
import { OrderStatus } from '@safi/types';
import { buildText } from '@safi/whatsapp';
import { PrismaService } from '../../common/prisma/prisma.service';
import { WhatsAppService } from './whatsapp.service';

export interface OrderStatusJob {
  orderId: string;
  status: OrderStatus;
  reason?: string;
}

/**
 * Tells the customer on WhatsApp when staff move their order along.
 * Runs from the queue (job 'order-status'), so a slow or failed send never blocks the dashboard.
 */
@Injectable()
export class OrderNotifier {
  private readonly logger = new Logger(OrderNotifier.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsAppService,
  ) {}

  async notifyStatus({ orderId, status, reason }: OrderStatusJob): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { customer: true, branch: true, payment: true },
    });
    if (!order || order.source !== 'WHATSAPP') return;

    const text = statusMessage(status, {
      orderNumber: order.orderNumber,
      isDelivery: order.orderType === 'DELIVERY',
      etaMinutes: order.estimatedMinutes ?? 30,
      branchName: order.branch.name,
      isCod: order.payment?.method === 'COD',
      reason,
    });
    if (!text) return;

    // Record it on the customer's latest chat so it shows in their conversation history
    const conversation = await this.prisma.conversation.findFirst({
      where: { customerId: order.customerId, branchId: order.branchId },
      orderBy: { lastMessageAt: 'desc' },
      select: { id: true },
    });

    const messageId = await this.whatsapp.sendMessage(order.customer.phone, buildText(order.customer.phone, text), conversation?.id);
    // sendMessage swallows API errors; throw so the queue retries
    if (!messageId) throw new Error(`WhatsApp update for ${order.orderNumber} (${status}) was not sent`);
    this.logger.log(`Customer notified: ${order.orderNumber} → ${status}`);
  }
}

interface MessageContext {
  orderNumber: string;
  isDelivery: boolean;
  etaMinutes: number;
  branchName: string;
  isCod: boolean;
  reason?: string;
}

/** Customer-facing text for each status; null = don't message */
function statusMessage(status: OrderStatus, c: MessageContext): string | null {
  const ref = `Order *${c.orderNumber}*`;
  switch (status) {
    case OrderStatus.ACCEPTED:
      return c.isDelivery
        ? `✅ *Order Confirmed!*\n\n${ref} has been accepted by the restaurant.\nIt should reach you in about *${c.etaMinutes} minutes*.`
        : `✅ *Order Confirmed!*\n\n${ref} has been accepted by the restaurant.\nIt will be ready for pickup in about *${c.etaMinutes} minutes*.`;
    case OrderStatus.PREPARING:
      return `👨‍🍳 ${ref} is being prepared in our kitchen now.`;
    case OrderStatus.READY:
      return c.isDelivery
        ? `📦 ${ref} is packed and ready. A rider will pick it up shortly.`
        : `🎉 ${ref} is *ready for pickup*!\n\nPlease collect it from *${c.branchName}* and show this order number at the counter.`;
    case OrderStatus.OUT_FOR_DELIVERY:
      return `🛵 ${ref} is *on the way*!\n\n${c.isCod ? 'Please keep the cash ready. ' : ''}Our rider will call you on arrival.`;
    case OrderStatus.DELIVERED:
      return `✅ ${ref} has been delivered.\n\nEnjoy your meal, and thank you for ordering with us! 🙏`;
    case OrderStatus.PICKED_UP:
      return `✅ ${ref} has been collected.\n\nEnjoy your meal, and thank you for ordering with us! 🙏`;
    case OrderStatus.CANCELLED:
      return `❌ Sorry, ${ref} has been cancelled.${c.reason ? `\n\nReason: ${c.reason}` : ''}\n\n${c.isCod ? 'You have not been charged. ' : ''}Send *hi* to place a new order.`;
    default:
      return null;
  }
}
