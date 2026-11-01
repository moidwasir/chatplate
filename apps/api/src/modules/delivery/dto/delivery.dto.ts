import { PartialType, OmitType } from '@nestjs/mapped-types';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateBranchLocationDto {
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat!: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  lng!: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  address?: string;
}

/** A delivery zone is a circle of `radiusKm` around the branch */
export class CreateZoneDto {
  @IsString()
  @IsNotEmpty()
  branchId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name!: string;

  @IsNumber()
  @Min(0.5)
  @Max(100)
  radiusKm!: number;

  @IsIn(['FLAT', 'PER_KM'])
  feeType!: 'FLAT' | 'PER_KM';

  /** Paisa; used when feeType is FLAT */
  @IsOptional()
  @IsInt()
  @Min(0)
  flatFee?: number | null;

  /** Paisa per started km; used when feeType is PER_KM */
  @IsOptional()
  @IsInt()
  @Min(0)
  perKmFee?: number | null;

  /** Paisa basket value from which delivery is free; null = never free */
  @IsOptional()
  @IsInt()
  @Min(0)
  freeAbove?: number | null;

  /** Paisa */
  @IsOptional()
  @IsInt()
  @Min(0)
  minOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateZoneDto extends PartialType(OmitType(CreateZoneDto, ['branchId'] as const)) {}
