# 06 — Decisiones técnicas de la auditoría

Fecha: 2026-11-02. Estado: **propuestas para implementar después**. No están en el código. Sirven para no reabrir el diseño en cada fase.

## DT-01 — Un solo desplegable, módulos con dueño claro

KONTI sigue como un monolito modular: un frontend, un API y una base, cuando el backend exista.

Se descarta microservicios, event sourcing y CQRS. El dominio todavía cabe en un proceso, no hay equipos ni SLAs que justifiquen redes entre servicios, y el problema real es de límites de agregado y de transacción, no de lectura a escala.

Cada módulo tiene sus entidades y su repositorio:

| Módulo                    | Dueño de                                                                      |
| ------------------------- | ----------------------------------------------------------------------------- |
| Catálogo                  | `ServiceType`, datos comerciales de `Product` (precio, costo, unidad, estado) |
| Inventario                | `stock` y `InventoryMovement`. Nadie más escribe esas filas                   |
| Órdenes                   | `ServiceOrder` e ítems, estados de ejecución, consumos previstos              |
| Autorizaciones            | decisión del cliente sobre un ítem adicional                                  |
| Ventas                    | `Sale` sin orden                                                              |
| Documentos comerciales    | documento de cobro. No el SOAT                                                |
| Mantenimiento y vehículos | efectos ya existentes del cierre de taller                                    |

## DT-02 — No reimplementar inventario

`Product`, `InventoryMovement` e `InventoryRepository` se conservan. No se crea otra tabla de stock ni otro feature de productos.

El arreglo es de **escritura**: `ServiceOrderMockRepository.complete()` hoy muta `mockDb.products`. Ese código debe pedir el movimiento al inventario. En HTTP, el caso de uso de aplicación llama al servicio de inventario dentro de la misma transacción de base; no hace dos commits independientes para el stock y la orden.

## DT-03 — Frontera transaccional = caso de uso, no un bus

Operaciones que deben ser atómicas en el servidor:

| Caso de uso                                 | Dentro de la transacción                                                             | Fuera, idempotente                                                            |
| ------------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| Registrar movimiento manual                 | movimiento + stock + auditoría                                                       | —                                                                             |
| Confirmar trabajos de la orden              | validar ítems, km, salidas por consumo, estado de la orden, mantenimiento, auditoría | preparar documento comercial                                                  |
| Entregar venta                              | líneas, `EXIT`, estado de la venta, auditoría                                        | preparar documento comercial                                                  |
| Reversar una entrega o un consumo ya movido | movimiento inverso ligado al original + stock                                        | estado del documento, si ya se emitió: queda como decisión de negocio (DT-08) |

No se introduce cola ni outbox en la primera entrega. Un estado `billingPreparation: PENDING | READY | FAILED` en la orden o en la venta basta para reintentar el documento. Una cola se justifica solo si ese reintento tiene que sobrevivir a otro proceso.

El mock no puede ofrecer esta atomicidad. Puede dejar de mutar a medias (compensar o validar todo antes de escribir). Eso es una mejora de demo, no una transacción.

## DT-04 — Precio: catálogo de producto ya; precio de servicio en espera

`Product.price` se vuelve el precio de venta vigente. La línea (uso de producto, línea de venta, línea de documento) **copia** ese valor al volverse cobrable. Cambiar el catálogo después no reescribe la línea.

Cambiar el precio en la línea exige `catalog.price.write` y un audit `PRICE_OVERRIDDEN`.

`ServiceType` no tiene precio. Las decisiones hablan de “el catálogo” y también de cobrar servicios. **Bloqueado:** confirmar si el trabajo se cobra con un precio en `ServiceType` o si el cobro del taller es solo repuestos hasta nuevo aviso. No se añade el campo antes de esa confirmación.

No hay moneda ni impuesto en el producto ni en la orden. No se asume COP ni IVA en esos contratos. La venta directa posterior guarda `currencyCode` y deja el impuesto en cero mientras no exista tarifa; ver [10-ventas-directas.md](./10-ventas-directas.md).

## DT-05 — Previsto, consumido y no realizado

