import { Injectable } from '@nestjs/common';
import { EntityStatus, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { Errors } from '../../../../shared/common/app-error.js';
import { PrismaService } from '../../../../shared/database/prisma.service.js';
import type {
  CreateServiceTypeData,
  ListServiceTypesFilter,
  ServiceTypeRecord,
  ServiceTypeRepositoryPort,
  UpdateServiceTypeData,
} from '../../application/ports/service-type.repository.port.js';

@Injectable()
export class PrismaServiceTypeRepository implements ServiceTypeRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async list(businessId: string, filter: ListServiceTypesFilter = {}): Promise<ServiceTypeRecord[]> {
    const where: Prisma.ServiceTypeWhereInput = { businessId };
    if (filter.status) {
      where.status = filter.status;
    }
    const search = filter.search?.trim();
    if (search) {
      where.OR = [
        { code: { contains: search.toUpperCase(), mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
        { category: { contains: search, mode: 'insensitive' } },
      ];
    }
    const rows = await this.prisma.serviceType.findMany({
      where,
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
    });
    return rows.map(toRecord);
  }

  async findById(businessId: string, id: string): Promise<ServiceTypeRecord | null> {
    const row = await this.prisma.serviceType.findFirst({ where: { id, businessId } });
    return row ? toRecord(row) : null;
  }

  async create(data: CreateServiceTypeData): Promise<ServiceTypeRecord> {
    try {
      const row = await this.prisma.serviceType.create({
        data: {
          id: randomUUID(),
          businessId: data.businessId,
          code: data.code,
          name: data.name,
          category: data.category ?? null,
          description: data.description ?? null,
          status: data.status ?? EntityStatus.ACTIVE,
          parameters: toJson(data.parameters),
          createdBy: data.actorId,
          updatedBy: data.actorId,
        },
      });
      return toRecord(row);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw Errors.serviceTypeCodeExists(data.code);
      }
      throw error;
    }
  }

  async update(
    businessId: string,
    id: string,
    data: UpdateServiceTypeData,
  ): Promise<ServiceTypeRecord | null> {
    const existing = await this.prisma.serviceType.findFirst({ where: { id, businessId } });
    if (!existing) {
      return null;
    }
    const row = await this.prisma.serviceType.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.category !== undefined ? { category: data.category } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.parameters !== undefined ? { parameters: toJson(data.parameters) } : {}),
        updatedBy: data.actorId,
      },
    });
    return toRecord(row);
  }
}

function toJson(
  value: Record<string, unknown> | null | undefined,
): Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return Prisma.JsonNull;
  }
  return value as Prisma.InputJsonValue;
}

function toRecord(row: {
  id: string;
  businessId: string;
  code: string;
  name: string;
  category: string | null;
  description: string | null;
  status: EntityStatus;
  parameters: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
}): ServiceTypeRecord {
  return {
    id: row.id,
    businessId: row.businessId,
    code: row.code,
    name: row.name,
    category: row.category,
    description: row.description,
    status: row.status,
    parameters: asParameters(row.parameters),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
  };
}

function asParameters(value: Prisma.JsonValue): Record<string, unknown> | null {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}
