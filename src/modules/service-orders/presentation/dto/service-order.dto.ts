import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { SERVICE_ORDER_STATUSES } from '../../domain/order-status.js';

const QTY = /^\d+(\.\d{1,3})?$/;

export class ProductUsageDto {
  @IsUUID()
  productId!: string;

  @Matches(QTY)
  quantity!: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  unit?: string;

  @IsOptional()
  @Matches(QTY)
  quantityConsumed?: string;

  @IsOptional()
  @IsString()
  unitPrice?: string;
}

export class OrderItemDto {
  @IsUUID()
  serviceTypeId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  origin?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  executionStatus?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductUsageDto)
  productUsages!: ProductUsageDto[];
}

export class CreateServiceOrderDto {
  @IsUUID()
  customerId!: string;

  @IsUUID()
  vehicleId!: string;

  @IsOptional()
  @IsEnum(SERVICE_ORDER_STATUSES)
  status?: (typeof SERVICE_ORDER_STATUSES)[number];

  @IsString()
  openedAt!: string;

  @IsInt()
  @Min(0)
  mileage!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  nextMaintenanceMileage?: number;

  @IsOptional()
  @IsString()
  nextMaintenanceDate?: string;

  @IsOptional()
  @IsString()
  maintenanceRule?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observations?: string;

  @IsOptional()
  @IsUUID()
  operatorUserId?: string;

  @IsOptional()
  @IsUUID()
  technicianUserId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items!: OrderItemDto[];
}

export class UpdateServiceOrderDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observations?: string | null;

  @IsOptional()
  @IsUUID()
  operatorUserId?: string | null;

  @IsOptional()
  @IsUUID()
  technicianUserId?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  mileage?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  nextMaintenanceMileage?: number | null;

  @IsOptional()
  @IsString()
  nextMaintenanceDate?: string | null;

  @IsOptional()
  @IsString()
  maintenanceRule?: string | null;
}

export class ChangeStatusDto {
  @IsEnum(SERVICE_ORDER_STATUSES)
  status!: (typeof SERVICE_ORDER_STATUSES)[number];
}

export class ListServiceOrdersQueryDto {
  @IsOptional()
  @IsEnum(SERVICE_ORDER_STATUSES)
  status?: (typeof SERVICE_ORDER_STATUSES)[number];

  @IsOptional()
  @IsUUID()
  vehicleId?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  page?: number;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  pageSize?: number;

  @IsOptional()
  @IsString()
  sortBy?: 'orderNumber' | 'openedAt' | 'updatedAt' | 'status' | 'mileage';

  @IsOptional()
  @IsString()
  sortDir?: 'asc' | 'desc';
}
