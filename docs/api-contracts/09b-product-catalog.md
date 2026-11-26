# 09b — Catálogo de categorías y marcas de producto

Complemento de [`09-inventory.md`](./09-inventory.md). Clasificación real por negocio (no texto libre).

## Endpoints

### Categorías

- `GET /businesses/{businessId}/product-categories?search=&activeOnly=&tree=`
- `GET /businesses/{businessId}/product-categories/{id}`
- `POST /businesses/{businessId}/product-categories` — body: `name`, `code?`, `description?`, `parentId?`
- `PATCH /businesses/{businessId}/product-categories/{id}`
- `POST /businesses/{businessId}/product-categories/{id}/status` — `{ "isActive": boolean }`

### Marcas

- `GET /businesses/{businessId}/product-brands?search=&activeOnly=`
- `GET /businesses/{businessId}/product-brands/{id}`
- `POST /businesses/{businessId}/product-brands`
- `PATCH /businesses/{businessId}/product-brands/{id}`
- `POST /businesses/{businessId}/product-brands/{id}/status`

## Reglas

- Máximo 2 niveles: raíz (`parentId=null`) y subcategoría (`parentId` = raíz).
- Nombre normalizado único por negocio (trim + minúsculas + espacios colapsados).
- No desactivar si hay productos o subcategorías activas (categorías) / productos (marcas).
- Productos: `categoryId` = hoja (categoría o subcategoría); `brandId` opcional.
- Si el negocio tiene categorías activas, create/update exige `categoryId`.
- Históricos sin clasificación siguen válidos hasta que se editen.

## Permisos

- `inventory.categories.read` / `inventory.categories.write`
- `inventory.brands.read` / `inventory.brands.write`
- Productos siguen con `inventory.read` / `inventory.write`
