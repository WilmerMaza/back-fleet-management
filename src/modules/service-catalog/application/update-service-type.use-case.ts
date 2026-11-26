import { Inject, Injectable } from '@nestjs/common';
import { Errors } from '../../../shared/common/app-error.js';
import { SERVICE_TYPE_REPOSITORY } from '../service-catalog.tokens.js';
import type {
  ServiceTypeRepositoryPort,
  ServiceTypeStatus,
} from './ports/service-type.repository.port.js';

export interface UpdateServiceTypeInput {
  businessId: string;
  id: string;
  actorId: string;
  name?: string;
  category?: string | null;
  description?: string | null;
  status?: ServiceTypeStatus;
  parameters?: Record<string, unknown> | null;
  presentKeys: string[];
}

@Injectable()
export class UpdateServiceTypeUseCase {
  constructor(
    @Inject(SERVICE_TYPE_REPOSITORY)
    private readonly repo: ServiceTypeRepositoryPort,
  ) {}

  async execute(input: UpdateServiceTypeInput) {
    const patch: {
      name?: string;
      category?: string | null;
      description?: string | null;
      status?: ServiceTypeStatus;
      parameters?: Record<string, unknown> | null;
      actorId: string;
    } = { actorId: input.actorId };

    if (input.presentKeys.includes('name') && input.name !== undefined) {
      const name = input.name.trim();
      if (!name) {
        throw Errors.serviceTypeInvalid('El nombre no puede quedar vacío.');
      }
      patch.name = name;
    }
    if (input.presentKeys.includes('category')) {
      patch.category =
        input.category == null || input.category === '' ? null : input.category.trim();
    }
    if (input.presentKeys.includes('description')) {
      patch.description =
        input.description == null || input.description === ''
          ? null
          : input.description.trim();
    }
    if (input.presentKeys.includes('status') && input.status) {
      patch.status = input.status;
    }
    if (input.presentKeys.includes('parameters')) {
      patch.parameters = input.parameters ?? null;
    }

    const updated = await this.repo.update(input.businessId, input.id, patch);
    if (!updated) {
      throw Errors.serviceTypeNotFound();
    }
    return updated;
  }
}
