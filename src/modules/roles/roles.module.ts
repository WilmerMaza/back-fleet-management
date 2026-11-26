import { Module } from '@nestjs/common';
import { CreateRoleUseCase } from './application/create-role.use-case.js';
import { ListRolesUseCase } from './application/list-roles.use-case.js';
import { RolesController } from './presentation/roles.controller.js';

@Module({
  controllers: [RolesController],
  providers: [ListRolesUseCase, CreateRoleUseCase],
})
export class RolesModule {}
