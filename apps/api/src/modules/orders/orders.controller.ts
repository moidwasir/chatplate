import {
  Controller,
  Get,
  Param,
  Patch,
  Query,
  Body,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { OrderStatus } from '@safi/types';
import { OrdersService } from './orders.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { assertBranchAccess } from '../auth/guards/roles.guard';
import type { AuthUser } from '../auth/auth.types';
import { ListOrdersQueryDto, OrderStatsQueryDto, UpdateOrderStatusDto } from './dto/orders.dto';

@ApiTags('Orders')
@ApiBearerAuth()
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  /** Filtered, paged list: `{ items, total, page, pageSize }` */
  @Get()
  findAll(@CurrentUser() user: AuthUser, @Query() query: ListOrdersQueryDto) {
    assertBranchAccess(user, query.branchId);
    return this.ordersService.findAll(query);
  }

  /** Order counts per status and sales for a date range (management sidebar) */
  @Get('stats')
  stats(@CurrentUser() user: AuthUser, @Query() query: OrderStatsQueryDto) {
    assertBranchAccess(user, query.branchId);
    return this.ordersService.stats(query);
  }

  @Get(':id')
  async findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const order = await this.ordersService.findOne(id);
    assertBranchAccess(user, order.branchId);
    return order;
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() body: UpdateOrderStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    // changedBy comes from the token, never the request body
    return this.ordersService.updateStatus(id, body.status as OrderStatus, user, body.reason, body.estimatedMinutes);
  }
}

