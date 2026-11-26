export interface ProductCategoryRecord {
  id: string;
  businessId: string;
  name: string;
  normalizedName: string;
  code: string | null;
  description: string | null;
  parentId: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  productCount?: number;
  children?: ProductCategoryRecord[];
}

export interface ProductCategoryRepositoryPort {
  list(
    businessId: string,
    query?: { search?: string; activeOnly?: boolean; parentId?: string | null },
  ): Promise<ProductCategoryRecord[]>;
  findById(businessId: string, id: string): Promise<ProductCategoryRecord | null>;
  create(input: {
    businessId: string;
    actorId: string;
    name: string;
    normalizedName: string;
    code?: string | null;
    description?: string | null;
    parentId?: string | null;
  }): Promise<ProductCategoryRecord>;
  update(
    businessId: string,
    id: string,
    actorId: string,
    data: {
      name?: string;
      normalizedName?: string;
      code?: string | null;
      description?: string | null;
    },
  ): Promise<ProductCategoryRecord>;
  setActive(
    businessId: string,
    id: string,
    actorId: string,
    isActive: boolean,
  ): Promise<ProductCategoryRecord>;
  countActiveRoots(businessId: string): Promise<number>;
  countActiveChildren(businessId: string, parentId: string): Promise<number>;
  countProducts(businessId: string, categoryId: string): Promise<number>;
}
