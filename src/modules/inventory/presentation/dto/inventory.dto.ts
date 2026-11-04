import { InventoryMovementType } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, IsUUID, Matches } from 'class-validator';

const QTY = /^\d+(\.\d{1,3})?$/;

export class RegisterEntryDto {
  @IsUUID()
  productId!: string;

  @IsEnum(InventoryMovementType)
  type!: InventoryMovementType;

  @Matches(QTY)
  quantity!: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class AdjustInventoryDto {
  @IsUUID()
  productId!: string;

  @Matches(QTY)
  targetStock!: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class ListMovementsQueryDto {
  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsOptional()
  @IsEnum(InventoryMovementType)
  type?: InventoryMovementType;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  page?: number;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  pageSize?: number;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;
}
