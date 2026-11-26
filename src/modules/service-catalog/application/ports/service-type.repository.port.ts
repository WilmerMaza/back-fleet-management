/**
 * Puerto de persistencia del catálogo. Application no importa Prisma.
 */
export type ServiceTypeStatus = 'ACTIVE' | 'INACTIVE';

export interface ServiceTypeRecord {
  id: string;
  businessId: string;
  code: string;
  name: string;
  category: string | null;
  description: string | null;
  status: ServiceTypeStatus;
  parameters: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
}

export interface ListServiceTypesFilter {
  status?: ServiceTypeStatus;
  search?: string;
}

export interface CreateServiceTypeData {
  businessId: string;
  actorId: string;
  code: string;
  name: string;
  category?: string | null;
  description?: string | null;
  status?: ServiceTypeStatus;
  parameters?: Record<string, unknown> | null;
}

export interface UpdateServiceTypeData {
  name?: string;
  category?: string | null;
  description?: string | null;
  status?: ServiceTypeStatus;
  parameters?: Record<string, unknown> | null;
  actorId: string;
}

export interface ServiceTypeRepositoryPort {
  list(businessId: string, filter?: ListServiceTypesFilter): Promise<ServiceTypeRecord[]>;
  findById(businessId: string, id: string): Promise<ServiceTypeRecord | null>;
  create(data: CreateServiceTypeData): Promise<ServiceTypeRecord>;
  update(
    businessId: string,
    id: string,
    data: UpdateServiceTypeData,
  ): Promise<ServiceTypeRecord | null>;
}
