# 02 — Mapa de entidades

Fecha: 2026-11-02. “Existe” significa modelo TypeScript en `src/app/data-access/models/` y, si se indica, mock. No implica base de datos.

## 1. Núcleo que ya existe

```text
Business
 ├── User (roleCodes)
 ├── Customer
 │    └── Vehicle
 │         ├── VehicleMileageLog
 │         └── VehicleDocument   ← solo interfaz; sin repositorio
 ├── Fleet
 │    └── FleetVehicle → Vehicle
 ├── ServiceType                 ← catálogo de trabajos, sin precio
 ├── ServiceOrder
 │    ├── ServiceOrderItem → ServiceType
 │    │    └── ServiceOrderProductUsage → Product
 │    └── Attachment (entityType = SERVICE_ORDER)
 ├── Product                     ← catálogo + stock en el mismo objeto
 │    └── InventoryMovement
 ├── MaintenanceSchedule
 ├── AppNotification             ← filas en MockDb; sin repositorio
 └── AuditLog
```

Multiempresa: el tenant es `Business`. Las entidades operativas llevan `businessId`. El mock siembra dos negocios (Taller Demo Fleet y Lubricantes del Norte). `Customer` no es el tenant. Ver `docs/api-contracts/00-multitenancy.md`.

## 2. Producto e inventario (lo que hay)

`Product` (`inventory.model.ts`):

| Campo                                                                | Uso real                                                                                                            |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `sku`, `name`, `category?`, `brand?`, `reference?`, `unit`, `status` | Catálogo. La pantalla edita sku, nombre, categoría, unidad y stock. `brand` y `reference` no salen en el formulario |
| `stock`, `minStock`                                                  | Existencia única. No hay bodega, sede ni ubicación                                                                  |
| `cost?`, `price?`                                                    | Opcionales. La semilla `prod-001` y `prod-002` los trae. Ninguna pantalla los muestra ni los envía al crear         |
| `unit`                                                               | Texto libre. El alta usa default `UND`. La semilla usa `L` y `UND`. No hay catálogo de unidades                     |

`InventoryMovement`:

| Campo                                    | Uso real                                                                                                                     |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `type`                                   | `ENTRY`, `EXIT`, `ADJUSTMENT`, `RETURN`, `TRANSFER`                                                                          |
| `quantity`                               | En `ENTRY` y `RETURN` suma. En `EXIT` y `TRANSFER` resta si hay stock. En `ADJUSTMENT` **reemplaza** el stock por `quantity` |
| `balanceAfter`                           | Lo calcula el mock                                                                                                           |
| `reason?`                                | Texto                                                                                                                        |
| `relatedEntityType?`, `relatedEntityId?` | El cierre de orden pone `SERVICE_ORDER` + id de la orden                                                                     |
| `createdBy?`                             | Opcional                                                                                                                     |

No hay: `idempotencyKey`, ubicación origen/destino, reserva, lote, serial, costo del movimiento, precio del movimiento, referencia al movimiento revertido, ni `version` de concurrencia.

### Comportamiento del mock de inventario

- `EXIT` y `TRANSFER` fallan con “Stock insuficiente” si `stock < quantity`.
- `TRANSFER` solo resta. No hay destino, así que no es un traslado.
- `ADJUSTMENT` puede dejar stock negativo: no hay piso.
- `createProduct` fija `stock` inicial **sin** movimiento. El historial no explica esa existencia.
- `registerMovement` no escribe `audit_logs`.
- No hay reserva. Crear o iniciar una orden no mueve stock. El descuento ocurre en `ServiceOrderMockRepository.complete()`, escribiendo el movimiento a mano.

### Semilla

Dos productos del negocio demo, stock 80 y 25. `inventoryMovements` empieza vacío: las salidas de la orden semilla no están reconstruidas como movimientos.

## 3. Orden (lo que hay)

`ServiceOrder`: número, cliente, vehículo, estado, `openedAt`, `closedAt`, km, técnico, operador, `closedByUserId`, observaciones, ítems, próxima regla de mantenimiento. Proyecciones de lectura: placa, cliente, técnico.

