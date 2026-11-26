import type { ServiceOrderStatus } from '../../domain/order-status.js';
import type { TransactionClient } from './unit-of-work.js';

export interface OrderUsageRecord {
  id: string;
  productId: string;
  productName: string;
  sku: string | null;
  quantity: string;
  unit: string;
  quantityConsumed: string | null;
  unitPrice: string | null;
}

export interface OrderItemRecord {
  id: string;
  serviceTypeId: string;
  serviceTypeCode: string;
  serviceTypeName: string;
  notes: string | null;
  position: number;
  origin: string | null;
  executionStatus: string | null;
  productUsages: OrderUsageRecord[];
}

export interface ServiceOrderRecord {
  id: string;
  businessId: string;
  orderNumber: string;
  customerId: string;
  vehicleId: string;
  status: ServiceOrderStatus;
  openedAt: string;
  closedAt: string | null;
  closedByUserId: string | null;
  mileage: number;
  nextMaintenanceMileage: number | null;
  nextMaintenanceDate: string | null;
  maintenanceRule: string | null;
  observations: string | null;
  createdBy: string;
  operatorUserId: string | null;
  technicianUserId: string | null;
  createdAt: string;
  updatedAt: string;
  updatedBy: string | null;
  items: OrderItemRecord[];
}

export interface CreateOrderItemInput {
  serviceTypeId: string;
  notes?: string;
  origin?: string;
  executionStatus?: string;
  productUsages: {
    productId: string;
    quantity: string;
    unit?: string;
    quantityConsumed?: string;
    unitPrice?: string;
  }[];
}

export interface CreateServiceOrderData {
  businessId: string;
  actorId: string;
  customerId: string;
  vehicleId: string;
  status: ServiceOrderStatus;
  openedAt: string;
  mileage: number;
  nextMaintenanceMileage?: number;
  nextMaintenanceDate?: string;
  maintenanceRule?: string;
  observations?: string;
  operatorUserId?: string;
  technicianUserId?: string;
  items: CreateOrderItemInput[];
}

export interface ListOrdersQuery {
  status?: ServiceOrderStatus;
  vehicleId?: string;
  search?: string;
  page?: number;
  pageSize?: number;
  sortBy?: 'orderNumber' | 'openedAt' | 'updatedAt' | 'status' | 'mileage';
  sortDir?: 'asc' | 'desc';
}

export interface ServiceOrderRepository {
  create(data: CreateServiceOrderData): Promise<ServiceOrderRecord>;
  findById(businessId: string, id: string): Promise<ServiceOrderRecord | null>;
  list(
    businessId: string,
    query: ListOrdersQuery,
  ): Promise<{ items: ServiceOrderRecord[]; total: number; page: number; pageSize: number }>;
  updateHeader(
    businessId: string,
    id: string,
    actorId: string,
    patch: {
      observations?: string | null;
      operatorUserId?: string | null;
      technicianUserId?: string | null;
      mileage?: number;
      nextMaintenanceMileage?: number | null;
      nextMaintenanceDate?: string | null;
      maintenanceRule?: string | null;
    },
  ): Promise<ServiceOrderRecord>;
  changeStatus(
    businessId: string,
    id: string,
    actorId: string,
    status: ServiceOrderStatus,
  ): Promise<ServiceOrderRecord>;
  lockForUpdate(
    tx: TransactionClient,
    businessId: string,
    id: string,
  ): Promise<ServiceOrderRecord | null>;
  markCompleted(
    tx: TransactionClient,
    input: {
      businessId: string;
      id: string;
      actorId: string;
      closedAt: Date;
    },
  ): Promise<ServiceOrderRecord>;
}
