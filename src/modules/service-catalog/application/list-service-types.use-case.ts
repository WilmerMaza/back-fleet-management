import { Inject, Injectable } from '@nestjs/common';
import { SERVICE_TYPE_REPOSITORY } from '../service-catalog.tokens.js';
import type {
  ListServiceTypesFilter,
  ServiceTypeRepositoryPort,
} from './ports/service-type.repository.port.js';

@Injectable()
export class ListServiceTypesUseCase {
  constructor(
    @Inject(SERVICE_TYPE_REPOSITORY)
    private readonly repo: ServiceTypeRepositoryPort,
  ) {}

  execute(businessId: string, filter: ListServiceTypesFilter = {}) {
    return this.repo.list(businessId, filter);
  }
}
