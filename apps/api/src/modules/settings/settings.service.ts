import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { assertBranchAccess } from '../auth/guards/roles.guard';
import type { AuthUser } from '../auth/auth.types';
import type { OpeningHourDto, UpdateBranchDto, UpdateRestaurantDto } from './settings.dto';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(branchId: string, user: AuthUser) {
    assertBranchAccess(user, branchId);
    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
      select: {
        id: true,
        name: true,
        address: true,
        phone: true,
        restaurant: { select: { id: true, name: true, taxPercent: true, currency: true } },
        openingHours: { orderBy: { dayOfWeek: 'asc' } },
      },
    });
    if (!branch) throw new NotFoundException('Branch not found');
    const { restaurant, openingHours, ...rest } = branch;
    return { restaurant, branch: rest, openingHours };
  }

  /** Restaurant-wide: owners only */
  async updateRestaurant(branchId: string, dto: UpdateRestaurantDto, user: AuthUser) {
    if (user.role !== 'OWNER') throw new ForbiddenException('Only the owner can change restaurant details');
    const branch = await this.prisma.branch.findUnique({ where: { id: branchId }, select: { restaurantId: true } });
    if (!branch) throw new NotFoundException('Branch not found');
    return this.prisma.restaurant.update({
      where: { id: branch.restaurantId },
      data: {
        ...(dto.name !== undefined && { name: dto.name.trim() }),
        ...(dto.taxPercent !== undefined && { taxPercent: dto.taxPercent }),
      },
      select: { id: true, name: true, taxPercent: true, currency: true },
    });
  }

  async updateBranch(branchId: string, dto: UpdateBranchDto, user: AuthUser) {
    assertBranchAccess(user, branchId);
    return this.prisma.branch.update({
      where: { id: branchId },
      data: {
        ...(dto.name !== undefined && { name: dto.name.trim() }),
        ...(dto.address !== undefined && { address: dto.address.trim() }),
        ...(dto.phone !== undefined && { phone: dto.phone.trim() }),
      },
      select: { id: true, name: true, address: true, phone: true },
    });
  }

  /** Replace the week's hours (one entry per day, 0 = Sunday) */
  async setHours(branchId: string, hours: OpeningHourDto[], user: AuthUser) {
    assertBranchAccess(user, branchId);
    const days = new Set(hours.map((h) => h.dayOfWeek));
    if (days.size !== hours.length) throw new BadRequestException('Each day can only appear once');

    await this.prisma.$transaction(
      hours.map((h) =>
        this.prisma.openingHour.upsert({
          where: { branchId_dayOfWeek: { branchId, dayOfWeek: h.dayOfWeek } },
          update: { openTime: h.openTime, closeTime: h.closeTime, isClosed: h.isClosed },
          create: { branchId, dayOfWeek: h.dayOfWeek, openTime: h.openTime, closeTime: h.closeTime, isClosed: h.isClosed },
        }),
      ),
    );
    return this.prisma.openingHour.findMany({ where: { branchId }, orderBy: { dayOfWeek: 'asc' } });
  }
}
