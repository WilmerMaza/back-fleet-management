/**
 * Establece o cambia contraseña (D2: cuentas Google-only pueden fijar password).
 *
 * Si ya hay passwordHash, exige `currentPassword`.
 */
import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { Errors } from '../../../shared/common/app-error.js';
import { PrismaService } from '../../../shared/database/prisma.service.js';
import { assertPasswordPolicy } from '../domain/password-policy.js';

export interface SetPasswordInput {
  userId: string;
  password: string;
  currentPassword?: string;
}

@Injectable()
export class SetPasswordUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(input: SetPasswordInput): Promise<{ ok: true }> {
    const user = await this.prisma.user.findUnique({ where: { id: input.userId } });
    if (!user || user.status !== 'ACTIVE') {
      throw Errors.unauthorized();
    }

    if (user.passwordHash) {
      if (!input.currentPassword) {
        throw Errors.passwordRequired();
      }
      const ok = await argon2.verify(user.passwordHash, input.currentPassword);
      if (!ok) {
        throw Errors.invalidCredentials();
      }
    }

    assertPasswordPolicy(input.password);
    const passwordHash = await argon2.hash(input.password);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });
    return { ok: true };
  }
}
