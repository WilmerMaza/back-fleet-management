# 05 — Contratos pendientes

Fecha: 2026-11-02.

Los contratos de `docs/api-contracts/` **no se reescriben** con esta propuesta. Siguen describiendo el núcleo operativo actual (aunque el servidor no exista). Esta página lista huecos y operaciones nuevas. Hasta que se aprueben e implementen, no son API.

Base prevista por `00-architecture.md`: `/api/v1`, `Authorization`, `X-Business-Id`, paginación `{ items, total, page, pageSize }`, errores `VALIDATION_ERROR`, `CONFLICT`, `INVALID_TRANSITION`.

## 1. Lo que los contratos ya cubren y el frontend solo simula

| Contrato                | Operaciones                                 | En el mock                                                        |
| ----------------------- | ------------------------------------------- | ----------------------------------------------------------------- |
| `05-service-catalog.md` | GET/POST/PATCH service-types                | list y create en UI; update solo en repositorio                   |
| `06-service-orders.md`  | list, get, create, patch, status, complete  | Sí, con las desviaciones de la matriz                             |
| `08-attachments.md`     | list, upload firmado, confirmar, delete     | list y upload data URL; delete en repositorio, no en la ficha     |
| `09-inventory.md`       | products GET/POST/PATCH; movements GET/POST | GET/POST producto, GET movimientos, POST solo `ENTRY` desde la UI |
| `07-audit.md`           | tabla y acciones; el GET queda para después | `listActivity` local, sin endpoint                                |

No hay que inventar otro `POST /products` ni otro `POST /inventory-movements`. Hay que completar reglas sobre los que ya están.

## 2. Reglas que faltan en contratos existentes

Sobre `09-inventory.md`:

- Clave de idempotencia obligatoria en `POST /inventory-movements`. Repetir la misma clave devuelve el movimiento ya creado y no vuelve a mover stock.
- Unicidad `(businessId, idempotencyKey)`.
- `EXIT` y `TRANSFER` rechazan stock insuficiente (`CONFLICT`). `ADJUSTMENT` tampoco puede dejar stock negativo.
- `TRANSFER` queda **fuera de alcance** hasta que exista ubicación destino. No documentar un traslado falso.
- `create product` no acepta stock suelto: la existencia inicial es un `ENTRY` o un `ADJUSTMENT` auditado.
- Toda mutación de stock, incluida la del cierre de orden y la de una venta, pasa por este recurso.
- Respuesta de movimiento incluye `relatedEntityType`, `relatedEntityId` y `balanceAfter`.
- Permiso: escribir movimientos según rol; `ADJUSTMENT` solo equivalentes a `INVENTORY` y `ADMIN`, como ya dice el contrato.

Sobre `06-service-orders.md`:

- Alinear si `complete` exige `IN_PROGRESS` o también permite `OPEN`. Hoy contrato, mock y UI no dicen lo mismo.
- El cierre no debe escribir stock por su cuenta: pide al inventario las salidas, con idempotencia `service-order:{orderId}:product:{productId}:consumed`.
- Si el stock falla, no queda km actualizado ni orden a medias. Eso requiere transacción en servidor. El mock solo puede aproximarlo compensando; no es una transacción.
- Separar, en el contrato futuro, “cerrar operación” de “preparar cobro”. El `complete` actual sigue siendo el cierre de taller (km, mantenimiento, estado). El cobro es otro recurso.
- Auditoría `INVENTORY_MOVEMENT_CREATED` y `MAINTENANCE_SCHEDULE_UPSERTED` dentro de la misma transacción, como ya pide `07-audit.md`.

Sobre `05-service-catalog.md`:

- Hacer cumplir `code` único por negocio (`CONFLICT`).
- Precio de venta del **servicio**: no añadirlo al contrato hasta cerrar la decisión DT-04 de [06-decisiones-tecnicas.md](./06-decisiones-tecnicas.md).

Sobre `01-auth.md` y `00-architecture.md`:

- El servidor debe rechazar la operación si el rol no tiene el permiso. El mapa frontend no basta.
- Publicar los códigos de `FleetPermission` (y los nuevos de la sección 4) como claims o como matriz de roles, no solo como constante de Angular.

