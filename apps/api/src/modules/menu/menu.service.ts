import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../../common/storage/storage.service';
import { assertBranchAccess } from '../auth/guards/roles.guard';
import type { AuthUser } from '../auth/auth.types';
import {
  CreateCategoryDto,
  CreateItemDto,
  CreateModifierDto,
  CreateModifierGroupDto,
  UpdateCategoryDto,
  UpdateItemDto,
  UpdateModifierDto,
  UpdateModifierGroupDto,
} from './dto/menu.dto';

const IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const itemInclude = {
  modifierGroups: {
    orderBy: { sortOrder: 'asc' as const },
    include: { modifiers: { orderBy: { sortOrder: 'asc' as const } } },
  },
};

@Injectable()
export class MenuService {
  private readonly timeZone: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    config: ConfigService,
  ) {
    this.timeZone = config.get<string>('RESTAURANT_TIMEZONE') ?? 'Asia/Karachi';
  }

  // ─── Customer-facing menu ───────────────────────────────────────────────────

  /**
   * Menu as customers see it: active, not sold out, inside serving hours,
   * with unavailable modifiers removed.
   */
  async getFullMenu(branchId: string) {
    const now = this.localTime();

    const categories = await this.prisma.category.findMany({
      where: { branchId, isActive: true },
      orderBy: { sortOrder: 'asc' },
      include: {
        items: {
          where: { isActive: true, isSoldOut: false },
          orderBy: { sortOrder: 'asc' },
          include: {
            modifierGroups: {
              orderBy: { sortOrder: 'asc' },
              include: {
                modifiers: { where: { isAvailable: true }, orderBy: { sortOrder: 'asc' } },
              },
            },
          },
        },
      },
    });

    return categories
      .map((c) => ({ ...c, items: c.items.filter((i) => isServing(i, now)) }))
      .filter((c) => c.items.length > 0);
  }

  // ─── Admin menu (dashboard) ─────────────────────────────────────────────────

  /** Everything, including inactive and sold-out items — for the Menu Manager */
  async getAdminMenu(branchId: string, user: AuthUser) {
    assertBranchAccess(user, branchId);
    return this.prisma.category.findMany({
      where: { branchId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: {
        items: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }], include: itemInclude },
      },
    });
  }

  // ─── Categories ─────────────────────────────────────────────────────────────

  createCategory(dto: CreateCategoryDto, user: AuthUser) {
    assertBranchAccess(user, dto.branchId);
    return this.prisma.category.create({ data: dto });
  }

  async updateCategory(id: string, dto: UpdateCategoryDto, user: AuthUser) {
    await this.loadCategory(id, user);
    return this.prisma.category.update({ where: { id }, data: dto });
  }

  async deleteCategory(id: string, user: AuthUser) {
    await this.loadCategory(id, user);
    const itemCount = await this.prisma.item.count({ where: { categoryId: id } });
    if (itemCount > 0) {
      throw new ConflictException(
        `Category still has ${itemCount} item(s) — move or delete them first, or hide the category instead`,
      );
    }
    await this.prisma.category.delete({ where: { id } });
    return { deleted: true };
  }

  // ─── Items ──────────────────────────────────────────────────────────────────

  async createItem(dto: CreateItemDto, user: AuthUser) {
    const category = await this.loadCategory(dto.categoryId, user);
    assertServingWindow(dto.servingStart, dto.servingEnd);
    if (dto.stationId) await this.assertStation(dto.stationId, category.branchId);
    return this.prisma.item.create({ data: dto, include: itemInclude });
  }

  async updateItem(id: string, dto: UpdateItemDto, user: AuthUser) {
    const item = await this.loadItem(id, user);

    if (dto.categoryId && dto.categoryId !== item.categoryId) {
      const target = await this.loadCategory(dto.categoryId, user);
      if (target.branchId !== item.category.branchId) {
        throw new BadRequestException('Cannot move an item to another branch');
      }
    }
    assertServingWindow(
      dto.servingStart !== undefined ? dto.servingStart : item.servingStart,
      dto.servingEnd !== undefined ? dto.servingEnd : item.servingEnd,
    );
    if (dto.stationId) await this.assertStation(dto.stationId, item.category.branchId);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.item.update({ where: { id }, data: dto, include: itemInclude });
      if (dto.price !== undefined && dto.price !== item.price) {
        await tx.auditLog.create({
          data: {
            userId: user.id,
            entity: 'Item',
            entityId: id,
            action: 'PRICE_EDIT',
            before: { price: item.price },
            after: { price: dto.price },
          },
        });
      }
      return updated;
    });
  }

  /** Items that appear on past orders are archived (hidden) instead of deleted */
  async deleteItem(id: string, user: AuthUser) {
    await this.loadItem(id, user);
    const used = await this.prisma.orderItem.count({ where: { menuItemId: id } });
    if (used > 0) {
      await this.prisma.item.update({ where: { id }, data: { isActive: false } });
      return { deleted: false, archived: true };
    }
    await this.prisma.item.delete({ where: { id } });
    return { deleted: true, archived: false };
  }

  async toggleSoldOut(itemId: string, soldOut: boolean, user: AuthUser) {
    await this.loadItem(itemId, user);
    return this.prisma.item.update({ where: { id: itemId }, data: { isSoldOut: soldOut } });
  }

  async uploadItemImage(id: string, file: Express.Multer.File | undefined, user: AuthUser) {
    await this.loadItem(id, user);
    if (!file) throw new BadRequestException('No file uploaded (field name: "image")');
    const ext = IMAGE_TYPES[file.mimetype];
    if (!ext) throw new BadRequestException('Image must be JPEG, PNG or WebP');
    if (file.size > MAX_IMAGE_BYTES) throw new BadRequestException('Image must be 5 MB or smaller');

    const url = await this.storage.put(`menu/${id}/${randomUUID()}.${ext}`, file.buffer, file.mimetype);
    return this.prisma.item.update({ where: { id }, data: { imageUrl: url }, include: itemInclude });
  }

  // ─── Modifier groups & modifiers ────────────────────────────────────────────

  async createModifierGroup(itemId: string, dto: CreateModifierGroupDto, user: AuthUser) {
    await this.loadItem(itemId, user);
    assertChoices(dto.minChoices ?? 0, dto.maxChoices ?? 1);
    return this.prisma.modifierGroup.create({
      data: { ...dto, itemId },
      include: { modifiers: true },
    });
  }

  async updateModifierGroup(id: string, dto: UpdateModifierGroupDto, user: AuthUser) {
    const group = await this.loadModifierGroup(id, user);
    assertChoices(dto.minChoices ?? group.minChoices, dto.maxChoices ?? group.maxChoices);
    return this.prisma.modifierGroup.update({
      where: { id },
      data: dto,
      include: { modifiers: { orderBy: { sortOrder: 'asc' } } },
    });
  }

  async deleteModifierGroup(id: string, user: AuthUser) {
    await this.loadModifierGroup(id, user);
    const used = await this.prisma.orderItemModifier.count({ where: { modifier: { groupId: id } } });
    if (used > 0) {
      throw new ConflictException(
        'Options in this group appear on past orders — mark the options unavailable instead',
      );
    }
    await this.prisma.modifierGroup.delete({ where: { id } });
    return { deleted: true };
  }

  async createModifier(groupId: string, dto: CreateModifierDto, user: AuthUser) {
    await this.loadModifierGroup(groupId, user);
    return this.prisma.modifier.create({ data: { ...dto, groupId } });
  }

  async updateModifier(id: string, dto: UpdateModifierDto, user: AuthUser) {
    await this.loadModifier(id, user);
    return this.prisma.modifier.update({ where: { id }, data: dto });
  }

  /** Modifiers used on past orders are marked unavailable instead of deleted */
  async deleteModifier(id: string, user: AuthUser) {
    await this.loadModifier(id, user);
    const used = await this.prisma.orderItemModifier.count({ where: { modifierId: id } });
    if (used > 0) {
      await this.prisma.modifier.update({ where: { id }, data: { isAvailable: false } });
      return { deleted: false, archived: true };
    }
    await this.prisma.modifier.delete({ where: { id } });
    return { deleted: true, archived: false };
  }

  // ─── Loaders (existence + branch access) ────────────────────────────────────

  private async loadCategory(id: string, user: AuthUser) {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) throw new NotFoundException(`Category ${id} not found`);
    assertBranchAccess(user, category.branchId);
    return category;
  }

  private async loadItem(id: string, user: AuthUser) {
    const item = await this.prisma.item.findUnique({ where: { id }, include: { category: true } });
    if (!item) throw new NotFoundException(`Item ${id} not found`);
    assertBranchAccess(user, item.category.branchId);
    return item;
  }

  private async loadModifierGroup(id: string, user: AuthUser) {
    const group = await this.prisma.modifierGroup.findUnique({
      where: { id },
      include: { item: { include: { category: true } } },
    });
    if (!group) throw new NotFoundException(`Modifier group ${id} not found`);
    assertBranchAccess(user, group.item.category.branchId);
    return group;
  }

  private async loadModifier(id: string, user: AuthUser) {
    const modifier = await this.prisma.modifier.findUnique({
      where: { id },
      include: { group: { include: { item: { include: { category: true } } } } },
    });
    if (!modifier) throw new NotFoundException(`Modifier ${id} not found`);
    assertBranchAccess(user, modifier.group.item.category.branchId);
    return modifier;
  }

  private async assertStation(stationId: string, branchId: string) {
    const station = await this.prisma.station.findFirst({ where: { id: stationId, branchId } });
    if (!station) throw new BadRequestException('Kitchen station not found in this branch');
  }

  /** Current "HH:MM" in the restaurant's timezone (server may run in UTC) */
  private localTime(): string {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: this.timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(new Date());
  }
}

/** True when `now` falls in the item's serving window. Supports overnight windows. */
export function isServing(
  item: { servingStart: string | null; servingEnd: string | null },
  now: string,
): boolean {
  const { servingStart: start, servingEnd: end } = item;
  if (!start || !end) return true;
  if (start <= end) return now >= start && now < end;
  return now >= start || now < end; // e.g. 22:00–02:00
}

function assertServingWindow(start?: string | null, end?: string | null) {
  if (!!start !== !!end) {
    throw new BadRequestException('Set both servingStart and servingEnd, or neither');
  }
  if (start && start === end) {
    throw new BadRequestException('servingStart and servingEnd cannot be the same time');
  }
}

function assertChoices(min: number, max: number) {
  if (min > max) throw new BadRequestException('minChoices cannot be greater than maxChoices');
}
