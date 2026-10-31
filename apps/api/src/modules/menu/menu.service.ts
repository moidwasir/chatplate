import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class MenuService {
  constructor(private readonly prisma: PrismaService) {}

  async getFullMenu(branchId: string) {
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    return this.prisma.category.findMany({
      where: { branchId, isActive: true },
      orderBy: { sortOrder: 'asc' },
      include: {
        items: {
          where: {
            isActive: true,
            isSoldOut: false,
            // Items with no time restriction OR whose serving window is currently active
            OR: [
              { servingStart: null, servingEnd: null },
              { servingStart: { lte: timeStr }, servingEnd: { gte: timeStr } },
            ],
          },
          orderBy: { sortOrder: 'asc' },
          include: {
            modifierGroups: {
              orderBy: { sortOrder: 'asc' },
              include: {
                modifiers: {
                  where: { isAvailable: true },
                  orderBy: { sortOrder: 'asc' },
                },
              },
            },
          },
        },
      },
    });
  }

  async toggleSoldOut(itemId: string, soldOut: boolean, branchId: string) {
    const item = await this.prisma.item.findFirst({
      where: { id: itemId, category: { branchId } },
    });
    if (!item) throw new NotFoundException(`Item ${itemId} not found in branch ${branchId}`);

    return this.prisma.item.update({
      where: { id: itemId },
      data: { isSoldOut: soldOut, updatedAt: new Date() },
    });
  }
}

