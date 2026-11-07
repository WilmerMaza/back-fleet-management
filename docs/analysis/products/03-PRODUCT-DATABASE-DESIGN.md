# 03 — Diseño PostgreSQL preliminar: Producto e inventario

Fecha: 2026-11-02. Propuesta. No es migración. Prisma cuando se implemente B3 del plan de API.

## 1. Tablas del MVP (sí)

Solo dos tablas propias. El resto de hipótesis de la auditoría **no** se crean ahora.

| Tabla | ¿MVP? | Motivo |
| --- | --- | --- |
| `products` | **Sí** | Catálogo + saldo único |
| `inventory_movements` | **Sí** | Ledger + auditoría operativa |
| `product_categories` | No | `category` es texto libre; no hay UI de catálogo |
| `product_brands` | No | `brand` texto opcional |
| `product_units` | No | `unit` texto; normalizar sería overkill |
| `inventory_balances` | No | Una existencia por producto (DT-06) |
| `product_suppliers` | No | Expansión 24 |
| `product_price_history` | No | El histórico cobrable está en líneas de orden/venta |

## 2. `products`

Propósito: ítem de catálogo y saldo actual del negocio.

| Columna | Tipo | Nulos | Notas |
| --- | --- | --- | --- |
| `id` | `uuid` | PK | `gen_random_uuid()` |
| `business_id` | `uuid` | NOT NULL | FK `businesses.id` |
| `sku` | `text` | NOT NULL | |
| `name` | `text` | NOT NULL | |
| `category` | `text` | NULL | |
| `brand` | `text` | NULL | |
| `reference` | `text` | NULL | |
| `unit` | `text` | NOT NULL | |
| `stock` | `numeric(12,3)` | NOT NULL DEFAULT 0 | CHECK `>= 0`. Tres decimales alineados a milésimas de venta |
| `min_stock` | `numeric(12,3)` | NOT NULL DEFAULT 0 | CHECK `>= 0` |
| `cost_minor` | `bigint` | NULL | Enteros menores, como ventas. Ver decisión D-PRECIO |
| `price_minor` | `bigint` | NULL | |
| `status` | `text` | NOT NULL | CHECK `IN ('ACTIVE','INACTIVE')` |
| `created_at` | `timestamptz` | NOT NULL | |
| `updated_at` | `timestamptz` | NOT NULL | |
| `created_by` | `uuid` | NULL | FK `users.id` |
| `updated_by` | `uuid` | NULL | FK `users.id` |
| `version` | `integer` | NOT NULL DEFAULT 1 | Occupied lock / optimistic concurrency |

Restricciones:

- PK `id`
- `UNIQUE (business_id, sku)` — **propuesto**; el mock no lo tiene (D-SKU)
- CHECK stock/min_stock
- FK `business_id` → `businesses` (`ON DELETE RESTRICT`)

Índices:

- `(business_id, status)`
- `(business_id, name)`
- `(business_id) WHERE stock <= min_stock` (parcial, alertas)
- UNIQUE ya cubre SKU

No hay `deleted_at`. Baja = `INACTIVE`.

**No** poner `stock` actualizable por `PATCH` genérico: el caso de uso de update de catálogo no toca `stock` (D-PATCH-STOCK).

## 3. `inventory_movements`

Propósito: único escritor de cambios de `products.stock`. Append-only (sin UPDATE/DELETE de aplicación).

| Columna | Tipo | Nulos | Notas |
| --- | --- | --- | --- |
| `id` | `uuid` | PK | |
| `business_id` | `uuid` | NOT NULL | |
| `product_id` | `uuid` | NOT NULL | FK `products.id` |
| `type` | `text` | NOT NULL | CHECK `ENTRY\|EXIT\|ADJUSTMENT\|RETURN\|TRANSFER` |
| `quantity` | `numeric(12,3)` | NOT NULL | CHECK `> 0` (ajuste: cantidad = stock objetivo, también `>= 0` si se permite dejar en cero: CHECK `>= 0`) |
| `balance_after` | `numeric(12,3)` | NOT NULL | CHECK `>= 0` |
| `reason` | `text` | NULL | |
| `related_entity_type` | `text` | NULL | `SERVICE_ORDER` \| `SALE` \| `MANUAL` |
| `related_entity_id` | `uuid` | NULL | |
| `reverses_movement_id` | `uuid` | NULL | FK self |
| `operation_key` | `text` | NULL | Idempotencia |
| `created_at` | `timestamptz` | NOT NULL | |
| `created_by` | `uuid` | NULL | FK `users.id` |

Restricciones:

- FK `product_id` → `products` `ON DELETE RESTRICT`
- FK `reverses_movement_id` → `inventory_movements` `ON DELETE RESTRICT`
- `UNIQUE (business_id, operation_key)` **parcial** `WHERE operation_key IS NOT NULL`
- CHECK: si `related_entity_id` NOT NULL entonces type de entidad NOT NULL

Índices:

- `(business_id, created_at DESC)`
- `(business_id, product_id, created_at DESC)`
- `(business_id, related_entity_type, related_entity_id)`

Trigger o servicio: **no** hay UPDATE. Un trigger `BEFORE UPDATE OR DELETE` que aborte refuerza append-only.

## 4. Dinero y cantidades

Hoy el mock mezcla `number` JS (precio 28000, stock 80, litros 4). Ventas ya usan `bigint` minor y milésimas.

Recomendación MVP (requiere D-DINERO):

- Stock y cantidades de movimiento: `numeric(12,3)` (cubre 4.5 L y milésimas).
- Precio/costo de catálogo: `bigint` unidades menores, `currency` **no** en `products` (la moneda es del negocio, como en ventas).

Hasta aprobar D-DINERO, un back que copie `DOUBLE PRECISION` del mock **no** es aceptable para dinero.

## 5. Concurrencia

Un `EXIT` hace:

```text
BEGIN;
SELECT stock, version FROM products WHERE id = $1 AND business_id = $2 FOR UPDATE;
-- calcular next; abortar si next < 0
INSERT inventory_movements …;
UPDATE products SET stock = next, version = version + 1, updated_at = now();
COMMIT;
```

Aislamiento: `READ COMMITTED` + `FOR UPDATE` basta. No hace falta SERIALIZABLE en el MVP.

Complete de orden / confirm de venta: **una** transacción que bloquea **todas** las filas de producto involucradas (ordenar por `product_id` para evitar deadlock) y luego inserta movimientos.

## 6. Relación con otras tablas (no de este módulo)

Las líneas de orden/venta guardan snapshot. FK `product_id` opcional con `ON DELETE RESTRICT` para no perder el vínculo; el nombre histórico sigue en la línea si algún día se relajara.

`audit_logs` (contrato 07): cada movimiento dispara `INVENTORY_MOVEMENT_CREATED` en la **misma** transacción. No sustituye al ledger.

## 7. Qué no modelar

- Ubicación origen/destino en `TRANSFER` hasta haber sedes.
- Impuesto por producto (`tax_rate_bps` vive en venta cuando exista tarifa).
- Imagen: si algún día hay foto, es `attachments` polimórfico (`entity_type=PRODUCT`), no columna.

## 8. Semilla vs integridad

Los productos demo deben nacer con un `ENTRY` `reason=SEED` o stock 0 + movimientos, para que `SUM(delta)` = `stock`. Hoy la semilla rompe esa igualdad; el back no debe copiar ese atajo en producción.
