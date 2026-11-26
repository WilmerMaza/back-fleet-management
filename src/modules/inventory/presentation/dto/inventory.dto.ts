import { InventoryMovementType } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

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
  @MaxLength(500)
  reason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  operationKey?: string;

  @IsOptional()
  @IsString()
  operatedAt?: string;
}

export class RegisterExitDto {
  @IsUUID()
  productId!: string;

  @Matches(QTY)
  quantity!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  operationKey?: string;

  @IsOptional()
  @IsString()
  operatedAt?: string;
}

export class AdjustInventoryDto {
  @IsUUID()
  productId!: string;

  @Matches(QTY)
  targetStock!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  operationKey?: string;
}

export class PurchaseReceiptLineDto {
  @IsUUID()
  productId!: string;

  @Matches(QTY)
  quantity!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(30)
  unit!: string;
}

export class CreatePurchaseReceiptDto {
  @IsString()
  @MinLength(1)
  @MaxLength(180)
  supplierName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  documentRef?: string;

  @IsString()
  receivedAt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  operationKey?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PurchaseReceiptLineDto)
  lines!: PurchaseReceiptLineDto[];
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
