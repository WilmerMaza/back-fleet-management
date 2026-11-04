import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../../../shared/authorization/auth.guard.js';
import { Permission } from '../../../shared/authorization/permissions.js';
import { RequirePermission } from '../../../shared/authorization/require-permission.decorator.js';
import { presentPage } from '../../../shared/common/pagination.js';
import { CurrentContext } from '../../../shared/tenant/current-context.decorator.js';
import type { RequestContext } from '../../../shared/tenant/request-context.js';
import { CreateCustomerUseCase } from '../application/create-customer.use-case.js';
import { GetCustomerUseCase } from '../application/get-customer.use-case.js';
import { ListCustomersUseCase } from '../application/list-customers.use-case.js';
import { UpdateCustomerUseCase } from '../application/update-customer.use-case.js';
import { presentCustomer } from './customer.presenter.js';
import { CreateCustomerDto, ListCustomersQueryDto, UpdateCustomerDto } from './dto/customer.dto.js';

@Controller('businesses/:businessId/customers')
@UseGuards(AuthGuard)
export class CustomersController {
  constructor(
    private readonly createCustomer: CreateCustomerUseCase,
    private readonly listCustomers: ListCustomersUseCase,
    private readonly getCustomer: GetCustomerUseCase,
    private readonly updateCustomer: UpdateCustomerUseCase,
  ) {}

  @Get()
  @RequirePermission(Permission.CustomersRead)
  async list(@Param('businessId') businessId: string, @Query() query: ListCustomersQueryDto) {
    const result = await this.listCustomers.execute(businessId, query);
    return presentPage(result.items.map(presentCustomer), result.total, result.page, result.pageSize);
  }

  @Get(':id')
  @RequirePermission(Permission.CustomersRead)
  async get(@Param('businessId') businessId: string, @Param('id') id: string) {
    return presentCustomer(await this.getCustomer.execute(businessId, id));
  }

  @Post()
  @RequirePermission(Permission.CustomersWrite)
  async create(
    @Param('businessId') businessId: string,
    @Body() body: CreateCustomerDto,
    @CurrentContext() ctx: RequestContext,
  ) {
    return presentCustomer(
      await this.createCustomer.execute({ businessId, actorId: ctx.userId, ...body }),
    );
  }

  @Patch(':id')
  @RequirePermission(Permission.CustomersWrite)
  async update(
    @Param('businessId') businessId: string,
    @Param('id') id: string,
    @Body() body: UpdateCustomerDto,
    @CurrentContext() ctx: RequestContext,
  ) {
    return presentCustomer(await this.updateCustomer.execute(businessId, id, ctx.userId, body));
  }
}
