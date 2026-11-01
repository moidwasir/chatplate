import { Body, Controller, Get, Param, Patch, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import { SettingsService } from './settings.service';
import { BranchQueryDto, SetHoursDto, UpdateBranchDto, UpdateRestaurantDto } from './settings.dto';

@ApiTags('Settings')
@ApiBearerAuth()
@Roles('OWNER', 'MANAGER')
@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  get(@Query() query: BranchQueryDto, @CurrentUser() user: AuthUser) {
    return this.settings.get(query.branchId, user);
  }

  @Patch('restaurant')
  updateRestaurant(@Query() query: BranchQueryDto, @Body() dto: UpdateRestaurantDto, @CurrentUser() user: AuthUser) {
    return this.settings.updateRestaurant(query.branchId, dto, user);
  }

  @Patch('branch/:branchId')
  updateBranch(@Param('branchId') branchId: string, @Body() dto: UpdateBranchDto, @CurrentUser() user: AuthUser) {
    return this.settings.updateBranch(branchId, dto, user);
  }

  @Put('branch/:branchId/hours')
  setHours(@Param('branchId') branchId: string, @Body() dto: SetHoursDto, @CurrentUser() user: AuthUser) {
    return this.settings.setHours(branchId, dto.hours, user);
  }
}
