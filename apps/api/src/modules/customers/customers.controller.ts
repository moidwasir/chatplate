import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import { CustomersService } from './customers.service';

class ListCustomersQueryDto {
  @IsString()
  @IsNotEmpty()
  branchId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;
}

class BranchQueryDto {
  @IsString()
  @IsNotEmpty()
  branchId!: string;
}

class UpdateCustomerDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsBoolean()
  isBlocked?: boolean;
}

class AddNoteDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  note!: string;
}

@ApiTags('Customers')
@ApiBearerAuth()
@Roles('OWNER', 'MANAGER')
@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  list(@Query() query: ListCustomersQueryDto, @CurrentUser() user: AuthUser) {
    return this.customers.list(query.branchId, user, { q: query.q, page: query.page ?? 1, pageSize: query.pageSize ?? 50 });
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Query() query: BranchQueryDto, @CurrentUser() user: AuthUser) {
    return this.customers.findOne(id, query.branchId, user);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCustomerDto, @CurrentUser() user: AuthUser) {
    return this.customers.update(id, dto, user);
  }

  @Post(':id/notes')
  addNote(@Param('id') id: string, @Body() dto: AddNoteDto, @CurrentUser() user: AuthUser) {
    return this.customers.addNote(id, dto.note, user);
  }

  @Delete(':id/notes/:noteId')
  deleteNote(@Param('id') id: string, @Param('noteId') noteId: string, @CurrentUser() user: AuthUser) {
    return this.customers.deleteNote(id, noteId, user);
  }
}
