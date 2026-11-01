import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export class UpdateRestaurantDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name?: string;

  /** Hundredths of a percent: 1700 = 17% */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(5000)
  taxPercent?: number;
}

export class UpdateBranchDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  address?: string;

  @IsOptional()
  @Matches(/^\+?[0-9 -]{7,20}$/, { message: 'Phone must be digits, e.g. +92 300 1234567' })
  phone?: string;
}

export class OpeningHourDto {
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek!: number;

  @Matches(HHMM, { message: 'openTime must be HH:MM' })
  openTime!: string;

  @Matches(HHMM, { message: 'closeTime must be HH:MM' })
  closeTime!: string;

  @IsBoolean()
  isClosed!: boolean;
}

export class SetHoursDto {
  @IsArray()
  @ArrayMaxSize(7)
  @ValidateNested({ each: true })
  @Type(() => OpeningHourDto)
  hours!: OpeningHourDto[];
}

export class BranchQueryDto {
  @IsString()
  @IsNotEmpty()
  branchId!: string;
}
