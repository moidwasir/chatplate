import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import { assertBranchAccess } from '../auth/guards/roles.guard';
import type { AuthUser } from '../auth/auth.types';

const NOT_SALES = ['CANCELLED', 'REFUNDED'];
/** Longest range one report covers */
const MAX_DAYS = 366;

@Injectable()
export class ReportsService {
  private readonly timeZone: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.timeZone = config.get<string>('RESTAURANT_TIMEZONE') ?? 'Asia/Karachi';
  }

  /**
   * Sales summary for [from, to). Days and hours are in restaurant time.
   * Sales exclude cancelled/refunded orders and tips (tips go to staff, not revenue).
   */
  async sales(branchId: string, from: Date, to: Date, user: AuthUser) {
    assertBranchAccess(user, branchId);
    if (!(from < to)) throw new BadRequestException('"from" must be before "to"');
    if (to.getTime() - from.getTime() > MAX_DAYS * 86_400_000) throw new BadRequestException(`Pick at most ${MAX_DAYS} days`);

    const range = { branchId, createdAt: { gte: from, lt: to } };
    const [orders, topItems] = await Promise.all([
      this.prisma.order.findMany({
        where: range,
        select: { status: true, orderType: true, source: true, total: true, tip: true, deliveryFee: true, createdAt: true, customerId: true },
      }),
      this.prisma.orderItem.groupBy({
        by: ['name'],
        where: { order: { ...range, status: { notIn: NOT_SALES as any } } },
        _sum: { quantity: true, lineTotal: true },
        orderBy: { _sum: { quantity: 'desc' } },
        take: 10,
      }),
    ]);

    const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: this.timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
    const hourFmt = new Intl.DateTimeFormat('en-GB', { timeZone: this.timeZone, hour: '2-digit', hourCycle: 'h23' });

    const byDay = new Map<string, { orders: number; sales: number }>();
    const byHour = Array.from({ length: 24 }, (_, hour) => ({ hour, orders: 0, sales: 0 }));
    const byType = { DELIVERY: { orders: 0, sales: 0 }, PICKUP: { orders: 0, sales: 0 } } as Record<string, { orders: number; sales: number }>;
    const bySource: Record<string, { orders: number; sales: number }> = {};
    const customers = new Set<string>();
    let sales = 0;
    let counted = 0;
    let cancelled = 0;
    let tips = 0;
    let deliveryFees = 0;

    for (const o of orders) {
      if (NOT_SALES.includes(o.status)) {
        cancelled++;
        continue;
      }
      const net = o.total - o.tip;
      counted++;
      sales += net;
      tips += o.tip;
      deliveryFees += o.deliveryFee;
      customers.add(o.customerId);

      const day = dayFmt.format(o.createdAt);
      const d = byDay.get(day) ?? { orders: 0, sales: 0 };
      d.orders++;
      d.sales += net;
      byDay.set(day, d);

      const h = byHour[Number(hourFmt.format(o.createdAt)) % 24];
      h.orders++;
      h.sales += net;

      const t = (byType[o.orderType] ??= { orders: 0, sales: 0 });
      t.orders++;
      t.sales += net;
      const s = (bySource[o.source] ??= { orders: 0, sales: 0 });
      s.orders++;
      s.sales += net;
    }

    return {
      timeZone: this.timeZone,
      totals: {
        orders: counted,
        sales,
        averageOrder: counted ? Math.round(sales / counted) : 0,
        cancelled,
        customers: customers.size,
        tips,
        deliveryFees,
      },
      byDay: [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, v]) => ({ date, ...v })),
      byHour,
      byType,
      bySource,
      topItems: topItems.map((i) => ({ name: i.name, quantity: i._sum.quantity ?? 0, revenue: i._sum.lineTotal ?? 0 })),
    };
  }
}
