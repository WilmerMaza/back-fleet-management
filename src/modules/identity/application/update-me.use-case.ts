/**
 * Actualiza datos de perfil del usuario autenticado (sin email ni credenciales).
 */
import { Injectable } from '@nestjs/common';
import { AppError, Errors } from '../../../shared/common/app-error.js';
import { PrismaService } from '../../../shared/database/prisma.service.js';

export interface UpdateMeInput {
  userId: string;
  fullName: string;
}

@Injectable()
export class UpdateMeUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(input: UpdateMeInput): Promise<{ fullName: string }> {
    const fullName = input.fullName.trim();
    if (fullName.length < 2) {
      throw new AppError('VALIDATION_ERROR', 'El nombre debe tener al menos 2 caracteres.', 400);
    }

    const user = await this.prisma.user.findUnique({ where: { id: input.userId } });
    if (!user || user.status !== 'ACTIVE') {
      throw Errors.unauthorized();
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { fullName },
    });

    return { fullName };
  }
}
