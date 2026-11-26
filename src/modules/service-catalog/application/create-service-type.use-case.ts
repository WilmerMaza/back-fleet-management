import { Inject, Injectable } from '@nestjs/common';
import { Errors } from '../../../shared/common/app-error.js';
import {
  isValidServiceTypeCode,
  normalizeServiceTypeCode,
} from '../domain/service-type-code.js';
import { SERVICE_TYPE_REPOSITORY } from '../service-catalog.tokens.js';
import type {
  ServiceTypeRepositoryPort,
  ServiceTypeStatus,
} from './ports/service-type.repository.port.js';

export interface CreateServiceTypeInput {
  businessId: string;
  actorId: string;
  code: string;
  name: string;
  category?: string;
  description?: string;
  status?: ServiceTypeStatus;
  parameters?: Record<string, unknown>;
}

@Injectable()
export class CreateServiceTypeUseCase {
  constructor(
    @Inject(SERVICE_TYPE_REPOSITORY)
    private readonly repo: ServiceTypeRepositoryPort,
  ) {}

  async execute(input: CreateServiceTypeInput) {
    const code = normalizeServiceTypeCode(input.code);
    const name = input.name.trim();
    if (!isValidServiceTypeCode(code) || !name) {
      throw Errors.serviceTypeInvalid('Código y nombre son obligatorios.');
    }
    return this.repo.create({
      businessId: input.businessId,
      actorId: input.actorId,
      code,
      name,
      category: input.category?.trim() || null,
      description: input.description?.trim() || null,
      status: input.status ?? 'ACTIVE',
      parameters: input.parameters ?? null,
    });
  }
}
