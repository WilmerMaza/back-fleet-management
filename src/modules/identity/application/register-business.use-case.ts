/**
 * Autoregistro: usuario + empresa en PENDING + solicitud + membresía ADMIN.
 */
import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { permissionsForRoles } from '../../../shared/authorization/permissions.js';
import { AppError, Errors } from '../../../shared/common/app-error.js';
import { PrismaService } from '../../../shared/database/prisma.service.js';
import { seedBusinessSystemRoles } from '../../platform/application/seed-business-system-roles.js';
import { SessionIssuer, type SessionResponse } from './session.issuer.js';

export interface RegisterBusinessInput {
  email: string;
  password: string;
  fullName: string;
  businessName: string;
  legalName?: string;
  taxId?: string;
  phone?: string;
  address?: string;
}

@Injectable()
export class RegisterBusinessUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionIssuer,
  ) {}

  async execute(input: RegisterBusinessInput): Promise<SessionResponse> {
    const email = input.email.trim().toLowerCase();
    const businessName = input.businessName.trim();
    const fullName = input.fullName.trim();
    if (!businessName || !fullName || input.password.length < 8) {
      throw new AppError('INVALID_INPUT', 'Datos de registro incompletos o inválidos.', 400);
    }

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new AppError('EMAIL_EXISTS', 'Ya existe una cuenta con este correo.', 409);
    }

    const taxId = input.taxId?.trim() || null;
    if (taxId) {
      const clash = await this.prisma.business.findUnique({ where: { taxId } });
      if (clash) {
        throw new AppError('TAX_ID_EXISTS', 'Ya existe una empresa con ese NIT/taxId', 409);
      }
    }

    const userId = randomUUID();
    const businessId = randomUUID();
    const requestId = randomUUID();
    const passwordHash = await argon2.hash(input.password);

    await this.prisma.$transaction(async (tx) => {
      await tx.user.create({
        data: {
          id: userId,
          email,
          fullName,
          passwordHash,
          status: 'ACTIVE',
        },
      });
      await tx.business.create({
        data: {
          id: businessId,
          name: businessName,
          legalName: input.legalName?.trim() || null,
          taxId,
          phone: input.phone?.trim() || null,
          address: input.address?.trim() || null,
          email,
          status: 'PENDING',
        },
      });
      await seedBusinessSystemRoles(tx, businessId);
      await tx.userBusinessMembership.create({
        data: {
          userId,
          businessId,
          roleCodes: ['ADMIN'],
          permissions: permissionsForRoles(['ADMIN']),
          status: 'ACTIVE',
        },
      });
      await tx.businessRegistrationRequest.create({
        data: {
          id: requestId,
          businessId,
          applicantUserId: userId,
          status: 'PENDING',
        },
      });
    });

    return this.sessions.issueOnboarding(userId, businessId);
  }
}
