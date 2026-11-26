/**
 * Rechaza una solicitud de registro empresarial.
 */
import { Injectable } from '@nestjs/common';
import { AuditService } from '../../audit/audit.service.js';
import { AppError } from '../../../shared/common/app-error.js';
import { PrismaService } from '../../../shared/database/prisma.service.js';

export interface RejectRegistrationInput {
  businessId: string;
  reviewerUserId: string;
  reason?: string;
}

@Injectable()
export class RejectRegistrationRequestUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async execute(input: RejectRegistrationInput) {
    const request = await this.prisma.businessRegistrationRequest.findUnique({
      where: { businessId: input.businessId },
    });
    if (!request) {
      throw new AppError('REGISTRATION_REQUEST_NOT_FOUND', 'Solicitud no encontrada.', 404);
    }
    if (request.status !== 'PENDING') {
      throw new AppError('REGISTRATION_NOT_PENDING', 'La solicitud ya fue procesada.', 409);
    }

    const reason = input.reason?.trim().slice(0, 500) || null;

    await this.prisma.$transaction(async (tx) => {
      await tx.business.update({
        where: { id: input.businessId },
        data: { status: 'REJECTED' },
      });
      await tx.businessRegistrationRequest.update({
        where: { id: request.id },
        data: {
          status: 'REJECTED',
          reviewedByUserId: input.reviewerUserId,
          reviewedAt: new Date(),
          rejectionReason: reason,
        },
      });
      await this.audit.record(
        {
          businessId: input.businessId,
          actorUserId: input.reviewerUserId,
          action: 'registration.rejected',
          entityType: 'business_registration_request',
          entityId: request.id,
          metadata: reason ? { reason } : undefined,
        },
        tx,
      );
    });

    return { businessId: input.businessId, status: 'REJECTED' as const };
  }
}
