import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OrderStatus, ORDER_STATUS_TRANSITIONS } from '@safi/types';
import { Prisma } from '@prisma/client';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll(branchId: string, status?: string) {
    return this.prisma.order.findMany({
      where: {
        branchId,
        ...(status && { status: status as any }),
      },
      include: {
        customer: { select: { name: true, phone: true } },
        items: { include: { modifiers: true } },
        payment: true,
        delivery: { include: { rider: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        customer: true,
        items: { include: { modifiers: true } },
        statusHistory: { orderBy: { createdAt: 'asc' } },
        payment: { include: { refunds: true } },
        delivery: { include: { rider: true } },
        kitchenTickets: { include: { station: true } },
        review: true,
      },
    });
    if (!order) throw new NotFoundException(`Order ${id} not found`);
    return order;
  }

  /**
   * Transition an order to a new status.
   * Enforces allowed transitions from ORDER_STATUS_TRANSITIONS.
   * Records audit history and emits real-time event.
   */
  async updateStatus(
    orderId: string,
    newStatus: OrderStatus,
    changedBy: string,
    reason?: string,
  ) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException(`Order ${orderId} not found`);

    const currentStatus = order.status as OrderStatus;
    const allowed = ORDER_STATUS_TRANSITIONS[currentStatus] ?? [];

    if (!allowed.includes(newStatus)) {
      throw new BadRequestException(
        `Cannot transition from ${currentStatus} to ${newStatus}. ` +
          `Allowed: ${allowed.join(', ') || 'none'}`,
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const updatedOrder = await tx.order.update({
        where: { id: orderId },
        data: { status: newStatus as any },
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId,
          fromStatus: currentStatus as any,
          toStatus: newStatus as any,
          reason,
          changedBy,
        },
      });

      return updatedOrder;
    });

    this.logger.log(`Order ${order.orderNumber}: ${currentStatus} → ${newStatus} by ${changedBy}`);

    // TODO: emit WebSocket event and trigger WhatsApp notification
    return updated;
  }

  /**
   * Generate the next sequential order number: ORD-000001
   */
  private async generateOrderNumber(branchId: string): Promise<string> {
    const count = await this.prisma.order.count({ where: { branchId } });
    return `ORD-${String(count + 1).padStart(6, '0')}`;
  }
}
