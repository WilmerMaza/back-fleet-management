# Diseño técnico — módulo Service Orders (inicio)

| | |
| --- | --- |
| Fecha | 2026-11-05 |
| Estado | **Implementado (Lote 4)** — greenfield Nest + TX inventario; D3 sin maintenance |
| Contrato | [`docs/api-contracts/06-service-orders.md`](../api-contracts/06-service-orders.md) |
| Estándar | [`backend-architecture-standard.md`](./backend-architecture-standard.md) |
| Relacionados | [`07-audit.md`](../api-contracts/07-audit.md), [`05-service-catalog.md`](../api-contracts/05-service-catalog.md), [`lock-order.md`](../lock-order.md), [`domain-model.md`](../domain-model.md) |
| Fuera de esta entrega | Código, migraciones, cambios a módulos existentes, ventas/facturación, sugerencias (16) |

---

## 1. Qué establece realmente el contrato 06

### Endpoints HTTP (prefijo `/api/v1`)

| Método | Ruta | Intención |
| --- | --- | --- |
| `GET` | `/businesses/{businessId}/service-orders` | Listar con filtros |
| `GET` | `/businesses/{businessId}/service-orders/{id}` | Detalle |
| `POST` | `/businesses/{businessId}/service-orders` | Alta |
| `PATCH` | `/businesses/{businessId}/service-orders/{id}` | Edición (no terminales) |
| `POST` | `/businesses/{businessId}/service-orders/{id}/status` | Transición de estado (no complete) |
| `POST` | `/businesses/{businessId}/service-orders/{id}/complete` | Cierre atómico |

**No** define endpoints separados de “add line” / “remove line”; líneas van en create y, por extensión práctica del mock, en PATCH. La extensión comercial (sugerencias, no realizados, autorización) apunta a [16](../api-contracts/16-service-suggestions.md) y **queda fuera** de este diseño.

### Reglas explícitas

- Create **no** descuenta inventario.
- Complete **sí** descuenta (EXIT) una sola vez, en TX atómica.
- No editar órdenes `COMPLETED` / `CANCELLED`.
- `createdBy` / `closedByUserId` desde sesión; cliente puede enviar `operatorUserId` / `technicianUserId`.
- Listado: `status`, `vehicleId`, `search`, `page`, `pageSize`, `sortBy`, `sortDir`.
- `search` sobre el conjunto completo (mínimo `orderNumber`; mock también placa/cliente/servicio — documentar alcance HTTP o 400).
- `sortBy`: `orderNumber` \| `openedAt` (default) \| `updatedAt` \| `status` \| `mileage`; default `sortDir=desc`.
- Auditoría: `SERVICE_ORDER_CREATED`, `SERVICE_ORDER_STATUS_CHANGED`, `SERVICE_ORDER_COMPLETED` (detalle en 07).
- Complete paso 5: upsert `maintenance_schedules` si hay regla / próximo mantenimiento.
- Complete paso 8 (MVP2): notificaciones — **no** en este alcance.
- Attachments / `listActivity`: diferidos (08 / audit list); evidencias `entityType=SERVICE_ORDER`.

### Límites comerciales (producto + este diseño)

- Sin ventas ni facturación.
- Sin inventar tarifas, impuestos ni cobro de mano de obra.
- Sin automatizaciones de mantenimiento más allá de lo que complete exige en el contrato (ver §10).

---

## 2. Modelos y relaciones necesarios

**Hoy en Prisma:** no existen tablas de órdenes ni catálogo. `MileageSource.SERVICE_ORDER` **sí** existe (útil para logs de km).

### Tablas propuestas (greenfield, migración futura — no crear aún)

| Tabla | Rol |
| --- | --- |
| `service_types` | Catálogo por negocio (contrato 05); requerido por `items[].serviceTypeId` |
| `service_orders` | Cabecera de orden |
| `service_order_items` | Líneas de servicio |
| `service_order_product_usages` | Productos por línea (cantidad prevista/consumida) |

Campos de cabecera alineados al contrato / 07-audit (nombres físicos snake_case vía Prisma `@map`):

- Identidad: `id`, `business_id`, `order_number` (único por negocio).
- Vínculos: `customer_id`, `vehicle_id`.
- Estado: `status`, `opened_at`, `closed_at`, `closed_by_user_id`.
- Km / mantenimiento previsto: `mileage`, `next_maintenance_mileage`, `next_maintenance_date`, `maintenance_rule` (nullable).
- Actores: `created_by`, `operator_user_id`, `technician_user_id`.
- Texto: `observations`.
- Timestamps: `created_at`, `updated_at`.

Líneas: `service_order_id`, `business_id`, `service_type_id`, `notes`, orden/posición.  
Usages: `service_order_item_id`, `business_id`, `product_id`, `quantity` (Decimal), opcional `quantity_consumed` si se adopta la extensión del mock — **pendiente** (§10).