`productUsages.quantity` sigue significando lo previsto, para no romper el wizard.

Se añade `consumedQuantity`. El movimiento de stock usa solo esa cifra, y solo al confirmar trabajos.

Cada ítem gana `executionStatus`. Valores mínimos: `PLANNED`, `PENDING_AUTHORIZATION`, `AUTHORIZED`, `DONE`, `NOT_PERFORMED`.

- Los ítems incluidos al **crear** la orden nacen `PLANNED` (el alta es la aceptación inicial).
- Los ítems **agregados después** nacen `PENDING_AUTHORIZATION` y no pasan a `DONE` sin `APPROVED`.
- `NOT_PERFORMED` no genera salida de inventario ni línea de documento.

Mientras la UI no distinga consumido de previsto, el cierre de demo puede seguir tratando `quantity` como consumido. Esa compatibilidad es temporal y queda descrita en [08-riesgos-migraciones.md](./08-riesgos-migraciones.md). Con la regla 8 ya aprobada, el comportamiento nuevo no debe cobrar ni descontar un ítem no realizado.

## DT-06 — Sin reserva y sin multisede en esta evolución

La decisión 6 pide no descontar al planear. Eso ya ocurre. Reservar stock o manejar bodegas añade concurrencia y un tipo de movimiento que nadie pidió. `TRANSFER` no se expone en UI hasta tener destino.

Si más adelante hay sede, el stock deja de ser una columna de `Product` y pasa a un saldo por ubicación. Hasta entonces, mover la columna rompería el mock sin beneficio.

## DT-07 — Venta y orden no se contienen

`Sale` no exige `ServiceOrder`. Una orden no crea una venta implícita: el consumo de la orden genera movimientos `SERVICE_ORDER` y, aparte, un documento comercial. Evita dos descuentos por el mismo repuesto (uno por la orden y otro por una venta clonada).

## DT-08 — Documento comercial ≠ documento del vehículo

`VehicleDocument` permanece para SOAT, RTM, seguro e impuesto. El cobro es `CommercialDocument`, con origen orden o venta, líneas inmutables (concepto, cantidad, precio copiado) y estados `DRAFT` y `ISSUED`.

Emitir no es facturar ante la DIAN. Anular un documento ya emitido cuando el stock ya se movió queda **bloqueado** hasta que el negocio diga si se reversa inventario, si se emite una nota, o ambas.

## DT-09 — Autorización registrada por el personal, no por el portal

El portal del cliente es un placeholder. La autorización la registra un usuario con `orders.authorize`, con nota y, si hace falta, un `Attachment`. No se bloquea el diseño a una firma digital que el producto no tiene.

Los servicios del alta no piden este registro. Solo los agregados durante `OPEN` o `IN_PROGRESS`.

## DT-10 — MockRepository y HttpRepository

Contrato estable = clase abstracta + token, como hoy.

- Los mocks implementan las reglas que quepan en memoria (idempotencia por mapa, rechazo de stock negativo, no escribir stock fuera del inventario).
- `provideDataAccess()` debe elegir mock o HTTP con `environment.useMocks`. Hoy, con `useMocks: false`, igual registra mocks: hay que corregirlo cuando exista el primer HTTP, no antes con adapters vacíos.
- Cada `HttpRepository` futuro traduce el mismo método. La página no cambia.
- Métodos nuevos (venta, autorización, documento) nacen como repository propio, no como métodos inflados de `ServiceOrderRepository`, salvo las operaciones que son de la orden (agregar ítem, registrar consumo, resultado).

## DT-11 — Permisos de servidor

Cualquier regla de precio, ajuste o autorización que solo viva en Angular se puede saltar. El backend, cuando exista, es el control. El frontend solo oculta acciones.

## DT-12 — Cierre de taller y cobro, en ese orden

Se conserva el cierre actual como efecto de taller: estado, km, mantenimiento, evidencia ya subida.

El cobro lee el resultado ya guardado. No se calcula “lo cobrable” dentro de `complete()` mezclado con el stock. El caso de uso de confirmar trabajos puede llamar a ambos pasos; sus transacciones son las de DT-03.
