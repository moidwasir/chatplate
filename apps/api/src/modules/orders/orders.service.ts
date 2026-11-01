import {
  Injectable,
  Optional,
  BadRequestException,
  ConflictException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { OrderStatus, ORDER_STATUS_TRANSITIONS } from '@safi/types';
import { assertBranchAccess } from '../auth/guards/roles.guard';
import type { AuthUser } from '../auth/auth.types';
import type { CreateOrderDto, ListOrdersQueryDto, OrderStatsQueryDto } from './dto/orders.dto';

export interface StatusChangeEvent {
  orderId: string;
  orderNumber: string;
  source: string;
  status: OrderStatus;
  reason?: string;
}
export type StatusListener = (event: StatusChangeEvent) => Promise<void>;

/** Steps that only make sense for one kind of order */
const DELIVERY_ONLY: OrderStatus[] = [OrderStatus.OUT_FOR_DELIVERY, OrderStatus.DELIVERED];
const PICKUP_ONLY: OrderStatus[] = [OrderStatus.PICKED_UP];

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    // Absent when running serverless (no WebSockets there); the dashboard polls instead
    @Optional() private readonly realtime?: RealtimeGateway,
  ) {}

  /** Called after every status change (e.g. the WhatsApp module messages the customer) */
  private readonly statusListeners: StatusListener[] = [];

  onStatusChange(listener: StatusListener) {
    this.statusListeners.push(listener);
  }

  // ─── Queries ──────────────────────────────────────────────────────────────

  async findAll(query: ListOrdersQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const where = this.listWhere(query);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        include: {
          customer: { select: { name: true, phone: true } },
          items: { include: { modifiers: true } },
          payment: true,
          delivery: { include: { rider: true } },
          address: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.order.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  /** Orders created or updated after `since` (server clock), for dashboard polling */
  async changes(branchId: string, since?: string) {
    const now = new Date();
    // First call: just hand back a cursor, nothing is "new" yet
    if (!since) return { now: now.toISOString(), created: [], updated: [] };
    const after = new Date(since);
    const orders = await this.prisma.order.findMany({
      where: { branchId, updatedAt: { gt: after, lte: now } },
      select: {
        id: true,
        orderNumber: true,
        orderType: true,
        status: true,
        total: true,
        createdAt: true,
        customer: { select: { name: true } },
      },
      orderBy: { updatedAt: 'asc' },
      take: 100,
    });
    const isNew = (o: (typeof orders)[number]) => o.createdAt > after;
    return {
      now: now.toISOString(),
      created: orders.filter(isNew).map((o) => ({
        orderId: o.id,
        orderNumber: o.orderNumber,
        orderType: o.orderType,
        customerName: o.customer?.name ?? 'Guest',
        total: o.total,
      })),
      updated: orders.filter((o) => !isNew(o)).map((o) => ({ orderId: o.id, status: o.status })),
    };
  }

  /** Per-status counts plus sales (excluding cancelled/refunded) for the range */
  async stats(query: OrderStatsQueryDto) {
    const where = this.listWhere(query);
    const [byStatus, sales] = await Promise.all([
      this.prisma.order.groupBy({ by: ['status'], where, _count: { _all: true } }),
      this.prisma.order.aggregate({
        where: { ...where, status: { notIn: ['CANCELLED', 'REFUNDED'] } },
        _sum: { total: true },
        _count: { _all: true },
      }),
    ]);
    const counts = Object.fromEntries(byStatus.map((g) => [g.status, g._count._all])) as Record<string, number>;
    return {
      counts,
      total: byStatus.reduce((n, g) => n + g._count._all, 0),
      sales: sales._sum.total ?? 0,
      averageOrder: sales._count._all ? Math.round((sales._sum.total ?? 0) / sales._count._all) : 0,
    };
  }

  private listWhere(query: Partial<ListOrdersQueryDto> & { branchId: string }): Prisma.OrderWhereInput {
    const statuses = query.status?.split(',').map((x) => x.trim()).filter(Boolean);
    const q = query.q?.trim();
    return {
      branchId: query.branchId,
      ...(statuses?.length && { status: { in: statuses as any } }),
      ...(query.orderType && { orderType: query.orderType as any }),
      ...((query.from || query.to) && {
        createdAt: {
          ...(query.from && { gte: new Date(query.from) }),
          ...(query.to && { lt: new Date(query.to) }),
        },
      }),
      ...(q && {
        OR: [
          { orderNumber: { contains: q, mode: 'insensitive' } },
          { customer: { name: { contains: q, mode: 'insensitive' } } },
          // Phones are stored as digits (923001234567); match "0300…" and "+92…" too
          { customer: { phone: { contains: q.replace(/\D/g, '').replace(/^0/, '') || q } } },
        ],
      }),
    };
  }

  async findOne(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        customer: true,
        address: true,
        items: { include: { modifiers: true } },
        statusHistory: { orderBy: { createdAt: 'asc' } },
        payment: { include: { refunds: true } },
        delivery: { include: { rider: true } },
        kitchenTickets: { include: { station: true } },
        review: true,
      },
    });
    if (!order) throw new NotFoundException(`Order ${id} not found`);

    // changedBy holds a user id (or "system"); attach names for the timeline
    const userIds = [...new Set(order.statusHistory.map((h) => h.changedBy).filter((v): v is string => !!v && v !== 'system'))];
    const users = userIds.length
      ? await this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
      : [];
    const names = new Map(users.map((u) => [u.id, u.name]));
    return {
      ...order,
      statusHistory: order.statusHistory.map((h) => ({
        ...h,
        changedByName: h.changedBy === 'system' ? (order.source === 'WHATSAPP' ? 'Customer (WhatsApp)' : 'System') : (names.get(h.changedBy ?? '') ?? null),
      })),
    };
  }

  // ─── Create order ─────────────────────────────────────────────────────────

  /**
   * Creates a new order (from WhatsApp bot or POS).
   * Calculates subtotal from item line totals, creates payment record,
   * emits order.created WebSocket event.
   */
  async createOrder(dto: CreateOrderDto, customerId: string) {
    // Calculate totals
    const subtotal = dto.items.reduce((sum, item) => {
      const modifiersTotal = item.selectedModifiers.reduce(
        (s, m) => s + m.priceAdjustment,
        0,
      );
      return sum + (item.unitPrice + modifiersTotal) * item.quantity;
    }, 0);

    const branch = await this.prisma.branch.findUnique({
      where: { id: dto.branchId },
      include: { restaurant: true },
    });
    if (!branch) throw new NotFoundException('Branch not found');

    const taxAmount = Math.round(
      (subtotal * (branch.restaurant.taxPercent ?? 0)) / 10000,
    );
    const deliveryFee = dto.deliveryFee ?? 0;
    const discountAmount = dto.discountAmount ?? 0;
    const tip = dto.tip ?? 0;
    const total = subtotal + taxAmount + deliveryFee - discountAmount + tip;

    const orderNumber = await this.generateOrderNumber(dto.branchId);

    const order = await this.prisma.$transaction(async (tx) => {
      const newOrder = await tx.order.create({
        data: {
          orderNumber,
          branchId: dto.branchId,
          customerId,
          source: dto.source as any,
          orderType: dto.orderType as any,
          status: 'NEW',
          addressId: dto.addressId,
          subtotal,
          taxAmount,
          deliveryFee,
          discountAmount,
          tip,
          total,
          notes: dto.notes,
          estimatedMinutes: 30, // default; kitchen can update
          items: {
            create: dto.items.map((item) => ({
              menuItemId: item.menuItemId,
              name: item.name,
              unitPrice: item.unitPrice,
              quantity: item.quantity,
              lineTotal:
                (item.unitPrice +
                  item.selectedModifiers.reduce((s, m) => s + m.priceAdjustment, 0)) *
                item.quantity,
              notes: item.notes,
              modifiers: {
                create: item.selectedModifiers.map((mod) => ({
                  modifierId: mod.modifierId,
                  name: mod.name,
                  priceAdjustment: mod.priceAdjustment,
                })),
              },
            })),
          },
        },
        include: {
          customer: { select: { name: true, phone: true } },
          items: { include: { modifiers: true } },
        },
      });

      // Create payment record
      await tx.payment.create({
        data: {
          orderId: newOrder.id,
          method: dto.paymentMethod as any,
          // COD stays pending until the rider collects the cash; counter sales are paid on the spot
          status: dto.paymentMethod === 'COUNTER' ? 'PAID' : 'PENDING',
          amount: total,
        },
      });

      // Initial status history
      await tx.orderStatusHistory.create({
        data: {
          orderId: newOrder.id,
          toStatus: 'NEW',
          changedBy: 'system',
        },
      });

      return newOrder;
    });

    this.logger.log(`Order created: ${orderNumber} | ${dto.source} | total ${total} paisa`);

    // Emit real-time event to branch room (dashboard, POS, KDS all hear this)
    this.realtime?.emitToBranch(dto.branchId, {
      event: 'order.created',
      payload: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        branchId: order.branchId,
        source: order.source,
        orderType: order.orderType,
        status: order.status,
        customerName: order.customer?.name ?? 'Guest',
        total: order.total,
        items: order.items.map((i) => ({
          name: i.name,
          quantity: i.quantity,
          notes: i.notes ?? undefined,
        })),
        createdAt: order.createdAt.toISOString(),
      },
    });

    return order;
  }

  // ─── Status transition ────────────────────────────────────────────────────

  /**
   * Transition order status with state-machine enforcement.
   * Emits order.updated WebSocket event on every change and queues a WhatsApp
   * update to the customer for WhatsApp orders.
   */
  async updateStatus(
    orderId: string,
    newStatus: OrderStatus,
    user: AuthUser,
    reason?: string,
    estimatedMinutes?: number,
  ) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException(`Order ${orderId} not found`);
    assertBranchAccess(user, order.branchId);

    const currentStatus = order.status as OrderStatus;
    const allowed = ORDER_STATUS_TRANSITIONS[currentStatus] ?? [];

    if (!allowed.includes(newStatus)) {
      throw new BadRequestException(
        `Cannot transition ${currentStatus} → ${newStatus}. Allowed: ${allowed.join(', ') || 'none'}`,
      );
    }
    const isDelivery = order.orderType === 'DELIVERY';
    if ((DELIVERY_ONLY.includes(newStatus) && !isDelivery) || (PICKUP_ONLY.includes(newStatus) && isDelivery)) {
      throw new BadRequestException(`${newStatus} does not apply to ${order.orderType} orders`);
    }
    reason = reason?.trim() || undefined;
    if (newStatus === OrderStatus.CANCELLED && !reason) {
      throw new BadRequestException('A reason is required to cancel an order (it is sent to the customer)');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      // Only moves if nobody else changed it first (two staff tapping Accept at once)
      const { count } = await tx.order.updateMany({
        where: { id: orderId, status: currentStatus as any },
        data: {
          status: newStatus as any,
          ...(newStatus === OrderStatus.ACCEPTED && estimatedMinutes && { estimatedMinutes }),
        },
      });
      if (count === 0) {
        throw new ConflictException(`Order ${order.orderNumber} was just updated by someone else. Refresh and try again.`);
      }
      await tx.orderStatusHistory.create({
        data: {
          orderId,
          fromStatus: currentStatus as any,
          toStatus: newStatus as any,
          reason,
          changedBy: user.id,
        },
      });
      return tx.order.findUniqueOrThrow({ where: { id: orderId } });
    });

    this.logger.log(`Order ${order.orderNumber}: ${currentStatus} → ${newStatus} by ${user.id}`);

    // Real-time event → dashboard, POS, KDS
    this.realtime?.emitToBranch(order.branchId, {
      event: 'order.updated',
      payload: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        branchId: order.branchId,
        previousStatus: currentStatus,
        status: newStatus,
        updatedAt: new Date().toISOString(),
        updatedBy: user.id,
      },
    });

    // Awaited so it completes before a serverless function is frozen; a failed
    // notification is logged and never undoes the status change
    for (const listener of this.statusListeners) {
      try {
        await listener({ orderId: order.id, orderNumber: order.orderNumber, source: order.source, status: newStatus, reason });
      } catch (err: any) {
        this.logger.error(`Status listener failed for ${order.orderNumber} (${newStatus}): ${err?.message}`);
      }
    }

    // Create kitchen tickets when order is ACCEPTED
    if (newStatus === OrderStatus.ACCEPTED) {
      await this.createKitchenTickets(orderId, order.branchId);
    }

    return updated;
  }

  // ─── Kitchen tickets ──────────────────────────────────────────────────────

  /**
   * Groups order items by station, creates one KitchenTicket per station,
   * and emits ticket.created to each station room.
   */
  private async createKitchenTickets(orderId: string, branchId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: {
          include: {
            modifiers: true,
            menuItem: { include: { station: true } },
          },
        },
      },
    });
    if (!order) return;

    // Group items by station (null station → default station or skip)
    const byStation = new Map<string | null, typeof order.items>();
    for (const item of order.items) {
      const stationId = item.menuItem.stationId ?? null;
      if (!byStation.has(stationId)) byStation.set(stationId, []);
      byStation.get(stationId)!.push(item);
    }

    for (const [stationId, items] of byStation.entries()) {
      if (!stationId) continue; // skip items with no station assignment for now

      const ticket = await this.prisma.kitchenTicket.create({
        data: {
          orderId,
          stationId,
          items: items.map((i) => ({
            name: i.name,
            quantity: i.quantity,
            modifiers: i.modifiers.map((m) => m.name),
            notes: i.notes,
            hasAllergyNote: !!(i.notes?.toLowerCase().includes('allerg')),
          })),
        },
        include: { station: true },
      });

      // Emit to station room
      this.realtime?.emitToStation(stationId, {
        event: 'ticket.created',
        payload: {
          ticketId: ticket.id,
          orderId: ticket.orderId,
          orderNumber: order.orderNumber,
          stationId,
          stationName: ticket.station.name,
          branchId,
          items: ticket.items as any[],
          orderType: order.orderType,
          source: order.source,
          firedAt: ticket.firedAt.toISOString(),
        },
      });

      this.logger.log(`Kitchen ticket created for station ${ticket.station.name}, order ${order.orderNumber}`);
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private async generateOrderNumber(branchId: string): Promise<string> {
    const count = await this.prisma.order.count({ where: { branchId } });
    return `ORD-${String(count + 1).padStart(6, '0')}`;
  }
}
