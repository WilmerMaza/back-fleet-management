/**
 * Lista solicitudes de registro para consola de plataforma.
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/database/prisma.service.js';

@Injectable()
export class ListRegistrationRequestsUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(status?: 'PENDING' | 'APPROVED' | 'REJECTED') {
    const rows = await this.prisma.businessRegistrationRequest.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        business: { select: { id: true, name: true, taxId: true, status: true } },
        applicant: { select: { id: true, email: true, fullName: true } },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      status: row.status,
      submittedAt: row.createdAt.toISOString(),
      reviewedAt: row.reviewedAt?.toISOString() ?? null,
      rejectionReason: row.rejectionReason,
      business: row.business,
      applicant: row.applicant,
    }));
  }
}
