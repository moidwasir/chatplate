import { Controller, Get, Patch, Param, Query, Body } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { MenuService } from './menu.service';

@ApiTags('Menu')
@Controller('menu')
export class MenuController {
  constructor(private readonly menuService: MenuService) {}

  @Get()
  getMenu(@Query('branchId') branchId: string) {
    return this.menuService.getFullMenu(branchId);
  }

  @Patch('items/:id/availability')
  toggleSoldOut(
    @Param('id') id: string,
    @Query('branchId') branchId: string,
    @Body() body: { soldOut: boolean },
  ) {
    return this.menuService.toggleSoldOut(id, body.soldOut, branchId);
  }
}

