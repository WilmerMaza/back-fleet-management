/**
 * Recorte de página 1-based compartido por listados REST.
 */
export function pageParams(page?: number, pageSize?: number, fallback = 20, max = 100) {
  const safePage = page && page > 0 ? Math.floor(page) : 1;
  const safeSize = pageSize && pageSize > 0 ? Math.min(Math.floor(pageSize), max) : fallback;
  return { page: safePage, pageSize: safeSize, skip: (safePage - 1) * safeSize };
}

export function presentPage<T>(items: T[], total: number, page: number, pageSize: number) {
  return {
    data: items,
    meta: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize) || 1,
    },
  };
}