`ServiceOrderItem`: tipo de servicio (id, código y nombre copiados), notas, `productUsages[]`. El estado es de la orden, no del ítem. El nombre del servicio queda copiado; el precio no, porque el tipo no tiene precio.

`ServiceOrderProductUsage`: `productId`, `productName`, `sku?`, `quantity`, `unit`. Una sola cantidad. No distingue previsto y consumido. No copia `price` ni `cost`.

## 4. Lo que no existe

| Concepto                                      | Búsqueda                                                            |
| --------------------------------------------- | ------------------------------------------------------------------- |
| Venta directa                                 | Sin modelo, ruta, repositorio ni contrato                           |
| Autorización del cliente                      | Sin modelo. “Autorización” en el código es permiso de ruta o sesión |
| Factura o documento comercial                 | Sin modelo. `15-documents.md` es SOAT/RTM/seguro                    |
| Precio histórico de una línea                 | No                                                                  |
| Reserva de stock                              | No                                                                  |
| Varias ubicaciones                            | No                                                                  |
| Moneda, impuesto, descuento, lista de precios | No                                                                  |
| Proveedor                                     | Solo mencionado como expansión en `24-expansion.md`                 |

## 5. Relación objetivo (propuesta, no implementada)

Se reutilizan las entidades actuales. Lo nuevo está marcado.

```text
ServiceType  (+ precio de venta, cuando se confirme que el servicio se cobra)
Product      (catálogo: sku, unidad, cost, price, status)
    └── StockBalance sigue siendo Product.stock mientras haya una sola existencia

InventoryMovement  (única vía de cambiar stock)
    relatedEntityType: SERVICE_ORDER | SALE | MANUAL
    + idempotencyKey
    + reversesMovementId?

ServiceOrder
    └── ServiceOrderItem
         ├── executionStatus          ← nuevo
         ├── salePrice snapshot       ← nuevo, si el servicio se cobra
         └── ServiceOrderProductUsage
              ├── plannedQuantity     ← hoy es quantity
              ├── consumedQuantity    ← nuevo
              └── unitPrice snapshot  ← nuevo

ServiceAuthorization                 ← nuevo, solo trabajos agregados durante la ejecución
    serviceOrderItemId
    status: REQUESTED | APPROVED | REJECTED

Sale                                  ← nuevo, sin orden obligatoria
    └── SaleLine → Product + unitPrice snapshot
         inventory: EXIT al entregar, relatedEntityType = SALE

CommercialDocument                    ← nuevo, distinto de VehicleDocument
    source: SERVICE_ORDER | SALE
    lines copiadas (concepto, cantidad, precio histórico)
```

`VehicleDocument` no se reutiliza como factura. Sigue siendo el documento del vehículo.

## 6. Decisiones de negocio y el mapa

| Decisión                                         | Dónde viviría                                                                 | ¿Hay entidad hoy?                                                    |
| ------------------------------------------------ | ----------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Precio de venta desde el catálogo                | `Product.price` y, si aplica, precio en `ServiceType`                         | El campo de producto existe y no se usa. El servicio no tiene precio |
| Precio modificable solo con permiso              | Permiso nuevo + snapshot en la línea                                          | No                                                                   |
| Autorización antes de ejecutar un adicional      | `ServiceAuthorization`                                                        | No                                                                   |
| Factura al confirmar trabajos                    | `CommercialDocument` armado con líneas ejecutadas y consumidas                | No                                                                   |
| Venta sin orden                                  | `Sale` con `serviceOrderId` nulo                                              | No                                                                   |
| Varios servicios y adicionales en ejecución      | `items[]` ya admite varios en el alta. Falta operación de agregado posterior  | Parcial                                                              |
| Lo previsto no descuenta                         | Cumplido: el alta no mueve stock                                              | Sí, en el mock                                                       |
| Consumo, venta o entrega mueven inventario       | Consumo: sí, al completar, dentro del mock de órdenes. Venta y entrega: no    | Parcial                                                              |
| Lo no realizado no se cobra como hecho           | Hace falta `executionStatus`. Hoy el cierre trata todos los ítems como hechos | No                                                                   |
| Orden, inventario, venta y facturación separados | Hoy el mock de órdenes escribe stock y movimientos                            | No, en el cierre                                                     |
