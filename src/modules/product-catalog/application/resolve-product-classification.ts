/**
 * Valida categoryId (hoja) y brandId para asignar a un producto.
 * categoryId apunta a la categoría o subcategoría más específica.
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/database/prisma.service.js';
import { Errors } from '../../../shared/common/app-error.js';

@Injectable()
export class ResolveProductClassification {
  constructor(private readonly prisma: PrismaService) {}

  async assertAssignable(
    businessId: string,
    input: { categoryId?: string | null; brandId?: string | null; requireCategory: boolean },
  ): Promise<{ categoryId: string | null; brandId: string | null }> {
    let categoryId =
      input.categoryId === undefined ? undefined : input.categoryId?.trim() || null;
    let brandId = input.brandId === undefined ? undefined : input.brandId?.trim() || null;

    if (input.requireCategory && (categoryId === undefined || categoryId === null)) {
      throw Errors.categoryRequired();
    }

    if (categoryId) {
      const category = await this.prisma.productCategory.findFirst({
        where: { businessId, id: categoryId },
      });
      if (!category) {
        throw Errors.categoryNotFound();
      }
      if (!category.isActive) {
        throw Errors.classificationInactive('La categoría seleccionada está inactiva.');
      }
      if (category.parentId) {
        const parent = await this.prisma.productCategory.findFirst({
          where: { businessId, id: category.parentId },
        });
        if (!parent) {
          throw Errors.categoryHierarchyInvalid('La subcategoría no tiene categoría padre válida.');
        }
        if (parent.parentId) {
          throw Errors.categoryHierarchyInvalid('La jerarquía de categorías supera dos niveles.');
        }
      }
    }

    if (brandId) {
      const brand = await this.prisma.productBrand.findFirst({
        where: { businessId, id: brandId },
      });
      if (!brand) {
        throw Errors.brandNotFound();
      }
      if (!brand.isActive) {
        throw Errors.classificationInactive('La marca seleccionada está inactiva.');
      }
    }

    return {
      categoryId: categoryId === undefined ? null : categoryId,
      brandId: brandId === undefined ? null : brandId,
    };
  }

  async businessHasActiveCategories(businessId: string): Promise<boolean> {
    const count = await this.prisma.productCategory.count({
      where: { businessId, parentId: null, isActive: true },
    });
    return count > 0;
  }
}