## 3. Operaciones nuevas (propuesta, no vigentes)

Prefijo: `/businesses/{businessId}`.

### Catálogo de producto (extensión, no recurso nuevo)

`Product` ya existe. Extender el body con `price` y `cost` obligatorios al vender, y un permiso `catalog.price.write` para cambiar `price` después del alta. Leer el precio no requiere ese permiso. El histórico no vive en el producto: vive en la línea de orden, de venta o de documento.

### Líneas de la orden en ejecución

No sobrecargar el `PATCH` de la orden para reemplazar todo `items`.

- `POST /service-orders/{id}/items` — agrega un servicio. Si la orden ya está `OPEN` o `IN_PROGRESS`, el ítem nace `PENDING_AUTHORIZATION`.
- `POST /service-orders/{id}/items/{itemId}/product-usages` — cantidad **prevista**. No mueve stock.
- `POST /service-orders/{id}/items/{itemId}/consumption` — fija `consumedQuantity`. No mueve stock todavía; el movimiento nace al confirmar trabajos, para no descontar dos veces.
- `POST /service-orders/{id}/items/{itemId}/result` — `DONE` o `NOT_PERFORMED`. `DONE` de un adicional exige autorización `APPROVED`.

Campos nuevos en la línea, compatibles con el mock actual: `plannedQuantity` (espejo de `quantity` mientras no se migre), `consumedQuantity`, `unitPrice`, `priceOverridden`.

### Autorizaciones

- `POST /service-orders/{id}/authorizations` — solicita autorización de un ítem adicional.
- `POST /service-authorizations/{id}/decision` — `APPROVED` o `REJECTED`, con `decidedBy` (usuario interno que registra la decisión del cliente) y nota. El canal de firma del portal queda fuera: el portal es un placeholder.

### Ventas

- `POST /sales` — venta sin `serviceOrderId`. Líneas con `productId` y cantidad. El servidor copia `unitPrice` desde `Product.price`. Override solo con `catalog.price.write`.
- `POST /sales/{id}/deliver` — `EXIT` idempotente, `relatedEntityType=SALE`.
- `POST /sales/{id}/cancel` — si ya hubo entrega, `RETURN` o movimiento que apunta a `reversesMovementId`. Si no hubo entrega, solo cancela.

### Documentos comerciales

Recurso nuevo, distinto de `/vehicles/{id}/documents` (`15-documents.md`).

- `POST /commercial-documents` — body `{ sourceType: SERVICE_ORDER | SALE, sourceId }`. Arma líneas cobrables:
  - orden: ítems `DONE` con su precio de servicio (si existe) y usos con `consumedQuantity > 0`;
  - venta: líneas entregadas.
- Repetir el POST con el mismo origen devuelve el mismo documento (idempotente).
- `POST /commercial-documents/{id}/issue` — pasa de borrador a emitido. No implica factura electrónica.

### Auditoría nueva

Acciones a sumar al catálogo de `07-audit.md` cuando existan las operaciones: `PRICE_OVERRIDDEN`, `SERVICE_AUTHORIZATION_DECIDED`, `SALE_DELIVERED`, `COMMERCIAL_DOCUMENT_PREPARED`.

## 4. Permisos propuestos (aún no están en `permissions.ts`)

| Código                | Quién, en la propuesta                           |
| --------------------- | ------------------------------------------------ |
| `catalog.price.write` | Cambiar precio de venta respecto al catálogo     |
| `orders.items.write`  | Agregar servicio o producto durante la ejecución |
| `orders.authorize`    | Registrar la decisión del cliente                |
| `sales.write`         | Crear y entregar una venta directa               |
| `billing.prepare`     | Armar y emitir el documento comercial            |
| `inventory.adjust`    | `ADJUSTMENT`. Alineado al contrato actual        |

Los roles concretos se asignan cuando el negocio lo confirme. No se han editado `ROLE_PERMISSIONS`.

## 5. Fuera de estos contratos

- Factura electrónica, DIAN, CUFE, impuestos y retenciones.
- Varias bodegas y reservas.
- Lista de precios por cliente o por flota.
- Cobro en pasarela.

Esos temas no están en las decisiones aprobadas ni en el código.
