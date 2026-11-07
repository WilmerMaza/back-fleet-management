# 07 — Plan de implementación

Fecha: 2026-11-02. Ordenado por dependencia. No ejecutar este plan dentro de la auditoría: aquí no se cambia código de producto.

## Clasificación

### Reutilizable

- Patrón Repository, token y `MockDb`.
- `Customer`, `Vehicle`, `Fleet`, `Attachment`, `AuditLog`, `MaintenanceSchedule`.
- `ServiceOrder` con varios `items` y productos por ítem.
- Alta de orden **sin** movimiento de stock. Inicio de trabajo **sin** movimiento de stock.
- `Product` (sku, nombre, unidad, stock, mínimo, estado) e `InventoryMovement` (`ENTRY`, `EXIT`, `RETURN`, `ADJUSTMENT`).
- `Product.price` y `Product.cost` como campos, no como función de pantalla.
- Permisos de ruta ya existentes (`OrdersWrite`, `OrdersComplete`, `InventoryWrite`).
- Cierre con diálogo de kilometraje, evidencias y actividad de la ficha.
- Contratos `05`, `06`, `07`, `08`, `09` como base. No duplicarlos.

### Ajustar

- Un solo escritor de stock: el inventario. El cierre de orden deja de tocar `mockDb.products`.
- Validar stock de **todos** los consumos antes de escribir km o salidas (en mock). La transacción real espera al backend.
- `quantity` como prevista; consumo explícito antes de descontar.
- Estado de ejecución del ítem, para no tratar como hecho lo no realizado.
- Auditoría de movimientos y de mantenimiento, ya prometida por `07-audit.md`.
- Stock inicial mediante movimiento, no como número suelto al crear el producto.
- Piso de stock también en `ADJUSTMENT` y en el alta.
- Unicidad de `ServiceType.code`.
- Alinear “completar desde `OPEN`” entre UI, mock y `06-service-orders.md`.
- `provideDataAccess()` cuando llegue HTTP: hoy ignora `useMocks: false`.

### Incompleto

- Precio y costo en la UI de producto y copia del precio en la línea.
- Ajuste, devolución y salida manual en pantalla (el mock ya registra `ENTRY`; `RETURN` y `ADJUSTMENT` están en el método y no en la UI).
- Edición de producto y de tipo de servicio (el repositorio tiene `update`).
- Agregar servicios y productos con la orden ya abierta.
- Ficha utilizable por el técnico para consumos, no solo para fotos y estados.
- Borrado de evidencias en la ficha (`remove` ya existe).
- Historial de movimientos de la orden semilla (el array empieza vacío).

### No implementado

- Venta directa.
- Autorización de adicionales.
- Documento comercial.
- `HttpRepository` y backend (API, tablas, permisos de servidor).
- Idempotencia, bloqueo de existencias, reversa ligada a un movimiento.
- Reserva y multisede (y no se planifican hasta que se pidan).
- Precio en `ServiceType` (esperando DT-04).
- Moneda, impuestos, factura electrónica.

### Bloqueado por decisión de negocio

- Si el servicio tiene precio de catálogo o solo se cobran repuestos (DT-04).
- Qué ocurre con un documento ya emitido si hay que reversar stock (DT-08).
- Qué roles reciben `catalog.price.write`, `orders.authorize`, `sales.write` y `billing.prepare`.
- Si completar exige pasar por `IN_PROGRESS`.
- Canal futuro de autorización del cliente (portal). El diseño no lo espera; el producto puede quererlo después.

## Orden de trabajo

El riesgo crece hacia abajo. Cada fase deja los mocks actuales arrancando.

### Fase A — Integridad del stock que ya existe

Depende de: nada nuevo.

1. El cierre pide `InventoryRepository.registerMovement` (o un método interno único usado por el mock de órdenes y el de inventario) para cada consumo.
2. Comprueba todas las cantidades antes de mutar km, stock u orden.
3. Escribe `INVENTORY_MOVEMENT_CREATED` y `MAINTENANCE_SCHEDULE_UPSERTED`.
4. El alta de producto con stock > 0 genera un `ENTRY`.
5. Pruebas de mock: stock insuficiente no deja salidas ni km tocados; completar dos veces no descuenta dos veces (la segunda falla por estado).

