import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../../../shared/authorization/auth.guard.js';
import { Permission } from '../../../shared/authorization/permissions.js';
import { RequirePermission } from '../../../shared/authorization/require-permission.decorator.js';
import { CurrentContext } from '../../../shared/tenant/current-context.decorator.js';
import type { RequestContext } from '../../../shared/tenant/request-context.js';
import { ChangeProductBrandStatusUseCase } from '../application/change-product-brand-status.use-case.js';
import { ChangeProductCategoryStatusUseCase } from '../application/change-product-category-status.use-case.js';
import { CreateProductBrandUseCase } from '../application/create-product-brand.use-case.js';
import { CreateProductCategoryUseCase } from '../application/create-product-category.use-case.js';
import { GetProductBrandUseCase } from '../application/get-product-brand.use-case.js';
import { GetProductCategoryUseCase } from '../application/get-product-category.use-case.js';
import { ListProductBrandsUseCase } from '../application/list-product-brands.use-case.js';
import { ListProductCategoriesUseCase } from '../application/list-product-categories.use-case.js';
import { UpdateProductBrandUseCase } from '../application/update-product-brand.use-case.js';
import { UpdateProductCategoryUseCase } from '../application/update-product-category.use-case.js';
import {
  ChangeCatalogStatusDto,
  CreateBrandDto,
  CreateCategoryDto,
  ListBrandsQueryDto,
  ListCategoriesQueryDto,
  UpdateBrandDto,
  UpdateCategoryDto,
} from './dto/product-catalog.dto.js';
import { presentBrand, presentCategory } from './product-catalog.presenter.js';

@Controller('businesses/:businessId')
@UseGuards(AuthGuard)
export class ProductCatalogController {
  constructor(
    private readonly listCategories: ListProductCategoriesUseCase,
    private readonly getCategory: GetProductCategoryUseCase,
    private readonly createCategory: CreateProductCategoryUseCase,
    private readonly updateCategory: UpdateProductCategoryUseCase,
    private readonly changeCategoryStatus: ChangeProductCategoryStatusUseCase,
    private readonly listBrands: ListProductBrandsUseCase,
    private readonly getBrand: GetProductBrandUseCase,
    private readonly createBrand: CreateProductBrandUseCase,
    private readonly updateBrand: UpdateProductBrandUseCase,
    private readonly changeBrandStatus: ChangeProductBrandStatusUseCase,
  ) {}

  @Get('product-categories')
  @RequirePermission(Permission.InventoryCategoriesRead)
  async categories(
    @Param('businessId') businessId: string,
    @Query() query: ListCategoriesQueryDto,
  ) {
    const rows = await this.listCategories.execute(businessId, {
      search: query.search,
      activeOnly: query.activeOnly,
      tree: query.tree ?? true,
    });
    return { data: rows.map(presentCategory) };
  }

  @Get('product-categories/:id')
  @RequirePermission(Permission.InventoryCategoriesRead)
  async category(@Param('businessId') businessId: string, @Param('id') id: string) {
    return presentCategory(await this.getCategory.execute(businessId, id));
  }

  @Post('product-categories')
  @RequirePermission(Permission.InventoryCategoriesWrite)
  async createCat(
    @Param('businessId') businessId: string,
    @Body() body: CreateCategoryDto,
    @CurrentContext() ctx: RequestContext,
  ) {
    return presentCategory(
      await this.createCategory.execute({
        businessId,
        actorId: ctx.userId,
        ...body,
      }),
    );
  }

  @Patch('product-categories/:id')
  @RequirePermission(Permission.InventoryCategoriesWrite)
  async patchCat(
    @Param('businessId') businessId: string,
    @Param('id') id: string,
    @Body() body: UpdateCategoryDto,
    @CurrentContext() ctx: RequestContext,
  ) {
    return presentCategory(
      await this.updateCategory.execute(businessId, id, ctx.userId, body),
    );
  }

  @Post('product-categories/:id/status')
  @RequirePermission(Permission.InventoryCategoriesWrite)
  async statusCat(
    @Param('businessId') businessId: string,
    @Param('id') id: string,
    @Body() body: ChangeCatalogStatusDto,
    @CurrentContext() ctx: RequestContext,
  ) {
    return presentCategory(
      await this.changeCategoryStatus.execute(businessId, id, ctx.userId, body.isActive),
    );
  }

  @Get('product-brands')
  @RequirePermission(Permission.InventoryBrandsRead)
  async brands(@Param('businessId') businessId: string, @Query() query: ListBrandsQueryDto) {
    const rows = await this.listBrands.execute(businessId, query);
    return { data: rows.map(presentBrand) };
  }

  @Get('product-brands/:id')
  @RequirePermission(Permission.InventoryBrandsRead)
  async brand(@Param('businessId') businessId: string, @Param('id') id: string) {
    return presentBrand(await this.getBrand.execute(businessId, id));
  }

  @Post('product-brands')
  @RequirePermission(Permission.InventoryBrandsWrite)
  async createBrandHandler(
    @Param('businessId') businessId: string,
    @Body() body: CreateBrandDto,
    @CurrentContext() ctx: RequestContext,
  ) {
    return presentBrand(
      await this.createBrand.execute({
        businessId,
        actorId: ctx.userId,
        ...body,
      }),
    );
  }

  @Patch('product-brands/:id')
  @RequirePermission(Permission.InventoryBrandsWrite)
  async patchBrand(
    @Param('businessId') businessId: string,
    @Param('id') id: string,
    @Body() body: UpdateBrandDto,
    @CurrentContext() ctx: RequestContext,
  ) {
    return presentBrand(await this.updateBrand.execute(businessId, id, ctx.userId, body));
  }

  @Post('product-brands/:id/status')
  @RequirePermission(Permission.InventoryBrandsWrite)
  async statusBrand(
    @Param('businessId') businessId: string,
    @Param('id') id: string,
    @Body() body: ChangeCatalogStatusDto,
    @CurrentContext() ctx: RequestContext,
  ) {
    return presentBrand(
      await this.changeBrandStatus.execute(businessId, id, ctx.userId, body.isActive),
    );
  }
}