### Integridad referencial multi-tenant (obligatorio al migrar)

Patrón H-07 desde día 1:

1. `UNIQUE (business_id, id)` en padres (`service_orders`, `service_types`, items si se referencian).
2. FK compuestas hijas, p. ej.:
   - `(business_id, customer_id) → customers(business_id, id)`
   - `(business_id, vehicle_id) → vehicles(business_id, id)`
   - `(business_id, service_type_id) → service_types(business_id, id)`
   - `(business_id, product_id) → products(business_id, id)` (usages)
   - items/usages → orden con `(business_id, service_order_id)`
3. FK a `businesses(id)` por `business_id`.
4. Actores (`created_by`, etc.): FK simple a `users(id)` o sin FK (convención actual de actores); **no** forzar co-tenancy usuario–negocio vía FK de orden (membresía es otra tabla).

Ownership cliente↔vehículo: regla de **aplicación/dominio** (mismo patrón que flotas: `assertSameCustomer`), reforzada con queries tenant-scoped — no sustituye la FK tenant.

### Dependencia de catálogo

Sin `service_types` no se puede honrar el payload create. El contrato 05 está **pendiente de módulo**. Opciones en §10.

---

## 3. Estados y transiciones

Definidos en 06:

```text
DRAFT → OPEN | CANCELLED
OPEN → IN_PROGRESS | CANCELLED
IN_PROGRESS → COMPLETED | CANCELLED
COMPLETED → (terminal)
CANCELLED → (terminal)
```

- Body `/status`: `{ "status": "<destino>" }` — solo transiciones **no-complete**.
- `COMPLETED` **solo** vía `/complete`.
- Create puede nacer en `OPEN` (ejemplo del contrato) o `DRAFT` — ambos válidos si respetan la máquina.
- Dominio: función/máquina pura `assertTransition(from, to)` + `assertEditable(status)` (prohibido editar terminales).

---

## 4. Casos de uso a implementar

| Use case | Endpoint | Notas |
| --- | --- | --- |
| `CreateServiceOrderUseCase` | `POST …/service-orders` | Valida customer/vehicle mismo tenant + mismo customer; items; audit CREATED; **sin** stock |
| `GetServiceOrderUseCase` | `GET …/{id}` | 404 si otro tenant |
| `ListServiceOrdersUseCase` | `GET …` | Filtros + paginación `presentPage` |
| `UpdateServiceOrderUseCase` | `PATCH …/{id}` | Solo no terminal; puede ajustar cabecera/ítems según contrato; **no** complete disfrazado |
| `ChangeServiceOrderStatusUseCase` | `POST …/{id}/status` | Máquina sin COMPLETED; audit STATUS_CHANGED |
| `CompleteServiceOrderUseCase` | `POST …/{id}/complete` | TX atómica (§7) |
| Cancel | vía `/status` → `CANCELLED` | Sin EXIT; no use case aparte salvo claridad de API |

**No** en v1 de este módulo (contrato/extensión):

- Endpoints de sugerencias / autorización de líneas (16).
- Attachments (08).
- HTTP de audit-logs (07 listado).
- Notificaciones (MVP2).

---

## 5. Puertos realmente necesarios

Solo fronteras con consumidores reales (estándar § proporcionalidad):

| Puerto (Application) | Por qué | Adapter (Infrastructure / borde) |
| --- | --- | --- |
| `UnitOfWork` / `TransactionPort` | Complete (y create si multi-write) sin filtrar `Prisma.TransactionClient` a Application | Encapsula `prisma.$transaction` |
| `ServiceOrderRepository` | Persistencia del agregado órdenes/ítems/usages + list/lock | Prisma repo |
| `InventoryStockPort` (o `InventoryExitPort`) | Complete descuenta stock **sin** modificar `InventoryStockService` | Llama `InventoryStockService.apply(input, txClient)` **dentro** del adapter; Application solo ve el port |
| `VehicleMileagePort` | Km + log `source=SERVICE_ORDER` en la misma TX | Adapter Prisma sobre `vehicles` / `vehicle_mileage_logs` (sin reescribir use cases de vehicles) |
| `AuditPort` (opcional tipado) | Evitar `Prisma.TransactionClient` en firma de Application | Thin wrap de `AuditService.record` |

**No** crear aún (salvo decisión §10):

- `MaintenanceSchedulePort` — bloqueado por ausencia de módulo/tablas maintenance.
- GenericRepository, CQRS, MediatR.
- Ports a customers “CRUD”: basta validación en repo/queries del propio SO (`findCustomerInBusiness`, etc.) o lecturas Prisma en **infrastructure** del módulo SO.