Riesgo: las pruebas de ficha que espían `complete()` siguen válidas si la firma no cambia. El spec de mock de órdenes hoy no cubre stock; hay que añadirlo.

No cambia aún la regla “todo `quantity` se consume”. Así no se rompe el demo del wizard.

### Fase B — Precio de producto y copia en la línea

Depende de: Fase A no es estricta, pero conviene no tocar el cierre dos veces. Puede ir en paralelo si no modifica `complete`.

1. Formulario y tabla muestran `price` y `cost` sin mezclarlos con el verde de éxito (son datos, no estado).
2. Al agregar un producto a la orden o a una venta futura, se copia `price` a la línea.
3. Permiso nuevo solo cuando se permita override. Hasta entonces la UI no edita el precio de la línea.

Riesgo bajo para el demo: campos opcionales. La semilla ya tiene precio.

### Fase C — Ejecución de la orden

Depende de: A (el descuento debe usar la cantidad consumida).

1. `plannedQuantity` / `consumedQuantity`. Compatibilidad: si `consumedQuantity` viene vacío, el cierre demo usa `quantity` y queda documentado como legado.
2. `executionStatus` por ítem.
3. `POST` de ítem y de uso previsto con la orden en `OPEN` o `IN_PROGRESS`, en repository y en la ficha.
4. Resultado `NOT_PERFORMED` no descuenta ni entra al documento.
5. Ítem agregado en ejecución queda pendiente de autorización (Fase D). Hasta que D exista, la ficha puede agregarlo como `PLANNED` **solo** si se acepta una desviación temporal. Preferible no mostrar “agregar servicio” en producción hasta D, para no ejecutar adicionales sin autorización.

Riesgo medio: el wizard y la ficha cambian. Hay que revisar listado (sigue mostrando nombres de ítems) y el diálogo de cierre (debe decir qué se va a descontar).

### Fase D — Autorizaciones

Depende de: C (ítem identificable y estado).

1. Modelo, repository, mock y token nuevos.
2. Decisión `APPROVED` / `REJECTED` registrada por un usuario interno.
3. No pasar a `DONE` sin aprobación si el ítem nació como adicional.

Riesgo medio. No toca clientes ni vehículos.

### Fase E — Venta directa

Depende de: A (movimientos idempotentes) y B (precio copiado). No depende de la orden.

1. `Sale` + líneas + `deliver`.
2. `EXIT` con `relatedEntityType=SALE`.
3. Pantalla propia. No meterla dentro de inventario ni de órdenes.

Riesgo medio: nuevo feature lazy, permiso y entrada de navegación.

### Fase F — Documento comercial

Depende de: C y E para tener líneas cobrables; de DT-04 si el documento debe incluir mano de obra.

1. Repository nuevo.
2. Preparación idempotente desde orden o venta.
3. Excluir `NOT_PERFORMED` y cantidades no consumidas.
4. No usar la ruta `/app/documents`.

Riesgo medio-alto de producto (copia fiscal percibida por el usuario). El documento debe decir en la UI que es un comprobante interno hasta que exista factura electrónica.

### Fase G — Backend e `HttpRepository`

Depende de: contratos de A–F estables. **Bloqueada** por no haber servidor en el repo.

1. Tablas del dominio actual más las nuevas, con `business_id`.
2. Transacciones de DT-03 y `SELECT` con bloqueo (o versión) al mover stock.
3. Permisos en servidor.
4. `provideDataAccess()` según `useMocks`.
5. Las páginas no se reescriben.

## Qué no hacer en paralelo

- No crear un segundo catálogo de productos.
- No descontar al agregar una línea prevista.
- No generar una venta automática al completar la orden.
- No guardar la factura en `VehicleDocument`.
- No añadir bodegas, reservas, CQRS ni un broker “por si acaso”.
