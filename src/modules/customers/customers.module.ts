import { Module } from '@nestjs/common';
import { CreateCustomerUseCase } from './application/create-customer.use-case.js';
import { GetCustomerUseCase } from './application/get-customer.use-case.js';
import { ListCustomersUseCase } from './application/list-customers.use-case.js';
import { UpdateCustomerUseCase } from './application/update-customer.use-case.js';
import { CustomersController } from './presentation/customers.controller.js';

@Module({
  controllers: [CustomersController],
  providers: [CreateCustomerUseCase, ListCustomersUseCase, GetCustomerUseCase, UpdateCustomerUseCase],
})
export class CustomersModule {}
