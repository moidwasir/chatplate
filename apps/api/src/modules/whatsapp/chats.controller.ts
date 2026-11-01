import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import type { HandledBy } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { assertBranchAccess } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import { ChatsService } from './chats.service';
import { ConversationEngine } from './conversation.engine';

class ListChatsQueryDto {
  @IsString()
  @IsNotEmpty()
  branchId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;

  @IsOptional()
  @IsIn(['BOT', 'HUMAN'])
  handledBy?: HandledBy;
}

class BranchQueryDto {
  @IsString()
  @IsNotEmpty()
  branchId!: string;
}

class ReplyDto {
  @IsString()
  @IsNotEmpty()
  branchId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  text!: string;
}

class SetHandlerDto {
  @IsString()
  @IsNotEmpty()
  branchId!: string;

  @IsIn(['BOT', 'HUMAN'])
  handledBy!: HandledBy;
}

@ApiTags('Chats')
@ApiBearerAuth()
@Roles('OWNER', 'MANAGER', 'CASHIER')
@Controller('chats')
export class ChatsController {
  constructor(
    private readonly chats: ChatsService,
    private readonly engine: ConversationEngine,
  ) {}

  /** The menu picture customers get for "menu" (made on first request after a menu change) */
  @Get('menu-picture')
  async menuPicture(@Query() query: BranchQueryDto, @CurrentUser() user: AuthUser) {
    assertBranchAccess(user, query.branchId);
    return { url: await this.engine.menuPictureUrl(query.branchId) };
  }

  @Get()
  list(@Query() query: ListChatsQueryDto, @CurrentUser() user: AuthUser) {
    return this.chats.list(query.branchId, user, { q: query.q, handledBy: query.handledBy });
  }

  @Get(':customerId')
  thread(@Param('customerId') customerId: string, @Query() query: BranchQueryDto, @CurrentUser() user: AuthUser) {
    return this.chats.thread(customerId, query.branchId, user);
  }

  @Post(':customerId/reply')
  reply(@Param('customerId') customerId: string, @Body() dto: ReplyDto, @CurrentUser() user: AuthUser) {
    return this.chats.reply(customerId, dto.branchId, dto.text.trim(), user);
  }

  @Post(':customerId/handler')
  setHandler(@Param('customerId') customerId: string, @Body() dto: SetHandlerDto, @CurrentUser() user: AuthUser) {
    return this.chats.setHandler(customerId, dto.branchId, dto.handledBy, user);
  }
}
