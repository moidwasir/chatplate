import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import { DeliveryService } from './delivery.service';
import { CreateZoneDto, UpdateBranchLocationDto, UpdateZoneDto } from './dto/delivery.dto';

@ApiTags('Delivery')
@ApiBearerAuth()
@Roles('OWNER', 'MANAGER')
@Controller('delivery')
export class DeliveryController {
  constructor(private readonly deliveryService: DeliveryService) {}

  @Get()
  getSettings(@Query('branchId') branchId: string, @CurrentUser() user: AuthUser) {
    return this.deliveryService.getSettings(branchId, user);
  }

  @Patch('branch/:branchId')
  updateBranchLocation(
    @Param('branchId') branchId: string,
    @Body() dto: UpdateBranchLocationDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.deliveryService.updateBranchLocation(branchId, dto, user);
  }

  @Post('zones')
  createZone(@Body() dto: CreateZoneDto, @CurrentUser() user: AuthUser) {
    return this.deliveryService.createZone(dto, user);
  }

  @Patch('zones/:id')
  updateZone(@Param('id') id: string, @Body() dto: UpdateZoneDto, @CurrentUser() user: AuthUser) {
    return this.deliveryService.updateZone(id, dto, user);
  }

  @Delete('zones/:id')
  deleteZone(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.deliveryService.deleteZone(id, user);
  }
}
