import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { assertBranchAccess } from '../auth/guards/roles.guard';
import type { AuthUser } from '../auth/auth.types';

/** Orders that count towards spend */
const COUNTED = { notIn: ['CANCELLED', 'REFUNDED'] as any };

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Customers who have ordered from or chatted with this branch */
  async list(branchId: string, user: AuthUser, opts: { q?: string; page: number; pageSize: number }) {
    assertBranchAccess(user, branchId);
    const q = opts.q?.trim();
    const where: Prisma.CustomerWhereInput = {
      OR: [{ orders: { some: { branchId } } }, { conversations: { some: { branchId } } }],
      ...(q && {
        AND: [
          {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { phone: { contains: q.replace(/\D/g, '').replace(/^0/, '') || q } },
            ],
          },
        ],
      }),
    };
    const [total, customers] = await Promise.all([
      this.prisma.customer.count({ where }),
      this.prisma.customer.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (opts.page - 1) * opts.pageSize,
        take: opts.pageSize,
        select: { id: true, name: true, phone: true, isBlocked: true, createdAt: true },
      }),
    ]);
    const stats = await this.stats(branchId, customers.map((c) => c.id));
    return {
      total,
      page: opts.page,
      pageSize: opts.pageSize,
      items: customers.map((c) => ({ ...c, ...(stats.get(c.id) ?? { orderCount: 0, spent: 0, lastOrderAt: null }) })),
    };
  }

  async findOne(id: string, branchId: string, user: AuthUser) {
    assertBranchAccess(user, branchId);
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: {
        addresses: { orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }] },
        notes: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    const [orders, stats] = await Promise.all([
      this.prisma.order.findMany({
        where: { customerId: id, branchId },
        orderBy: { createdAt: 'desc' },
        take: 30,
        select: {
          id: true,
          orderNumber: true,
          status: true,
          orderType: true,
          total: true,
          createdAt: true,
          items: { select: { name: true, quantity: true } },
        },
      }),
      this.stats(branchId, [id]),
    ]);

    // Note authors are user ids; show names
    const authorIds = [...new Set(customer.notes.map((n) => n.createdBy))];
    const authors = await this.prisma.user.findMany({ where: { id: { in: authorIds } }, select: { id: true, name: true } });
    const nameOf = new Map(authors.map((a) => [a.id, a.name]));

    return {
      ...customer,
      notes: customer.notes.map((n) => ({ ...n, createdByName: nameOf.get(n.createdBy) ?? 'Staff' })),
      orders,
      ...(stats.get(id) ?? { orderCount: 0, spent: 0, lastOrderAt: null }),
    };
  }

  async update(id: string, data: { name?: string; isBlocked?: boolean }, user: AuthUser) {
    await this.assertKnown(id, user);
    return this.prisma.customer.update({
      where: { id },
      data: { ...(data.name !== undefined && { name: data.name.trim() || null }), ...(data.isBlocked !== undefined && { isBlocked: data.isBlocked }) },
      select: { id: true, name: true, isBlocked: true },
    });
  }

  async addNote(id: string, note: string, user: AuthUser) {
    await this.assertKnown(id, user);
    return this.prisma.customerNote.create({ data: { customerId: id, note: note.trim(), createdBy: user.id } });
  }

  async deleteNote(id: string, noteId: string, user: AuthUser) {
    await this.assertKnown(id, user);
    await this.prisma.customerNote.deleteMany({ where: { id: noteId, customerId: id } });
    return { deleted: true };
  }

  /** Customers are shared across branches; staff may touch those who used one of their branches */
  private async assertKnown(id: string, user: AuthUser) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      select: { orders: { select: { branchId: true }, distinct: ['branchId'] }, conversations: { select: { branchId: true }, distinct: ['branchId'] } },
    });
    if (!customer) throw new NotFoundException('Customer not found');
    if (user.role === 'OWNER') return;
    const branches = [...customer.orders, ...customer.conversations].map((x) => x.branchId);
    if (!branches.some((b) => user.branchIds.includes(b))) throw new NotFoundException('Customer not found');
  }

  private async stats(branchId: string, customerIds: string[]) {
    if (customerIds.length === 0) return new Map<string, { orderCount: number; spent: number; lastOrderAt: Date | null }>();
    const [counted, all] = await Promise.all([
      this.prisma.order.groupBy({
        by: ['customerId'],
        where: { branchId, customerId: { in: customerIds }, status: COUNTED },
        _sum: { total: true },
      }),
      this.prisma.order.groupBy({
        by: ['customerId'],
        where: { branchId, customerId: { in: customerIds } },
        _count: { _all: true },
        _max: { createdAt: true },
      }),
    ]);
    const spent = new Map(counted.map((g) => [g.customerId, g._sum.total ?? 0]));
    return new Map(
      all.map((g) => [g.customerId, { orderCount: g._count._all, spent: spent.get(g.customerId) ?? 0, lastOrderAt: g._max.createdAt }]),
    );
  }
}
