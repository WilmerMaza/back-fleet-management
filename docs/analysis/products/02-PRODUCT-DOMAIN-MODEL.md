# 02 — Modelo de dominio: Producto

Fecha: 2026-11-02. Conceptual. Persistencia en [03](./03-PRODUCT-DATABASE-DESIGN.md).

## 1. Contexto acotado

En el monolito modular el **dueño del catálogo comercial del SKU y del saldo** es el módulo Inventario (DT-01 / DT-02). Órdenes y ventas **no** escriben `Product.stock`; piden un movimiento al inventario **dentro de la misma transacción** de aplicación.

No es un ERP de compras. No hay almacén, proveedor ni lista de precios en este bounded context.

```text
Inventario (dueño)
  Product
  InventoryMovement

Catálogo de servicios (usa Product, no lo posee)
  ServiceType
  ServiceProductSuggestion → Product
  ServiceProductVehicleRule → Product? (sustituto)

Órdenes (copia, no dueño)
  ServiceOrderItem
    ServiceOrderProductUsage  (snapshot + cantidades)

Ventas (copia, no dueño)
  Sale
    SaleLine  (snapshot dinero + cantidad)
```

## 2. Entidades confirmadas

### Product (agregado raíz de catálogo)

Identidad: `id` + `businessId`. Identificador de negocio: `sku` (único **debería** serlo por tenant; hoy el mock no lo impone).

Estados: `ACTIVE` | `INACTIVE`. Inactivo: no se sugiere, no se vende, no se elige en órdenes (UI filtra). Sigue en listado de inventario. No hay regla de «no descontar si inactivo» en el complete: si ya está en la orden, el mock descuenta igual.

Invariantes (confirmados o a imponer en back):

1. `businessId` inmutable.
2. `stock >= 0` siempre.
3. `minStock >= 0`.
4. `sku` y `name` no vacíos.
5. `unit` no vacío.
6. Solo el escritor de movimientos cambia `stock` (hoy violado por `createProduct`).

### InventoryMovement (entidad del mismo contexto)

Registro append-only de un cambio de saldo. No se edita ni se borra. Una reversión es **otro** movimiento (`RETURN` + `reversesMovementId`).

Invariantes:

1. `quantity >= 0` (el signo lo da el tipo).
2. `balanceAfter` = stock resultante.
3. `relatedEntityType` ∈ { `SERVICE_ORDER`, `SALE`, omitido/manual } en lo implementado.
4. `operationKey` único por negocio si viene informado.
5. `TRANSFER` no es traslado hasta haber destino (no exponer en API de negocio).

### ServiceOrderProductUsage (no es Product)

Value object / fila hija de ítem. Copia `productId`, `productName`, `sku`, `unit`, `unitPrice`. Cantidades: previsto (`quantity`/`plannedQuantity`), consumido, no usado, reservado=0, entregado sin uso.

### SaleLine (no es Product)

Copia comercial con dinero en enteros (`*Minor`) y cantidad en milésimas.

### ServiceProductSuggestion

Configuración: tipo de servicio + producto + cantidad default + unidad (puede diferir del `Product.unit` salvo sustitución). Resolver es lectura: no reserva.

## 3. Relaciones

```text
businesses 1 ── * products
products 1 ── * inventory_movements
products 1 ── * service_product_suggestions
products 1 ── * service_order_product_usages   (snapshot; FK lógica)
products 1 ── * sale_lines                     (snapshot; FK lógica)

service_orders 1 ── * inventory_movements      (related_entity)
sales 1 ── * inventory_movements
```

Al inactivar un producto: las FKs de movimientos y líneas históricas **permanecen**. No hay DELETE físico de producto en la UI (`inventory.delete` existe en roles, no hay llamada).

## 4. Fuente de verdad del stock

| Pregunta | Respuesta para KONTI MVP |
| --- | --- |
| ¿Ledger o columna? | Columna `products.stock` **denormalizada**, actualizada **solo** al insertar un movimiento, misma transacción. El ledger permite reconstruir y auditar. |
| ¿Tabla `inventory_balances`? | No, mientras haya una ubicación. DT-06. |
| ¿Reservas? | No. Decisión explícita 16 / DT-06. |
| ¿Stock al crear? | Hoy se escribe la columna sin ledger. **Pendiente:** el alta con stock > 0 debe generar `ENTRY` inicial (recomendado). |

## 5. Ciclo de vida

```text
[alta ACTIVE, stock inicial]
    → ENTRY manual / EXIT orden / EXIT venta / RETURN cancelación venta / ADJUSTMENT (rol)
    → INACTIVE (catálogo oculto en operación; saldo sigue existiendo)
```

No hay estado `DISCONTINUED` distinto de `INACTIVE`.

## 6. Lo inferido (no elevar a invariante sin aprobación)

- SKU único por negocio (esperado en SaaS; no hay test ni contrato).
- Código de barras innecesario.
- `cost`/`price` en la misma fila que el stock (hoy sí); DT-01 sugiere dueño «catálogo» vs «inventario» como módulos lógicos, **una tabla**.
- `ADJUSTMENT` con `quantity` = stock objetivo, no delta (09 + `stockAfterMovement`).

## 7. Decisiones que el modelo no debe resolver solo

Ver [07](./07-PRODUCT-RISKS-AND-DECISIONS.md): unicidad SKU, stock inicial con ENTRY, dinero entero vs float en producto, permiso de precio, qué hace PATCH de producto sobre `stock`, transferencia.

## 8. Independencia en el monolito

Módulo Nest `InventoryModule`:

- API de productos y movimientos.
- Servicio de aplicación `applyMovement` (único escritor de stock).
- Puertos que Órdenes y Ventas llaman **en proceso** (no HTTP interno).

Órdenes/Ventas dependen de la interfaz de movimientos, no de Prisma `products` directo. Eso permite extraer el módulo después sin reescribir el dominio.
