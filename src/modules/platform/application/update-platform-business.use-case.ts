/**
 * Actualiza perfil/estado de un negocio (activar / suspender).
 */
import { Injectable } from '@nestjs/common';
import { AuditService } from '../../audit/audit.service.js';
import { Errors } from '../../../shared/common/app-error.js';
import { PrismaService } from '../../../shared/database/prisma.service.js';
import type { PlatformBusinessDetail } from './get-platform-business.use-case.js';
import { GetPlatformBusinessUseCase } from './get-platform-business.use-case.js';

export interface UpdatePlatformBusinessInput {
  businessId: string;
  actorUserId: string;
  name?: string;
  legalName?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  status?: 'ACTIVE' | 'SUSPENDED';
}

@Injectable()
export class UpdatePlatformBusinessUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly getBusiness: GetPlatformBusinessUseCase,
  ) {}

  async execute(input: UpdatePlatformBusinessInput): Promise<PlatformBusinessDetail> {
    const existing = await this.prisma.business.findUnique({ where: { id: input.businessId } });
    if (!existing) {
      throw Errors.businessNotFound();
    }

    const data: {
      name?: string;
      legalName?: string | null;
      email?: string | null;
      phone?: string | null;
      address?: string | null;
      status?: 'ACTIVE' | 'SUSPENDED';
    } = {};
    if (input.name !== undefined) data.name = input.name.trim();
    if (input.legalName !== undefined) data.legalName = input.legalName?.trim() || null;
    if (input.email !== undefined) data.email = input.email?.trim() || null;
    if (input.phone !== undefined) data.phone = input.phone?.trim() || null;
    if (input.address !== undefined) data.address = input.address?.trim() || null;
    if (input.status !== undefined) data.status = input.status;

    if (Object.keys(data).length === 0) {
      return this.getBusiness.execute(input.businessId);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.business.update({ where: { id: input.businessId }, data });
      await this.audit.record(
        {
          businessId: input.businessId,
          actorUserId: input.actorUserId,
          action: 'business.platform_updated',
          entityType: 'business',
          entityId: input.businessId,
          metadata: data,
        },
        tx,
      );
    });

    return this.getBusiness.execute(input.businessId);
  }
}
