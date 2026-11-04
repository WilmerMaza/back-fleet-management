import { Module } from '@nestjs/common';
import { AssignVehicleUseCase } from './application/assign-vehicle.use-case.js';
import { CreateFleetUseCase } from './application/create-fleet.use-case.js';
import { GetFleetSummaryUseCase } from './application/get-fleet-summary.use-case.js';
import { GetFleetUseCase } from './application/get-fleet.use-case.js';
import { ListFleetsUseCase } from './application/list-fleets.use-case.js';
import { UnassignVehicleUseCase } from './application/unassign-vehicle.use-case.js';
import { UpdateFleetUseCase } from './application/update-fleet.use-case.js';
import { FleetsController } from './presentation/fleets.controller.js';

@Module({
  controllers: [FleetsController],
  providers: [
    CreateFleetUseCase,
    ListFleetsUseCase,
    GetFleetUseCase,
    UpdateFleetUseCase,
    AssignVehicleUseCase,
    UnassignVehicleUseCase,
    GetFleetSummaryUseCase,
  ],
})
export class FleetsModule {}
