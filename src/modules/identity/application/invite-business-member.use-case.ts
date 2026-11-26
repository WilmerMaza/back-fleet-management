/**
 * Invita por correo a un nuevo miembro del negocio (sin registro abierto).
 */
import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { AuditService } from '../../audit/audit.service.js';
import { AppError, Errors } from '../../../shared/common/app-error.js';
import { PrismaService } from '../../../shared/database/prisma.service.js';
import { SendInvitationEmailUseCase } from '../../notifications/application/send-invitation-email.use-case.js';
import {
  createInvitationToken,
  invitationExpiresAt,
} from '../../platform/application/create-invitation-token.js';

const INVITABLE_ROLES = new Set([
  'ADMIN',
  'INVENTORY',
  'OPERATOR',
  'TECHNICIAN',
  'FLEET_MANAGER',
  'CUSTOMER',
]);

export interface InviteBusinessMemberInput {
  businessId: string;
  email: string;
  roleCode: string;
  invitedByUserId: string;
}

export interface InviteBusinessMemberResult {
  invitationId: string;
  email: string;
  roleCode: string;
  expiresAt: string;
  emailSent: boolean;
  emailDeliveryId: string | null;
}

@Injectable()
export class InviteBusinessMemberUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sendInvitationEmail: SendInvitationEmailUseCase,
  ) {}

  async execute(input: InviteBusinessMemberInput): Promise<InviteBusinessMemberResult> {
    const email = input.email.trim().toLowerCase();
    const roleCode = input.roleCode.trim().toUpperCase();
    if (!INVITABLE_ROLES.has(roleCode)) {
      throw new AppError('INVALID_ROLE_CODE', `Rol no invitable: ${roleCode}`, 400);
    }

    const business = await this.prisma.business.findUnique({ where: { id: input.businessId } });
    if (!business) {
      throw Errors.businessNotFound();
    }
    if (business.status === 'SUSPENDED') {
      throw Errors.businessSuspended();
    }

    const role = await this.prisma.role.findFirst({
      where: { businessId: input.businessId, code: roleCode },
    });
    if (!role) {
      throw new AppError('ROLE_NOT_FOUND', `Rol ${roleCode} no existe en la empresa`, 400);
    }

    const existingMembership = await this.prisma.userBusinessMembership.findFirst({
      where: {
        businessId: input.businessId,
        user: { email },
        status: 'ACTIVE',
      },
    });
    if (existingMembership) {
      throw new AppError('ALREADY_MEMBER', 'El usuario ya es miembro de esta empresa', 409);
    }

    const pending = await this.prisma.invitation.findMany({
      where: { businessId: input.businessId, email, status: 'PENDING' },
    });

    const { token, tokenHash } = createInvitationToken();
    const expiresAt = invitationExpiresAt();
    const invitationId = randomUUID();

    await this.prisma.$transaction(async (tx) => {
      if (pending.length) {
        await tx.invitation.updateMany({
          where: { id: { in: pending.map((row) => row.id) } },
          data: { status: 'REVOKED' },
        });
      }
      await tx.invitation.create({
        data: {
          id: invitationId,
          businessId: input.businessId,
          email,
          roleCode,
          tokenHash,
          expiresAt,
          invitedById: input.invitedByUserId,
        },
      });
      await this.audit.record(
        {
          businessId: input.businessId,
          actorUserId: input.invitedByUserId,
          action: 'invitation.created',
          entityType: 'invitation',
          entityId: invitationId,
          metadata: { email, roleCode, scope: 'tenant' },
        },
        tx,
      );
    });

    const emailResult = await this.sendInvitationEmail.execute({
      invitationId,
      businessId: input.businessId,
      inviteeEmail: email,
      roleCode,
      expiresAt,
      inviteToken: token,
    });

    return {
      invitationId,
      email,
      roleCode,
      expiresAt: expiresAt.toISOString(),
      emailSent: emailResult.emailSent,
      emailDeliveryId: emailResult.deliveryId,
    };
  }
}
