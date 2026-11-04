import { EntityStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min, MinLength } from 'class-validator';

export class CreateVehicleDto {
  @IsUUID()
  customerId!: string;

  @IsOptional()
  @IsUUID()
  fleetId?: string | null;

  @IsString()
  @MinLength(1)
  @MaxLength(20)
  plate!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  vin?: string | null;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  brand!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  line!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  model?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1900)
  year?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  vehicleType?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  color?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  fuelType?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  engineCapacity?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  version?: string | null;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  currentMileage!: number;

  @IsOptional()
  @IsEnum(EntityStatus)
  status?: EntityStatus;
}

export class UpdateVehicleDto {
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  plate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  vin?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  brand?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  line?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  model?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1900)
  year?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  vehicleType?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  color?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  fuelType?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  engineCapacity?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  version?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  currentMileage?: number;

  @IsOptional()
  @IsEnum(EntityStatus)
  status?: EntityStatus;
}

export class ListVehiclesQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  plate?: string;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsUUID()
  fleetId?: string;

  @IsOptional()
  @IsEnum(EntityStatus)
  status?: EntityStatus;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  page?: number;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  pageSize?: number;
}
