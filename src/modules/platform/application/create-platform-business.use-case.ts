/**
 * Crea un negocio desde plataforma: roles de sistema + invitación ADMIN.
 */
import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { AuditService } from '../../audit/audit.service.js';
import { AppError } from '../../../shared/common/app-error.js';
import { PrismaService } from '../../../shared/database/prisma.service.js';
import { SendInvitationEmailUseCase } from '../../notifications/application/send-invitation-email.use-case.js';
import { createInvitationToken, invitationExpiresAt } from './create-invitation-token.js';
import { seedBusinessSystemRoles } from './seed-business-system-roles.js';

export interface CreatePlatformBusinessInput {
  name: string;
  legalName?: string | null;
  taxId?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  adminEmail: string;
  actorUserId: string;
}

export interface CreatePlatformBusinessResult {
  id: string;
  name: string;
  legalName: string | null;
  taxId: string | null;
  email: string | null;
  status: string;
  createdAt: string;
  invitation: {
    invitationId: string;
    email: string;
    roleCode: string;
    expiresAt: string;
    emailSent: boolean;
    emailDeliveryId: string | null;
  };
}

@Injectable()
export class CreatePlatformBusinessUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sendInvitationEmail: SendInvitationEmailUseCase,
  ) {}

  async execute(input: CreatePlatformBusinessInput): Promise<CreatePlatformBusinessResult> {
    const name = input.name.trim();
    const adminEmail = input.adminEmail.trim().toLowerCase();
    if (!name) {
      throw new AppError('VALIDATION_ERROR', 'El nombre es obligatorio', 400);
    }
    if (!adminEmail.includes('@')) {
      throw new AppError('VALIDATION_ERROR', 'Correo del administrador inválido', 400);
    }

    const taxId = input.taxId?.trim() || null;
    if (taxId) {
      const clash = await this.prisma.business.findUnique({ where: { taxId } });
      if (clash) {
        throw new AppError('TAX_ID_EXISTS', 'Ya existe una empresa con ese NIT/taxId', 409);
      }
    }

    const businessId = randomUUID();
    const invitationId = randomUUID();
    const { token, tokenHash } = createInvitationToken();
    const expiresAt = invitationExpiresAt();
    const legalName = input.legalName?.trim() || null;

    await this.prisma.$transaction(async (tx) => {
      await tx.business.create({
        data: {
          id: businessId,
          name,
          legalName,
          taxId,
          email: input.email?.trim() || null,
          phone: input.phone?.trim() || null,
          address: input.address?.trim() || null,
          status: 'ACTIVE',
        },
      });
      await seedBusinessSystemRoles(tx, businessId);
      await tx.invitation.create({
        data: {
          id: invitationId,
          businessId,
          email: adminEmail,
          roleCode: 'ADMIN',
          tokenHash,
          expiresAt,
          invitedById: input.actorUserId,
        },
      });
      await this.audit.record(
        {
          businessId,
          actorUserId: input.actorUserId,
          action: 'business.created',
          entityType: 'business',
          entityId: businessId,
          metadata: { name, adminEmail },
        },
        tx,
      );
    });

    const business = await this.prisma.business.findUniqueOrThrow({ where: { id: businessId } });
    const emailResult = await this.sendInvitationEmail.execute({
      invitationId,
      businessId,
      inviteeEmail: adminEmail,
      roleCode: 'ADMIN',
      expiresAt,
      inviteToken: token,
    });

    return {
      id: business.id,
      name: business.name,
      legalName: business.legalName,
      taxId: business.taxId,
      email: business.email,
      status: business.status,
      createdAt: business.createdAt.toISOString(),
      invitation: {
        invitationId,
        email: adminEmail,
        roleCode: 'ADMIN',
        expiresAt: expiresAt.toISOString(),
        emailSent: emailResult.emailSent,
        emailDeliveryId: emailResult.deliveryId,
      },
    };
  }
}
