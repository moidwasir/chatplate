import { IsEnum, IsString, IsUUID, IsOptional, IsInt, Min, Max, MaxLength, IsArray, ValidateNested, IsNumber, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateOrderModifierDto {
  @IsUUID() groupId!: string;
  @IsUUID() modifierId!: string;
  @IsString() name!: string;
  @IsInt() @Min(0) priceAdjustment!: number;
}

export class CreateOrderItemDto {
  @IsUUID() menuItemId!: string;
  @IsString() name!: string;
  @IsInt() @Min(0) unitPrice!: number;
  @IsInt() @Min(1) quantity!: number;
  @IsArray() @ValidateNested({ each: true }) @Type(() => CreateOrderModifierDto)
  selectedModifiers!: CreateOrderModifierDto[];
  @IsOptional() @IsString() notes?: string;
}

export class CreateOrderDto {
  @IsUUID() branchId!: string;
  @IsEnum(['DELIVERY', 'PICKUP', 'DINE_IN']) orderType!: string;
  @IsEnum(['WHATSAPP', 'POS', 'PHONE', 'DINE_IN']) source!: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => CreateOrderItemDto)
  items!: CreateOrderItemDto[];
  @IsOptional() @IsUUID() addressId?: string;
  @IsOptional() @IsString() promoCode?: string;
  @IsOptional() @IsInt() @Min(0) tip?: number;   // paisa
  @IsEnum(['COD', 'JAZZCASH', 'EASYPAISA', 'CARD', 'COUNTER']) paymentMethod!: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() customerId?: string;
  @IsOptional() @IsInt() @Min(0) deliveryFee?: number;     // paisa
  @IsOptional() @IsInt() @Min(0) discountAmount?: number;  // paisa
}

export class UpdateOrderStatusDto {
  @ApiProperty({ enum: ['ACCEPTED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'PICKED_UP', 'CANCELLED', 'REFUNDED'] })
  @IsEnum(['ACCEPTED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'PICKED_UP', 'CANCELLED', 'REFUNDED'])
  status!: string;
  @ApiPropertyOptional({ description: 'Required when cancelling; shown to the customer' })
  @IsOptional() @IsString() @MaxLength(200) reason?: string;
  @ApiPropertyOptional({ description: 'Prep/delivery estimate in minutes, set when accepting' })
  @IsOptional() @IsInt() @Min(5) @Max(180) estimatedMinutes?: number;
}


export class ListOrdersQueryDto {
  @ApiProperty() @IsString() branchId!: string;
  @ApiPropertyOptional({ description: 'One status or a comma-separated list, e.g. NEW,ACCEPTED' })
  @IsOptional() @IsString() status?: string;
  @ApiPropertyOptional({ enum: ['DELIVERY', 'PICKUP', 'DINE_IN'] })
  @IsOptional() @IsEnum(['DELIVERY', 'PICKUP', 'DINE_IN']) orderType?: string;
  @ApiPropertyOptional({ description: 'Placed at or after (ISO date-time)' })
  @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional({ description: 'Placed before (ISO date-time)' })
  @IsOptional() @IsDateString() to?: string;
  @ApiPropertyOptional({ description: 'Order number, customer name or phone' })
  @IsOptional() @IsString() @MaxLength(60) q?: string;
  @ApiPropertyOptional({ default: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @ApiPropertyOptional({ default: 50 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) pageSize?: number;
}

export class OrderStatsQueryDto {
  @ApiProperty() @IsString() branchId!: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() to?: string;
}