Lectura de `service_types` / products: vía repo SO o ports mínimos de “ensure exists + ACTIVE + same business”.

---

## 6. Integración con inventario, vehículos y auditoría

```text
ServiceOrdersModule (greenfield)
  → InventoryModule          (exporta InventoryStockService — legado; no se modifica)
  → AuditModule              (AuditService)
  → (adapters propios)       mileage / UoW / SO repo
  ↛ no importa UseCases de customers/vehicles/products
```

| Concern | Cómo |
| --- | --- |
| Stock | Solo `InventoryStockService.apply`; tipo `EXIT`; `relatedEntityType=SERVICE_ORDER`, `relatedEntityId=orderId`; `operationKey` estable p.ej. `so-complete:{orderId}:{usageId}` |
| Create | No llama stock |
| Km | Bajo lock de vehículo; `mileage >= currentMileage`; actualiza `currentMileage` + `vehicle_mileage_logs` con `MileageSource.SERVICE_ORDER` |
| Audit | Misma TX: CREATED / STATUS_CHANGED / COMPLETED (+ movimientos ya auditan vía stock service) |
| Tenancy | Todo filtrado por `businessId` del path/contexto Guard |

**Contradicción estándar vs legado de stock (documentada, no “arreglada” inventando):**  
`InventoryStockService.apply` hoy acepta `Prisma.TransactionClient`. Greenfield Application **no** debe importar ese tipo. Solución: el **adapter** en infrastructure (o capa de borde del módulo SO) es el único que conoce Prisma y reenvía el client opaco del UoW. **No** se cambia la implementación de `InventoryStockService` en esta iniciativa.

---

## 7. Transacción atómica de `CompleteServiceOrder`

Orden de locks ([`lock-order.md`](../lock-order.md)):

```text
1. service_orders(id) FOR UPDATE
2. (fleets — no aplica en complete típico)
3. vehicles(id) FOR UPDATE
4. products(id) ASC via InventoryStockService (ya FOR UPDATE interno)
5. maintenance_schedules — solo si se implementa el paso 5
```

Secuencia (una sola `uow.run`):

1. Lock orden; cargar agregado; validar transición → `COMPLETED` (o camino idempotente si ya COMPLETED + mismos `operationKey`).
2. Validar `mileage >= vehicle.currentMileage`; lock vehículo; actualizar km + log.
3. Para cada usage a descontar (definir cantidad: prevista vs consumida — §10): `inventoryStockPort.applyExit(...)` con `operationKey`.
4. Upsert maintenance **si** hay port/tablas; si no, ver §10 (no inventar horarios).
5. `status=COMPLETED`, `closedAt=now()`, `closedByUserId=actor`.
6. `audit SERVICE_ORDER_COMPLETED` con metadata de actores (07).
7. Commit; cualquier fallo → rollback total → 409/422 según `AppError`.

Idempotencia: reintento con mismos keys → éxito sin doble EXIT; keys divergentes → 409 (`OPERATION_ALREADY_PROCESSED` / conflicto de dominio).

---

## 8. Endpoints y permisos

### Contrato HTTP

Los del §1 (sin inventar rutas).

### Permisos en código actual (`permissions.ts`)

| Código backend | Roles que lo tienen hoy |
| --- | --- |
| `orders.complete` | ADMIN, OPERATOR, TECHNICIAN |

**No existen** en el enum Nest actual: `orders.read`, `orders.write`, `nav.orders` (sí aparecen en contrato 18 / UI).

| Operación | Permiso deseable (contrato 18) | Estado en API |
| --- | --- | --- |
| List / get | `orders.read` o `nav.orders` | **Ausente** — decisión pendiente (§10) |
| Create / patch / status | `orders.write` | **Ausente** |
| Complete | `orders.complete` | Presente |

Hasta ampliar `Permission` + `ROLE_PERMISSIONS`, no se puede alinear create/list con 18 sin inventar o reutilizar mal otro permiso. Ampliar permisos es cambio en `shared/authorization` (compartido), no en módulos de dominio — debe acordarse explícitamente (no “modificar módulos de negocio”, pero sí shared auth).

Guards: mismo patrón que customers — `@UseGuards(AuthGuard)` + `@RequirePermission(...)` + `businessId` de path ≡ contexto.

---

## 9. Pruebas necesarias

### Unitarias (domain / application con doubles)

- Máquina de estados: transiciones válidas/inválidas; no editar terminales.
- Complete rechaza mileage menor.
- Idempotencia de `operationKey` / complete ya cerrado.
- Ownership customer–vehicle.

### Integración (Testcontainers)

