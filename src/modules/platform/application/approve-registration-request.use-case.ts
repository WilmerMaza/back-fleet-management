/**
 * Aprueba una solicitud de registro: empresa ACTIVE + solicitud APPROVED.
 */
import { Injectable } from '@nestjs/common';
import { AuditService } from '../../audit/audit.service.js';
import { AppError } from '../../../shared/common/app-error.js';
import { PrismaService } from '../../../shared/database/prisma.service.js';

export interface ApproveRegistrationInput {
  businessId: string;
  reviewerUserId: string;
}

@Injectable()
export class ApproveRegistrationRequestUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async execute(input: ApproveRegistrationInput) {
    const request = await this.prisma.businessRegistrationRequest.findUnique({
      where: { businessId: input.businessId },
      include: { business: true },
    });
    if (!request) {
      throw new AppError('REGISTRATION_REQUEST_NOT_FOUND', 'Solicitud no encontrada.', 404);
    }
    if (request.status !== 'PENDING') {
      throw new AppError('REGISTRATION_NOT_PENDING', 'La solicitud ya fue procesada.', 409);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.business.update({
        where: { id: input.businessId },
        data: { status: 'ACTIVE' },
      });
      await tx.businessRegistrationRequest.update({
        where: { id: request.id },
        data: {
          status: 'APPROVED',
          reviewedByUserId: input.reviewerUserId,
          reviewedAt: new Date(),
          rejectionReason: null,
        },
      });
      await this.audit.record(
        {
          businessId: input.businessId,
          actorUserId: input.reviewerUserId,
          action: 'registration.approved',
          entityType: 'business_registration_request',
          entityId: request.id,
        },
        tx,
      );
    });

    return this.prisma.business.findUniqueOrThrow({ where: { id: input.businessId } });
  }
}
