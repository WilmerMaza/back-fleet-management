export interface ProductBrandRecord {
  id: string;
  businessId: string;
  name: string;
  normalizedName: string;
  description: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  productCount?: number;
}

export interface ProductBrandRepositoryPort {
  list(
    businessId: string,
    query?: { search?: string; activeOnly?: boolean },
  ): Promise<ProductBrandRecord[]>;
  findById(businessId: string, id: string): Promise<ProductBrandRecord | null>;
  create(input: {
    businessId: string;
    actorId: string;
    name: string;
    normalizedName: string;
    description?: string | null;
  }): Promise<ProductBrandRecord>;
  update(
    businessId: string,
    id: string,
    actorId: string,
    data: {
      name?: string;
      normalizedName?: string;
      description?: string | null;
    },
  ): Promise<ProductBrandRecord>;
  setActive(
    businessId: string,
    id: string,
    actorId: string,
    isActive: boolean,
  ): Promise<ProductBrandRecord>;
  countProducts(businessId: string, brandId: string): Promise<number>;
}
