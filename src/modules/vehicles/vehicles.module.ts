import { Module } from '@nestjs/common';
import { CreateVehicleUseCase } from './application/create-vehicle.use-case.js';
import { GetLifeHistoryUseCase } from './application/get-life-history.use-case.js';
import { GetVehicleUseCase } from './application/get-vehicle.use-case.js';
import { ListMileageLogsUseCase } from './application/list-mileage-logs.use-case.js';
import { ListVehiclesUseCase } from './application/list-vehicles.use-case.js';
import { UpdateVehicleUseCase } from './application/update-vehicle.use-case.js';
import { VehiclesController } from './presentation/vehicles.controller.js';

@Module({
  controllers: [VehiclesController],
  providers: [
    CreateVehicleUseCase,
    ListVehiclesUseCase,
    GetVehicleUseCase,
    UpdateVehicleUseCase,
    ListMileageLogsUseCase,
    GetLifeHistoryUseCase,
  ],
})
export class VehiclesModule {}
