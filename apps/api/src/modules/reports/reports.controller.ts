import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsDateString, IsNotEmpty, IsString } from 'class-validator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import { ReportsService } from './reports.service';

class SalesReportQueryDto {
  @IsString()
  @IsNotEmpty()
  branchId!: string;

  @IsDateString()
  from!: string;

  @IsDateString()
  to!: string;
}

@ApiTags('Reports')
@ApiBearerAuth()
@Roles('OWNER', 'MANAGER')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('sales')
  sales(@Query() query: SalesReportQueryDto, @CurrentUser() user: AuthUser) {
    return this.reports.sales(query.branchId, new Date(query.from), new Date(query.to), user);
  }
}
