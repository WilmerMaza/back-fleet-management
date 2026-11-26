/**
 * Desvincula Google de la cuenta autenticada sin eliminar la identidad interna.
 *
 * Exige contraseña local activa como último método de acceso válido.
 */
import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { Errors } from '../../../shared/common/app-error.js';
import { PrismaService } from '../../../shared/database/prisma.service.js';

export interface UnlinkGoogleInput {
  userId: string;
  currentPassword: string;
}

@Injectable()
export class UnlinkGoogleUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(input: UnlinkGoogleInput): Promise<{ unlinked: true }> {
    const user = await this.prisma.user.findUnique({
      where: { id: input.userId },
      include: { identities: true },
    });
    if (!user || user.status !== 'ACTIVE') {
      throw Errors.unauthorized();
    }

    const google = user.identities.find((item) => item.provider === 'GOOGLE');
    if (!google) {
      return { unlinked: true };
    }

    if (!user.passwordHash) {
      throw Errors.forbidden();
    }

    const ok = await argon2.verify(user.passwordHash, input.currentPassword);
    if (!ok) {
      throw Errors.invalidCredentials();
    }

    await this.prisma.authIdentity.delete({ where: { id: google.id } });
    return { unlinked: true };
  }
}
