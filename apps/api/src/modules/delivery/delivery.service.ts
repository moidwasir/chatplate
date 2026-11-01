import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { assertBranchAccess } from '../auth/guards/roles.guard';
import type { AuthUser } from '../auth/auth.types';
import { CreateZoneDto, UpdateBranchLocationDto, UpdateZoneDto } from './dto/delivery.dto';

@Injectable()
export class DeliveryService {
  constructor(private readonly prisma: PrismaService) {}

  /** Branch pin + its zones, for the dashboard Delivery page */
  async getSettings(branchId: string, user: AuthUser) {
    assertBranchAccess(user, branchId);
    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
      select: { id: true, name: true, address: true, lat: true, lng: true },
    });
    if (!branch) throw new NotFoundException('Branch not found');
    const zones = await this.prisma.deliveryZone.findMany({ where: { branchId }, orderBy: { createdAt: 'asc' } });
    return { branch, zones };
  }

  async updateBranchLocation(branchId: string, dto: UpdateBranchLocationDto, user: AuthUser) {
    assertBranchAccess(user, branchId);
    return this.prisma.branch.update({
      where: { id: branchId },
      data: { lat: dto.lat, lng: dto.lng, ...(dto.address?.trim() ? { address: dto.address.trim() } : {}) },
      select: { id: true, name: true, address: true, lat: true, lng: true },
    });
  }

  async createZone(dto: CreateZoneDto, user: AuthUser) {
    assertBranchAccess(user, dto.branchId);
    this.assertFee(dto.feeType, dto.flatFee, dto.perKmFee);
    return this.prisma.deliveryZone.create({
      data: {
        branchId: dto.branchId,
        name: dto.name.trim(),
        polygon: Prisma.DbNull,
        maxDistance: dto.radiusKm,
        feeType: dto.feeType,
        flatFee: dto.flatFee ?? null,
        perKmFee: dto.perKmFee ?? null,
        freeAbove: dto.freeAbove ?? null,
        minOrder: dto.minOrder ?? 0,
        isActive: dto.isActive ?? true,
      },
    });
  }

  /** Setting radiusKm turns a drawn-area zone into a radius zone */
  async updateZone(id: string, dto: UpdateZoneDto, user: AuthUser) {
    const zone = await this.findZone(id, user);
    const feeType = dto.feeType ?? (zone.feeType === 'PER_KM' ? 'PER_KM' : 'FLAT');
    this.assertFee(
      feeType,
      dto.flatFee !== undefined ? dto.flatFee : zone.flatFee,
      dto.perKmFee !== undefined ? dto.perKmFee : zone.perKmFee,
    );
    return this.prisma.deliveryZone.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.radiusKm !== undefined ? { maxDistance: dto.radiusKm, polygon: Prisma.DbNull } : {}),
        ...(dto.feeType !== undefined ? { feeType: dto.feeType } : {}),
        ...(dto.flatFee !== undefined ? { flatFee: dto.flatFee } : {}),
        ...(dto.perKmFee !== undefined ? { perKmFee: dto.perKmFee } : {}),
        ...(dto.freeAbove !== undefined ? { freeAbove: dto.freeAbove } : {}),
        ...(dto.minOrder !== undefined ? { minOrder: dto.minOrder } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
  }

  async deleteZone(id: string, user: AuthUser) {
    await this.findZone(id, user);
    await this.prisma.deliveryZone.delete({ where: { id } });
    return { deleted: true };
  }

  private async findZone(id: string, user: AuthUser) {
    const zone = await this.prisma.deliveryZone.findUnique({ where: { id } });
    if (!zone) throw new NotFoundException('Delivery zone not found');
    assertBranchAccess(user, zone.branchId);
    return zone;
  }

  private assertFee(feeType: 'FLAT' | 'PER_KM', flatFee?: number | null, perKmFee?: number | null) {
    if (feeType === 'FLAT' && flatFee == null) throw new BadRequestException('Set the delivery fee');
    if (feeType === 'PER_KM' && perKmFee == null) throw new BadRequestException('Set the fee per km');
  }
}
