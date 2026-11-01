import { PartialType, OmitType } from '@nestjs/mapped-types';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

// ─── Categories ───────────────────────────────────────────────────────────────

export class CreateCategoryDto {
  @IsString()
  @IsNotEmpty()
  branchId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  nameUrdu?: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateCategoryDto extends PartialType(OmitType(CreateCategoryDto, ['branchId'] as const)) {}

// ─── Items ────────────────────────────────────────────────────────────────────

export class CreateItemDto {
  @IsString()
  @IsNotEmpty()
  categoryId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  nameUrdu?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  /** Price in paisa (PKR 450 = 45000) */
  @IsInt()
  @Min(0)
  price!: number;

  /** Regular price in paisa, for deals ("save PKR X"); must be above `price`. null clears it */
  @IsOptional()
  @IsInt()
  @Min(0)
  compareAtPrice?: number | null;

  @IsOptional()
  @IsString()
  stationId?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  isSoldOut?: boolean;

  /** "HH:MM" in restaurant local time; both null = always available. Overnight windows (22:00–02:00) allowed. */
  @ValidateIf((o) => o.servingStart !== null && o.servingStart !== undefined)
  @Matches(HHMM, { message: 'servingStart must be HH:MM' })
  servingStart?: string | null;

  @ValidateIf((o) => o.servingEnd !== null && o.servingEnd !== undefined)
  @Matches(HHMM, { message: 'servingEnd must be HH:MM' })
  servingEnd?: string | null;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class UpdateItemDto extends PartialType(CreateItemDto) {}

// ─── Modifier groups (size, add-ons, spice level…) ───────────────────────────

export class CreateModifierGroupDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  nameUrdu?: string;

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  minChoices?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxChoices?: number;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class UpdateModifierGroupDto extends PartialType(CreateModifierGroupDto) {}

export class CreateModifierDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  nameUrdu?: string;

  /** Paisa added to the item price; may be negative */
  @IsOptional()
  @IsInt()
  priceAdjustment?: number;

  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class UpdateModifierDto extends PartialType(CreateModifierDto) {}

export class SoldOutDto {
  @IsBoolean()
  soldOut!: boolean;
}
