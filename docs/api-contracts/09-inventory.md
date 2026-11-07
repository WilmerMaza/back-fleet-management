# 09 — Inventory

Spec definitiva de implementación (decimales, PATCH, ENTRY inicial, permisos): [`docs/PRODUCTS_INVENTORY_SPEC.md`](../PRODUCTS_INVENTORY_SPEC.md). Código: este repositorio (`src/modules/products`, `src/modules/inventory`).


## Endpoints

- `GET /businesses/{businessId}/products?search=`
- `POST /businesses/{businessId}/products`
- `PATCH /businesses/{businessId}/products/{id}`
- `GET /businesses/{businessId}/inventory-movements?productId=`
- `POST /businesses/{businessId}/inventory-movements`

## Movement types

`ENTRY | EXIT | ADJUSTMENT | RETURN | TRANSFER`

## Reglas

- Stock nunca negativo.
- `ADJUSTMENT` fija stock absoluto (solo INVENTORY/ADMIN) y registra cantidad objetivo.
- Movimientos de órdenes usan `relatedEntityType=SERVICE_ORDER`.
- Alertar stock bajo (`stock <= minStock`) vía notificaciones (MVP2).

## Criterios

- Completar orden con stock insuficiente falla y no altera stock.
- Entrada manual incrementa stock y deja movimiento auditable.
