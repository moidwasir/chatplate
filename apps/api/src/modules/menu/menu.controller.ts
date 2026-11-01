import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { MAX_IMAGE_BYTES, MenuService } from './menu.service';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import {
  CreateCategoryDto,
  CreateItemDto,
  CreateModifierDto,
  CreateModifierGroupDto,
  SoldOutDto,
  UpdateCategoryDto,
  UpdateItemDto,
  UpdateModifierDto,
  UpdateModifierGroupDto,
} from './dto/menu.dto';

@ApiTags('Menu')
@ApiBearerAuth()
@Roles('OWNER', 'MANAGER')
@Controller('menu')
export class MenuController {
  constructor(private readonly menuService: MenuService) {}

  // Menu is public — shown to customers
  @Public()
  @Get()
  getMenu(@Query('branchId') branchId: string) {
    return this.menuService.getFullMenu(branchId);
  }

  @Get('admin')
  getAdminMenu(@Query('branchId') branchId: string, @CurrentUser() user: AuthUser) {
    return this.menuService.getAdminMenu(branchId, user);
  }

  // ─── Categories ─────────────────────────────────────────────────────────────

  @Post('categories')
  createCategory(@Body() dto: CreateCategoryDto, @CurrentUser() user: AuthUser) {
    return this.menuService.createCategory(dto, user);
  }

  @Patch('categories/:id')
  updateCategory(
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.menuService.updateCategory(id, dto, user);
  }

  @Delete('categories/:id')
  deleteCategory(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.menuService.deleteCategory(id, user);
  }

  // ─── Items ──────────────────────────────────────────────────────────────────

  @Post('items')
  createItem(@Body() dto: CreateItemDto, @CurrentUser() user: AuthUser) {
    return this.menuService.createItem(dto, user);
  }

  @Patch('items/:id')
  updateItem(@Param('id') id: string, @Body() dto: UpdateItemDto, @CurrentUser() user: AuthUser) {
    return this.menuService.updateItem(id, dto, user);
  }

  @Delete('items/:id')
  deleteItem(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.menuService.deleteItem(id, user);
  }

  /** Kitchen can mark items sold out too */
  @Roles('OWNER', 'MANAGER', 'KITCHEN')
  @Patch('items/:id/availability')
  toggleSoldOut(@Param('id') id: string, @Body() dto: SoldOutDto, @CurrentUser() user: AuthUser) {
    return this.menuService.toggleSoldOut(id, dto.soldOut, user);
  }

  @Post('items/:id/image')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('image', { limits: { fileSize: MAX_IMAGE_BYTES } }))
  uploadImage(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    return this.menuService.uploadItemImage(id, file, user);
  }

  // ─── Modifier groups & modifiers ────────────────────────────────────────────

  @Post('items/:id/modifier-groups')
  createModifierGroup(
    @Param('id') itemId: string,
    @Body() dto: CreateModifierGroupDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.menuService.createModifierGroup(itemId, dto, user);
  }

  @Patch('modifier-groups/:id')
  updateModifierGroup(
    @Param('id') id: string,
    @Body() dto: UpdateModifierGroupDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.menuService.updateModifierGroup(id, dto, user);
  }

  @Delete('modifier-groups/:id')
  deleteModifierGroup(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.menuService.deleteModifierGroup(id, user);
  }

  @Post('modifier-groups/:id/modifiers')
  createModifier(
    @Param('id') groupId: string,
    @Body() dto: CreateModifierDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.menuService.createModifier(groupId, dto, user);
  }

  @Patch('modifiers/:id')
  updateModifier(
    @Param('id') id: string,
    @Body() dto: UpdateModifierDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.menuService.updateModifier(id, dto, user);
  }

  @Delete('modifiers/:id')
  deleteModifier(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.menuService.deleteModifier(id, user);
  }
}
