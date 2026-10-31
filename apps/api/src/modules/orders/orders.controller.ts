import {
  Controller,
  Get,
  Param,
  Patch,
  Query,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { OrdersService } from './orders.service';

@ApiTags('Orders')
@ApiBearerAuth()
// @UseGuards(JwtAuthGuard) — TODO: enable when auth module is wired
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  findAll(@Query('branchId') branchId: string, @Query('status') status?: string) {
    return this.ordersService.findAll(branchId, status);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.ordersService.findOne(id);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() body: { status: string; reason?: string; changedBy: string },
  ) {
    return this.ordersService.updateStatus(id, body.status as any, body.changedBy, body.reason);
  }
}
