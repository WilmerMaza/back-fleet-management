/**
 * Estado de solicitud de registro para sesiones sin tenant operativo activo.
 */
import { Injectable } from '@nestjs/common';
import { AppError, Errors } from '../../../shared/common/app-error.js';
import { PrismaService } from '../../../shared/database/prisma.service.js';

@Injectable()
export class GetOnboardingStatusUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(userId: string) {
    const request = await this.prisma.businessRegistrationRequest.findFirst({
      where: { applicantUserId: userId },
      orderBy: { createdAt: 'desc' },
      include: { business: true },
    });

    if (!request) {
      throw new AppError('REGISTRATION_REQUEST_NOT_FOUND', 'No hay solicitud de registro pendiente.', 404);
    }

    return {
      requestId: request.id,
      status: request.status,
      business: {
        id: request.business.id,
        name: request.business.name,
        legalName: request.business.legalName,
        taxId: request.business.taxId,
        status: request.business.status,
      },
      rejectionReason: request.rejectionReason,
      submittedAt: request.createdAt.toISOString(),
      reviewedAt: request.reviewedAt?.toISOString() ?? null,
    };
  }
}
