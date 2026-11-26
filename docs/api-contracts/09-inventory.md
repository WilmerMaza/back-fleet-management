# 09 — Inventory

Spec definitiva de implementación (decimales, PATCH, ENTRY inicial, permisos): [`docs/backend/PRODUCTS_INVENTORY_SPEC.md`](../backend/PRODUCTS_INVENTORY_SPEC.md). Código: `backend/` (`InventoryStockService` = único escritor de stock).

## Endpoints

- `GET /businesses/{businessId}/products?search=`
- `POST /businesses/{businessId}/products`
- `PATCH /businesses/{businessId}/products/{id}`
- `GET /businesses/{businessId}/inventory-movements?productId=&type=&from=&to=&page=`
- `POST /businesses/{businessId}/inventory-movements` — `ENTRY` o `EXIT` (motivo obligatorio en EXIT)
- `POST /businesses/{businessId}/inventory-exits` — salida manual
- `POST /businesses/{businessId}/inventory-adjustments` — `targetStock` + `reason` obligatorio (`inventory.adjust`)
- `POST /businesses/{businessId}/purchase-receipts` — recepción de compra multi-línea

## Movement types

`ENTRY | EXIT | ADJUSTMENT | RETURN`

(`TRANSFER` no se expone.)

## Reglas

- Stock nunca negativo. Escritura solo vía `InventoryStockService` (`FOR UPDATE` + TX).
- `ADJUSTMENT` fija stock absoluto; la diferencia la calcula el backend.
- `operationKey` opcional e idempotente (unique por negocio); carreras P2002 → misma respuesta.
- Movimientos de órdenes: `relatedEntityType=SERVICE_ORDER`, clave `order:{id}:exit:{productId}`.
- Compras: `relatedEntityType=PURCHASE_RECEIPT`; recepción atómica; clave de recepción + por línea.
- Manual: `relatedEntityType=MANUAL`.
- Completar orden con stock insuficiente falla y no altera stock (mock).
- Nest: `InventoryStockService.consumeForServiceOrder` listo; **no** hay módulo `service-orders` ni tablas aún (`docs/architecture/service-orders-module-design.md`). `relatedEntityId` es UUID → el `id` de orden Nest debe ser UUID.

## Criterios

- Entrada / salida / ajuste / compra multi-línea dejan movimientos auditables.
- Dos salidas concurrentes sobre el mismo stock: una OK, una rechazo; saldo coherente.
- Reintento con la misma `operationKey` no duplica movimiento ni stock.
