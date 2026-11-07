# 06 — Casos de uso de backend: Producto e inventario

Fecha: 2026-11-02.

Actores: usuario autenticado con negocio activo. El servicio de inventario también es **actor interno** de Órdenes y Ventas.

---

## MVP obligatorio

### UC-INV-01 ListProducts

- **Entrada:** `businessId`, `search?`, `page`, `pageSize`.
- **Validación:** tenant del token.
- **Reglas:** 001, 014 (el filtro low-stock puede ser cliente o query).
- **Resultado:** página de productos del negocio, incluyendo INACTIVE.
- **Clase:** MVP obligatorio (09 + pantalla).

### UC-INV-02 CreateProduct

- **Entrada:** sku, name, unit, stock, minStock, category?, status (ACTIVE).
- **Validación:** 002, 003, 004 (stock ≥ 0).
- **Reglas pendientes:** 023 unicidad, 024 ENTRY inicial.
- **Resultado:** producto persistido. Si D-STOCK-ALTA: + movimiento ENTRY + audit.
- **Permiso:** `inventory.write`.
- **Clase:** MVP obligatorio.

### UC-INV-03 GetProduct

- **Entrada:** id.
- **Resultado:** 200 o 404.
- **Nota:** repo Angular sí; 09 no. Implementar cuando se enmiende, o interno para otros módulos.
- **Clase:** MVP complementario (interno sí en B3).

### UC-INV-04 UpdateProductCatalog

- **Entrada:** campos de catálogo, no stock.
- **Validación:** producto del tenant; SKU único si cambia.
- **Resultado:** `updatedAt`. No movimiento.
- **Permiso:** `inventory.write` (+ precio si D-PERM-PRECIO).
- **Clase:** MVP obligatorio a nivel contrato 09 PATCH; **complementario** para la UI actual (no hay pantalla). El back igual debe definir el PATCH para no dejar un agujero de `Partial<Product>`.

### UC-INV-05 DeactivateProduct / ActivateProduct

- **Entrada:** `status`.
- **Resultado:** deja de sugerirse/venderse/elegirse; el saldo permanece; líneas históricas intactas.
- **Permiso:** `inventory.write` (no hay delete real).
- **Clase:** MVP complementario. El permiso `inventory.delete` **no** borrar filas.

### UC-INV-06 RegisterInventoryEntry

- **Entrada:** productId, quantity > 0, reason?, createdBy=sub.
- **Validación:** producto existe; 004.
- **Resultado:** stock+, movimiento ENTRY, audit 018. `relatedEntityType` vacío o `MANUAL`.
- **Permiso:** `inventory.write`.
- **Clase:** MVP obligatorio (UI ingreso rápido).

### UC-INV-07 ApplyStockExit (interno)

- **Entrada:** productId, quantity, reason, relatedEntity, operationKey?, actor.
- **Validación:** FOR UPDATE, 004, 017.
- **Resultado:** EXIT + stock + audit. Idempotente si hay key.
- **Quién llama:** complete orden, confirm venta. **No** el cliente de inventario en MVP (evitar doble descuento).
- **Clase:** MVP obligatorio (efecto 06 y 17).

### UC-INV-08 ListMovements

- **Entrada:** productId opcional.
- **Resultado:** movimientos del tenant, más recientes primero (mock unshift).
- **Clase:** MVP obligatorio.

### UC-INV-09 CompleteServiceOrder (orquestación)

No es del módulo productos, pero es el caso de uso que demuestra el núcleo (06):

- Validar transición y km.
- `planConsumption` (006, 007, 008, adicionales autorizados).
- En **una** transacción: km + EXIT internos (007) + mantenimiento + estado COMPLETED + audits.
- Si stock insuficiente: **nada** persistido (el mock hoy puede dejar km; el back no).
- **Clase:** MVP obligatorio, módulo Órdenes + puerto Inventario.

### UC-INV-10 ConfirmSale (orquestación)

- Validar líneas, producto ACTIVE, precio entero, stock agregado.
- Transacción: EXIT por línea con `sale:{id}:exit:{lineId}` + estado CONFIRMED.
- **Clase:** MVP complementario respecto al núcleo de aceite; **obligatorio** si se cablea ventas HTTP (17 ya está en mock). Prioridad plan: B5.

---

## MVP complementario

### UC-INV-11 AdjustInventory

- **Entrada:** productId, quantity = stock objetivo, reason.
- **Reglas:** 015. Permiso rol INVENTORY o ADMIN (09), más estricto que write genérico.
- **UI:** no existe. API sí está en 09 → implementar con permiso, sin pantalla.
- **Clase:** complementario.

### UC-INV-12 RegisterReturn (interno / cancel venta)

- **Entrada:** movimiento original EXIT, quantity, operationKey.
- **Resultado:** RETURN, `reversesMovementId`, stock+.
- **Clase:** complementario hasta HTTP de ventas; interno de UC-INV-10 cancel.

### UC-INV-13 CancelSale

- Con `returnToStock`: UC-INV-12 por cada EXIT de esa venta.
- Sin retorno: solo estado, stock intacto.
- Idempotente `cancelOperationId`.
- **Clase:** complementario (17).

### UC-INV-14 SearchProductsForOperation

- Lista ACTIVE, con stock y price, para wizard/ventas/sugerencias.
- Puede ser el mismo GET con `status=ACTIVE` (enmienda).
- **Clase:** complementario.

### UC-INV-15 RecordConsumption (órdenes)

- Escribe consumido/no usado; **cero** inventario.
- **Clase:** ya es de Órdenes (16). Aquí solo para no descontar dos veces.

---

## Evolución futura

| ID | Caso | Motivo |
| --- | --- | --- |
| UC-INV-16 | TransferBetweenLocations | Sin sedes (D-TRANSFER, DT-06) |
| UC-INV-17 | ReserveStock | Explicitamente fuera (16, DT-06) |
| UC-INV-18 | ManageSuppliers | 24-expansion |
| UC-INV-19 | Barcode / image / tax per product | No hay atributos |
| UC-INV-20 | PriceHistory | Snapshots en líneas bastan |
| UC-INV-21 | HardDeleteProduct | Sustituido por INACTIVE |
| UC-INV-22 | LowStockNotification | 09 MVP2 |

---

## Orden de implementación backend

1. Esquema `products` + `inventory_movements` + `applyMovement` + tests de tenancy y negativo.
2. UC-INV-01, 02, 06, 08.
3. Puerto interno UC-INV-07 + complete de orden (UC-INV-09).
4. PATCH catálogo (UC-INV-04) con whitelist.
5. Ventas confirm/cancel (10, 12, 13).
6. Ajuste (11) y activate/deactivate (05).
