import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../../../shared/authorization/auth.guard.js';
import { Permission } from '../../../shared/authorization/permissions.js';
import { RequirePermission } from '../../../shared/authorization/require-permission.decorator.js';
import { CurrentContext } from '../../../shared/tenant/current-context.decorator.js';
import type { RequestContext } from '../../../shared/tenant/request-context.js';
import { ChangeProductStatusUseCase } from '../application/change-product-status.use-case.js';
import { CreateProductUseCase } from '../application/create-product.use-case.js';
import { GetProductUseCase } from '../application/get-product.use-case.js';
import { ListProductsUseCase } from '../application/list-products.use-case.js';
import { UpdateProductUseCase } from '../application/update-product.use-case.js';
import { CreateProductDto, ListProductsQueryDto, UpdateProductDto } from './dto/product.dto.js';
import { presentProduct } from './product.presenter.js';

@Controller('businesses/:businessId/products')
@UseGuards(AuthGuard)
export class ProductsController {
  constructor(
    private readonly createProduct: CreateProductUseCase,
    private readonly listProducts: ListProductsUseCase,
    private readonly getProduct: GetProductUseCase,
    private readonly updateProduct: UpdateProductUseCase,
    private readonly changeStatus: ChangeProductStatusUseCase,
  ) {}

  @Get()
  @RequirePermission(Permission.InventoryRead)
  async list(@Param('businessId') businessId: string, @Query() query: ListProductsQueryDto) {
    const result = await this.listProducts.execute(businessId, query);
    return {
      data: result.items.map(presentProduct),
      meta: {
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
        totalPages: Math.ceil(result.total / result.pageSize) || 1,
      },
    };
  }

  @Get(':id')
  @RequirePermission(Permission.InventoryRead)
  async get(@Param('businessId') businessId: string, @Param('id') id: string) {
    return presentProduct(await this.getProduct.execute(businessId, id));
  }

  @Post()
  @RequirePermission(Permission.InventoryWrite)
  async create(
    @Param('businessId') businessId: string,
    @Body() body: CreateProductDto,
    @CurrentContext() ctx: RequestContext,
  ) {
    const product = await this.createProduct.execute({
      businessId,
      actorId: ctx.userId,
      ...body,
    });
    return presentProduct(product);
  }

  @Patch(':id')
  @RequirePermission(Permission.InventoryWrite)
  async update(
    @Param('businessId') businessId: string,
    @Param('id') id: string,
    @Body() body: UpdateProductDto,
    @CurrentContext() ctx: RequestContext,
    @Req() req: { body: Record<string, unknown> },
  ) {
    const product = await this.updateProduct.execute(
      businessId,
      id,
      ctx.userId,
      body,
      Object.keys(req.body ?? {}),
    );
    return presentProduct(product);
  }

  @Patch(':id/deactivate')
  @RequirePermission(Permission.InventoryWrite)
  async deactivate(
    @Param('businessId') businessId: string,
    @Param('id') id: string,
    @CurrentContext() ctx: RequestContext,
  ) {
    return presentProduct(await this.changeStatus.execute(businessId, id, ctx.userId, 'INACTIVE'));
  }

  @Patch(':id/activate')
  @RequirePermission(Permission.InventoryWrite)
  async activate(
    @Param('businessId') businessId: string,
    @Param('id') id: string,
    @CurrentContext() ctx: RequestContext,
  ) {
    return presentProduct(await this.changeStatus.execute(businessId, id, ctx.userId, 'ACTIVE'));
  }
}