- Create no mueve stock; audit CREATED.
- Status OPEN→IN_PROGRESS; audit STATUS_CHANGED.
- Complete: km + EXIT + COMPLETED + audit; stock coherente.
- Complete con stock insuficiente → 409 + rollback (orden no COMPLETED, stock intacto).
- Complete paralelo misma orden (FOR UPDATE) — un ganador.
- Cross-tenant: GET/PATCH/complete con otro `businessId` → 403/404.
- No editar COMPLETED/CANCELLED.
- Cancel vía status sin EXIT.

### No en v1

- Sugerencias 16, attachments, notificaciones, UI roles HTTP.

---

## 10. Decisiones pendientes (bloquean partes del alcance)

| ID | Tema | Bloquea | Opciones (elegir antes de codificar) |
| --- | --- | --- | --- |
| **D1** | Catálogo `service_types` (05) no existe | Create con `serviceTypeId` | (a) Implementar módulo/tablas mínimas 05 en paralelo; (b) diferir items tipados — **contradice** payload 06 |
| **D2** | Permisos `orders.read` / `orders.write` ausentes | List/create/patch/status seguros | Extender `Permission` + roles; documentar mapeo |
| **D3** | Complete paso 5 `maintenance_schedules` | Complete “completo” vs contrato | (a) Módulo mínimo maintenance + port; (b) Complete v1 **sin** upsert y documentar desviación temporal del contrato 06 § complete.5; (c) no-op si campos next* null |
| **D4** | Cantidad a descontar: prevista vs consumida (extensión mock 2026-11-02) | Exactitud de EXIT | v1: descontar `quantity` de usage; diferir `quantity_consumed` / “no realizado” hasta 16 |
| **D5** | Alcance de `search` | Contrato list | Mínimo `orderNumber`; ampliar placa/cliente/servicio o 400 documentado |
| **D6** | Body exacto de `/complete` y PATCH | DTOs | Contrato 06 no detalla JSON de complete (mileage, etc.) — inferir de efectos + mock front; **congelar** shape en implementación y reflejar en 06 si difiere |
| **D7** | Adapter mileage vs duplicar SQL | Complejidad | Preferir adapter Prisma local en SO infra (sin tocar use cases vehicles) |
| **D8** | `listActivity` / evidencias | Ficha front | Fuera de alcance hasta 07 list + 08 |

### Contradicciones contrato ↔ estándar / alcance (no resueltas inventando)

1. **Maintenance en complete** vs “no agregar módulo de mantenimiento” (briefing) → D3.
2. **Permisos 18** vs `permissions.ts` actual → D2.
3. **Items requieren serviceTypeId** vs catálogo 05 pendiente → D1.
4. **Extensión comercial del mock** (consumido/no realizado) no está en el cuerpo principal de endpoints 06 → D4; no implementar 16.
5. **`InventoryStockService` tipado con Prisma** vs Application greenfield sin Prisma → se resuelve con adapter (no cambiando el servicio legado).

---

## 11. Estructura de carpetas (proporcional)

```text
src/modules/service-orders/
├── domain/
│   ├── order-status.ts              # enum + assertTransition / assertEditable
│   ├── ownership.ts                 # customer ↔ vehicle (o reutilizar helper vehicles si se exporta puro)
│   └── order-status.spec.ts
├── application/
│   ├── ports/
│   │   ├── unit-of-work.ts
│   │   ├── service-order.repository.ts
│   │   ├── inventory-stock.port.ts
│   │   └── vehicle-mileage.port.ts
│   ├── create-service-order.use-case.ts
│   ├── get-service-order.use-case.ts
│   ├── list-service-orders.use-case.ts
│   ├── update-service-order.use-case.ts
│   ├── change-service-order-status.use-case.ts
│   └── complete-service-order.use-case.ts
├── infrastructure/
│   ├── persistence/
│   │   ├── prisma-unit-of-work.ts
│   │   └── prisma-service-order.repository.ts
│   └── adapters/
│       ├── inventory-stock.adapter.ts   # → InventoryStockService.apply
│       └── vehicle-mileage.adapter.ts
├── presentation/
│   ├── service-orders.controller.ts
│   ├── service-order.presenter.ts
│   └── dto/
│       └── service-order.dto.ts
└── service-orders.module.ts
```

Sin `value-objects/` vacíos. Sin GenericRepository. Wiring Nest: providers de use cases + adapters; `imports: [InventoryModule, AuditModule]`.

---

## 12. Criterio para pasar a implementación

Bloqueantes a cerrar por producto/arquitectura:

1. D1 (catálogo) y D2 (permisos).
2. D3 (maintenance en complete): aceptar desviación documentada o alcance mínimo.
3. D6: shape de complete/PATCH acordado con el contrato (actualizar 06 si hace falta — **otro** ticket de docs, no inventar en silencio).

Luego: migración Prisma greenfield (UNIQUE+FK tenant) → módulo → tests int del happy path complete.

**Detenido.** Sin código, sin migraciones, sin cambios a módulos existentes.
