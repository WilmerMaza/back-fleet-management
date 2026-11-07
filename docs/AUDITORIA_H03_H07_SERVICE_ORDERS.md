# KONTI — Auditoría H-03 + H-07 + Arquitectura de referencia (Service Orders)

| | |
| --- | --- |
| Repo | `back-fleet-management` |
| Fecha | 2026-11-04 |
| Alcance | Solo lectura (sin correcciones ni migraciones) |
| Fuentes | `prisma/schema.prisma`, `prisma/migrations/`, PostgreSQL en vivo, `src/modules/**`, `docs/api-contracts/06-service-orders.md`, `cursor/rules/*` |
| Fuera de alcance (no reabrir sin regresión) | H-01, H-02, H-04, H-12 |

**Leyenda de evidencia**

- **Hecho verificado:** constatado en código, migración SQL o consulta a PostgreSQL.
- **Inferencia:** conclusión razonable a partir de hechos.
- **Recomendación:** propuesta arquitectónica; requiere aprobación antes de implementar.

---

## 1. Resumen ejecutivo

El backend es un **monolito modular NestJS usable**, con tenancy por `business_id`, inventario concurrente sólido (`FOR UPDATE` + `Decimal` + `operationKey`) y correcciones H-01/H-02/H-04/H-12 ya cubiertas por tests de integración.

Respecto a esta auditoría:

1. **H-03 (Prisma ↔ PostgreSQL):** hay **drift documentable y real**. PostgreSQL tiene CHECK e índices parciales UNIQUE que **no existen en `schema.prisma`**. La BD en vivo coincide con las migraciones SQL; el riesgo es perder esas restricciones en un futuro `prisma migrate` / reset / drift tool, no un fallo actual de runtime.
2. **H-07 (integridad multi-tenant referencial):** las FK actuales son **por `id` simple**. Un bug de aplicación podría enlazar un `customerId`/`productId` de otro negocio. No hay composite FK `(business_id, …)`. La aplicación mitiga con filtros `businessId` y reglas H-02/H-12; la defensa en profundidad en DB **aún no existe**.
3. **Vehicle / FleetVehicle:** doble fuente de verdad. `fleet_vehicles` (asignación abierta) es el ledger; `vehicles.fleet_id` es denormalización usada en casi todas las lecturas. En la BD demo actual **no hay filas drift** (`SELECT` de inconsistencia → 0 filas). Hay caminos de código que pueden desincronizar (early-return de assign, unassign sin lock, seed reentrante).
4. **Arquitectura:** capas presentation/application/domain parciales; **sin `infrastructure/` ni repositorios**. Los use cases inyectan `PrismaService` directamente → incumplen las reglas Cursor actuales. Service Orders **aún no existen** en código; deben nacer con la arquitectura objetivo sin reescribir el monolito entero.
5. **Reglas Cursor:** el contenido de `cursor/rules/*.mdc` es sólido, pero viven en **`cursor/rules/`** (no `.cursor/rules/`) y el repo **no tiene carpeta `.cursor/`**. Además exigen “Prisma solo en Infrastructure” mientras el código actual no lo cumple → riesgo de que agentes intenten big-bang o ignoren las reglas.

**Veredicto:** no hay incidente de datos en la demo actual; sí hay deuda de integridad (H-03/H-07) y un gap arquitectónico que debe cerrarse **antes/durante** Service Orders, de forma incremental.

---

## 2. Estado actual de la arquitectura

### Hechos verificados

| Aspecto | Estado |
| --- | --- |
| Stack | NestJS 12, Prisma 6, PostgreSQL 16, Vitest, Testcontainers, Argon2id, JWT |
| Módulos | `identity`, `customers`, `vehicles`, `fleets`, `products`, `inventory`, `audit` (global), `health` |
| Capas reales | `presentation` + `application` + `domain` (parcial). **Sin** `infrastructure/` |
| Persistencia | `PrismaService` inyectado en use cases / services |
| Cross-module Nest | Solo `ProductsModule` → `InventoryModule`. `AuditModule` global |
| Domain cruzado | `fleets` importa `assertSameCustomerAsFleet` de `vehicles/domain` |
| Transacciones | `$transaction` + `FOR UPDATE` en assign flota, update dueño flota, stock |
| Service Orders / catalog / maintenance | **No implementados** (`docs/INDEX.md`) |
| Reglas Cursor en disco | `cursor/rules/backend-architecture.mdc`, `backend-development.mdc` (`alwaysApply: true`) |

### Estructura típica hoy

```text
modules/<feature>/
  presentation/   controllers, dto, presenters
  application/    *.use-case.ts  ← PrismaService aquí
  domain/         reglas puras (si existen)
  <feature>.module.ts
```

### Problema central (H-05, confirmado)

Application depende de Prisma Client / `PrismaService`. Eso:

- Impide probar use cases sin DB o con doubles limpios.
- Filtra tipos generados hacia application.
- Dificulta transacciones multi-módulo sin filtrar el `TransactionClient` de Prisma.
- Choca con las reglas Cursor §4.2 / §8.

**No es un bug funcional hoy**; es un freno para CompleteServiceOrder.

---

## 3. Hallazgos H-03 — Prisma y PostgreSQL

**Método:** diff `schema.prisma` ↔ SQL de migraciones + consulta en vivo a `pg_constraint` / `pg_indexes` / `information_schema` (2026-11-04).  
**Resultado base:** la BD aplicada **coincide con las migraciones**; el drift relevante es **Prisma schema incompleto** respecto a PostgreSQL.

### H-03-01 — Índices parciales UNIQUE ausentes en Prisma

| | |
| --- | --- |
| **ID** | H-03-01 |
| **Prioridad** | **P1** |
| **Tipo** | Hecho verificado |

| Tabla | Índice PostgreSQL | Definición real | En Prisma |
| --- | --- | --- | --- |
| `customers` | `customers_person_document_unique` | `UNIQUE (business_id, document_type, document_number) WHERE type = 'PERSON'` | No |
| `customers` | `customers_company_nit_unique` | `UNIQUE (business_id, nit) WHERE type = 'COMPANY'` | No |
| `fleet_vehicles` | `fleet_vehicles_open_assignment_unique` | `UNIQUE (vehicle_id) WHERE unassigned_at IS NULL` | No |

| | |
| --- | --- |
| **Riesgo** | Un `prisma migrate diff` / reset desde schema regenerado **omite** estos índices → duplicados de documento/NIT o dos asignaciones abiertas. |
| **Impacto migraciones** | Alto si alguien “recrea” desde schema sin SQL manual. |
| **Corrección recomendada** | Conservar en migraciones SQL. Añadir comentarios `///` en `schema.prisma` + documento `docs/db-constraints.md`. CI: script que falle si faltan estos `indexname` en `pg_indexes`. **No** eliminarlos porque Prisma no los modele. Prisma 6 no expresa `WHERE` en `@@unique` de forma portable. |

### H-03-02 — CHECK constraints ausentes en Prisma

| | |
| --- | --- |
| **ID** | H-03-02 |
| **Prioridad** | **P1** |
| **Tipo** | Hecho verificado (presentes en PG vivo) |

| Tabla | Constraint | Definición real | En Prisma |
| --- | --- | --- | --- |
| `products` | `products_stock_non_negative` | `CHECK (stock >= 0)` | No |
| `products` | `products_min_stock_non_negative` | `CHECK (min_stock >= 0)` | No |
| `inventory_movements` | `inventory_movements_quantity_valid` | ADJUSTMENT ≥ 0; otros `quantity > 0` | No |
| `inventory_movements` | `inventory_movements_stock_after_non_negative` | `CHECK (stock_after >= 0)` | No |
| `vehicles` | `vehicles_mileage_non_negative` | `CHECK (current_mileage >= 0)` | No |
| `vehicle_mileage_logs` | `vehicle_mileage_logs_mileage_non_negative` | `CHECK (mileage >= 0)` | No |

| | |
| --- | --- |
| **Riesgo** | Misma clase que H-03-01: pérdida silenciosa en regeneración. |
| **Corrección** | Mantener SQL; documentar; CI check de `pg_constraint` (`contype = 'c'`). No “bajar” integridad al nivel de Prisma. |

### H-03-03 — Nombres de índices compuestos ≠ naming Prisma por defecto

| | |
| --- | --- |
| **ID** | H-03-03 |
| **Prioridad** | **P3** |
| **Tipo** | Hecho verificado |

Migración init usó nombres `idx_products_business_status`, `idx_inventory_business_date`, etc. Prisma schema declara `@@index([...])` sin `map`, por lo que un diff futuro puede proponer rename.

| **Riesgo** | Ruido en migraciones; no afecta integridad. |
| **Corrección** | Añadir `map: "idx_..."` en schema al alinear, o aceptar nombres actuales y no regenerar a ciegas. |

### H-03-04 — FK / UNIQUE alineados en Prisma vs PG (positivos)

Hecho: las siguientes restricciones **sí** están en ambos lados (nombres pueden diferir levemente):

- PK UUID en todas las tablas listadas.
- `users.email` UNIQUE.
- `products (business_id, sku)` UNIQUE.
- `vehicles (business_id, plate)` UNIQUE.
- `inventory_movements (business_id, operation_key)` UNIQUE.
- `auth_refresh_sessions.token_hash` UNIQUE.
- FK a `businesses` en tablas operativas.
- FK `inventory_movements.product_id` → `products`.
- FK `vehicles.customer_id` / `fleet_id`, `fleets.customer_id`, `fleet_vehicles.*`, mileage logs.

### H-03-05 — FK faltante: `auth_refresh_sessions.active_business_id`

| | |
| --- | --- |
| **ID** | H-03-05 |
| **Prioridad** | **P2** |
| **Tipo** | Hecho verificado |

| Campo | Prisma | PostgreSQL |
| --- | --- | --- |
| `active_business_id` | `String @db.Uuid` **sin** `@relation` | Columna UUID NOT NULL **sin** FK |

| **Riesgo** | Sesión puede apuntar a un `business_id` inexistente (bajo; la app controla emisión). |
| **Corrección** | FK a `businesses(id)` ON DELETE RESTRICT (o SET NULL si se prefiere caducar). No bloquea MVP. Preservar H-04. |

### H-03-06 — Campos opcionales / sin FK que permiten estados inválidos

| | |
| --- | --- |
| **ID** | H-03-06 |
| **Prioridad** | **P2** |
| **Tipo** | Hecho (schema) + inferencia (impacto) |

| Tabla | Campo / patrón | Prisma | Riesgo |
| --- | --- | --- | --- |
| `customers` | `first_name`, `document_*`, `nit`, `legal_name` todos opcionales | Sin CHECK por `type` | PERSON/COMPANY inválidos a nivel DB; app valida (`customer-rules.ts`) |
| `products` | `category_id` opcional | Sin FK / sin tabla categorías | Orphan UUID si se usa |
| `*` | `created_by` / `updated_by` / `actor_user_id` | Sin FK a `users` | Histórico puede quedar huérfano; a menudo intencional |
| `inventory_movements` | `related_entity_type` + `related_entity_id` | Polimórfico | Correcto conceptualmente; sin FK |
| `inventory_movements` | `operation_key` nullable + UNIQUE `(business_id, operation_key)` | Igual en PG | En PostgreSQL **múltiples NULL no chocan** → idempotencia solo si se envía key |

**Recomendación:** no añadir CHECK PERSON/COMPANY ahora (complejo + app ya cubre). Documentar política de `operation_key` obligatorio en EXIT de órdenes.

### H-03-07 — Precisiones Decimal

| | |
| --- | --- |
| **ID** | H-03-07 |
| **Prioridad** | — (OK) |
| **Tipo** | Hecho verificado |

`stock` / cantidades `DECIMAL(14,3)`; `sale_price` `DECIMAL(14,2)`. Alineado schema ↔ SQL ↔ uso con `decimal.js` en `shared/common/decimal.ts`. **No cambiar.**

### H-03-08 — Diferencias schema Prisma vs estructura real

| Diferencia | Veredicto |
| --- | --- |
| Columnas / tipos / NOT NULL / defaults | Coherentes (sample `information_schema`) |
| CHECK + índices parciales | Solo en PG |
| Composite tenant FK | Ni en Prisma ni en PG |
| Datos `fleetId` vs abierta | Drift **0 filas** en BD demo actual |

---

## 4. Hallazgos H-07 — Integridad referencial multi-tenant

### Modelo actual (hecho)

Todas las FK hijas apuntan a `parent(id)` **sin** incluir `business_id`. Ejemplo real:

```text
vehicles.customer_id  →  customers.id     (NO verifica customers.business_id = vehicles.business_id)
inventory_movements.product_id → products.id  (idem)
```

La aplicación filtra por `businessId` en finds/locks. H-02/H-12 refuerzan ownership de flota/vehículo/cliente en use cases.

### Viabilidad de FK compuestas

Patrón estándar PostgreSQL:

```sql
-- Padre
ALTER TABLE customers ADD CONSTRAINT customers_business_id_id_key UNIQUE (business_id, id);
-- Hijo
ALTER TABLE vehicles
  ADD CONSTRAINT vehicles_customer_tenant_fkey
  FOREIGN KEY (business_id, customer_id)
  REFERENCES customers (business_id, id);
```

| Tema | Evaluación |
| --- | --- |
| PK | Se puede conservar `PRIMARY KEY (id)` + `UNIQUE (business_id, id)`. |
| Prisma | Soporta relaciones compuestas si el padre tiene `@@unique([businessId, id])` y el hijo declara `fields: [businessId, customerId], references: [businessId, id]`. |
| Índices | `UNIQUE (business_id, id)` suele reutilizar índice; hijos ya indexan `(business_id, …)`. |
| Datos actuales | Viable si no hay cross-tenant hoy (probable; no auditado con INSERT malicioso). Requiere script de verificación antes de `NOT VALID` → `VALIDATE`. |
| Costo | Migración cuidadosa; regenerar client; ajustar includes Prisma. |

**Inferencia:** el riesgo de cross-tenant por bug de programación es **bajo en caminos HTTP actuales** (guards + filtros), **alto si aparece SQL crudo / seed / job mal escrito**. Composite FK es defensa en profundidad, no sustituye filtros de aplicación.

### Clasificación por relación

| Relación | Clasificación | Motivo |
| --- | --- | --- |
| `vehicles` → `customers` `(businessId, customerId)` | **Crítica** | Núcleo ownership; ya tuvo incidente lógico (H-02) |
| `fleets` → `customers` `(businessId, customerId)` | **Crítica** | Simétrico a H-12 |
| `fleet_vehicles` → `fleets` / `vehicles` con `businessId` | **Crítica** | Ledger de asignación |
| `inventory_movements` → `products` `(businessId, productId)` | **Crítica** | Stock cross-tenant sería grave |
| `vehicle_mileage_logs` → `vehicles` `(businessId, vehicleId)` | **Crítica** | Hoja de vida |
| `vehicles` → `fleets` `(businessId, fleetId)` nullable | **Importante** | Denormalización; coherente con tenant |
| `inventory_movements.reverses_movement_id` + mismo `businessId` | **Importante** | Hoy solo FK a `id`; app filtra |
| `user_business_roles` | **Baja** (ya PK compuesta) | Modelo correcto |
| `audit_logs.actor_user_id`, `created_by`, `updated_by` | **Baja** | Preferible no FK rígida (usuarios globales / retención) |
| `auth_refresh_sessions.active_business_id` | **Importante** (FK simple basta) | Ver H-03-05 |
| `related_entity_*` polimórfico | **Baja** | No FK; validar en application |
| Futuras `service_orders` → customer/vehicle/product | **Crítica** (diseñar desde día 1) | Evitar retrofit |

### Hallazgo formal

| | |
| --- | --- |
| **ID** | H-07-01 |
| **Prioridad** | **P1** (diseño) / implementación puede ser fase post-órdenes con `NOT VALID` |
| **Evidencia** | `pg_constraint` sin composite; schema Prisma sin `@@unique([businessId, id])` en padres |
| **Riesgo** | Inserción programática cross-tenant pasa la FK simple |
| **Solución** | Fase A: UNIQUE `(business_id, id)` en padres críticos. Fase B: FK compuestas en hijos. Empezar por tablas nuevas de Service Orders; backfill en existentes. |
| **Pruebas** | Int: intentar `INSERT` hijo con `business_id` A y `customer_id` de B → debe fallar a nivel DB |

| | |
| --- | --- |
| **ID** | H-07-02 |
| **Prioridad** | **P2** |
| **Evidencia** | `assign-vehicle` early-return / unassign sin `FOR UPDATE` (ver §5); no es cross-tenant pero sí integridad de relación |
| **Nota** | No confundir con H-02/H-12 (ownership cliente); es sincronización denormalizada |

---

## 5. Diagnóstico Vehicle / FleetVehicle

### Hechos verificados

| Pregunta | Respuesta |
| --- | --- |
| ¿`fleetId` es redundante? | **Sí como fuente de verdad**; **no** como proyección de lectura. Es copia denormalizada. |
| ¿Asignación actual o histórica? | Actual (nullable). Histórico = filas en `fleet_vehicles` con `unassigned_at`. |
| ¿Puede desincronizarse? | **Sí** (caminos abajo). |
| ¿Datos inconsistentes ahora? | **No** en BD demo (`drift = []`). |
| ¿Quién usa qué? | List/summary/count/filtro HTTP → `vehicles.fleet_id`. Unique parcial + validación dueño flota → `fleet_vehicles` abierto. |
| Fuente de verdad recomendada | **Ledger:** `fleet_vehicles WHERE unassigned_at IS NULL`. **`vehicles.fleet_id`:** caché mantenida en la misma TX. |

### Escrituras

| Flujo | Sincroniza ambos | Notas |
| --- | --- | --- |
| `CreateVehicle` con flota | Sí | Misma TX |
| `AssignVehicle` | Sí, salvo early-return | Si `vehicle.fleetId === fleetId` retorna **sin** verificar abierta |
| `UnassignVehicle` | Parcial | Cierra abierta; limpia `fleetId` solo si coincide; **sin** `FOR UPDATE` |
| `UpdateFleet` | No toca asignación | Correcto; valida ownership de abiertas |
| `UpdateVehicle` PATCH | No expone `fleetId` | Ownership vía `assertOwnerCompatibleWithFleet` |

### Riesgos (inferencia + evidencia de código)

| Riesgo | Severidad | Evidencia |
| --- | --- | --- |
| Early-return assign no repara ledger | Media | `assign-vehicle.use-case.ts` L43–45 |
| Unassign sin locks vs assign concurrente | Media | `unassign-vehicle.use-case.ts` sin `FOR UPDATE` |
| Lecturas 100% por `fleetId` | Alto *si* hay drift | `list-vehicles`, `get-fleet`, `list-fleets` groupBy |
| Seed reentrante | Baja–media | `upsertVehicle` no realinea `fleetId` |
| Unique parcial solo en SQL | P1 doc | H-03-01 |

### Migración futura (solo diseño; no ejecutar)

1. Query de auditoría periódica (la usada en esta auditoría).
2. Decidir: reconciliar `fleet_id` desde abierta, o viceversa.
3. Opcional: trigger/`GENERATED` no recomendado aún; mejor invariante en Application + test int.
4. Largo plazo: considerar eliminar `vehicles.fleet_id` **solo** si se acepta costo de join en listados (decisión de producto).

**No eliminar ni modificar campos en esta fase** (restricción cumplida).

---

## 6. Arquitectura actual frente a arquitectura objetivo

### Actual (2.5 capas)

```text
Controller → UseCase(PrismaService, AuditService, …) → PostgreSQL
                ↘ domain/*.ts (reglas puras ocasionales)
```

### Objetivo propuesto (ajustado a Nest, sin ceremonia)

No se adopta ciegamente el árbol completo de carpetas vacías. Estructura **mínima efectiva** para módulos nuevos (Service Orders) y, gradualmente, para críticos:

```text
src/modules/service-orders/
  domain/
    entities/                 # opcional; empezar con tipos + invariantes
    services/                 # p.ej. ServiceOrderStateMachine
    errors/                   # o reutilizar AppError codes
  application/
    use-cases/
    ports/                    # SOLO contratos necesarios
      service-order.repository.ts
      unit-of-work.ts         # o TransactionPort
  infrastructure/
    persistence/prisma/
      prisma-service-order.repository.ts
  presentation/
    controllers/
    dto/
  service-orders.module.ts
```

**Ajuste vs propuesta del enunciado:**

- `application/dto` interno ≠ HTTP DTO: preferir `presentation/dto` para HTTP y tipos de input en application.
- No crear `value-objects/` hasta que un concepto lo pida (Money/Quantity ya viven en `shared/common/decimal`).
- No GenericRepository.
- Puertos **solo** donde haya: (a) transacción compartida, (b) límite de módulo, (c) necesidad de test double.

### Responsabilidades

| Capa | Hace | No hace |
| --- | --- | --- |
| **Presentation** | HTTP, DTO class-validator, guards, mapear a input de UC, presenter de respuesta | Reglas de negocio, Prisma, TX, orquestar módulos |
| **Application** | Orquestar UC, abrir TX vía puerto, llamar domain + ports de otros módulos, idempotencia | Importar `@prisma/client` modelos, conocer SQL |
| **Domain** | Invariantes, transiciones de estado, políticas | NestJS, Prisma, HTTP |
| **Infrastructure** | Prisma repos, adaptadores storage/queue | Reglas de negocio |

### Dirección de dependencias

```text
presentation → application → domain
infrastructure → implements application/domain ports
infrastructure ↛ application use cases
domain ↛ prisma | nest | http
```

### Módulos existentes

**Recomendación:** no reescribir customers/vehicles/fleets/products ahora. Introducir ports en **Service Orders** + endurecer el puerto ya implícito de inventario (`InventoryStockService.apply` como Anti-Corruption Layer / Application Service exportado). Evolución “strangler” por módulo nuevo.

---

## 7. Patrones de diseño recomendados

| Patrón | Problema que resuelve | Dónde en KONTI | ¿Ahora? |
| --- | --- | --- | --- |
| **DI (Nest)** | Composición y tests | Todos los modules | Ya |
| **Repository** | Aislar Prisma; filtrar tenant | Service Orders (nuevo); stock ya encapsulado en service | **Sí en SO** |
| **Unit of Work / TX port** | Complete atómico multi-agregado | `CompleteServiceOrder` | **Sí** |
| **Domain Service** | Máquina de estados; ownership | `ServiceOrderStateMachine`; ownership ya en functions | **Sí (estado)** |
| **Adapter** | Inventario sin tocar tablas | Port `InventoryExitPort` → `InventoryStockService` | **Sí** |
| **Strategy** | Reglas maintenance MILEAGE/TIME/WHICHEVER | Módulo maintenance | Al implementar 11 |
| **Factory** | Construir agregados complejos | Create order con items | Solo si el create crece |
| **Specification** | Filtros listado complejos | List orders search | Esperar |
| **GenericRepository** | — | — | **No** |
| **Interface por cada clase** | — | — | **No** |

---

## 8. Propuesta de arquitectura para Service Orders

### Casos de uso

| UC | Notas |
| --- | --- |
| `CreateServiceOrder` | Valida customer/vehicle mismo tenant + ownership; items; audit CREATED; **no** descuenta stock |
| `GetServiceOrder` / `ListServiceOrders` | Read model; filtros status/vehicle/search |
| `UpdateServiceOrder` | Solo no terminales; no complete disfrazado |
| `AddServiceOrderItem` | Durante ejecución; respetar reglas de sugerencias cuando existan |
| `ChangeServiceOrderStatus` | Transiciones no-complete del contrato 06 |
| `CompleteServiceOrder` | **TX atómica** (núcleo) |
| `CancelServiceOrder` | Terminal; sin EXIT |

### Propiedad de reglas

| Regla | Módulo dueño |
| --- | --- |
| Transiciones de estado / closedAt / closedBy | **service-orders** |
| Mileage ≥ current; log `SERVICE_ORDER` | **vehicles** (port `RecordMileagePort`) |
| EXIT stock + operationKey | **inventory** (`InventoryStockService` / port) |
| Upsert schedule | **maintenance** (nuevo; port) |
| Audit append-only | **audit** (`AuditService`) |
| Catálogo service types | **service-catalog** (nuevo; dependencia de lectura) |

### Contratos (ports) mínimos

```text
ServiceOrderRepository          # load aggregate, save, list
TransactionPort / UnitOfWork    # run(fn)
InventoryExitPort               # applyExit({ businessId, productId, qty, related, operationKey, actor, tx })
VehicleMileagePort              # assertAndRecord({ vehicleId, mileage, source, sourceId, tx })
MaintenanceSchedulePort         # upsertFromOrderCompletion(...)
AuditPort                       # ya AuditService; tipar sin Prisma en signature pública
```

Service Orders **no** importa `PrismaService` ni tablas `products` / `inventory_movements`.

### Fallos parciales

Una sola TX SQL. Cualquier `AppError` / CHECK / FK → rollback. No sagas distribuidas en MVP.

### Concurrencia

- `SELECT … FOR UPDATE` de la orden (y vehículo si mileage).
- Stock: reutilizar lock de `InventoryStockService`.
- Optimistic: version en orden opcional (`version Int`) si hay editores concurrentes.

### Idempotencia

- Complete: `operationKey` por ítem producto, p.ej. `so-complete:{orderId}:{productUsageId}`.
- Reintento del mismo complete: si orden ya `COMPLETED` y keys coinciden → 200 idempotente; si keys divergen → 409.
- Unique parcial futuro: a lo sumo un complete efectivo.

### Dependencias circulares

```text
service-orders → inventory (port)
service-orders → vehicles (port)
service-orders → maintenance (port)
service-orders → audit
inventory ↛ service-orders
vehicles ↛ service-orders
```

Si vehicles necesitara “órdenes del vehículo”, usar **read model / query** en service-orders o proyección, no import Nest inverso.

---

## 9. Diagrama de dependencias

```text
                    ┌──────────────┐
                    │ presentation │
                    │  (HTTP SO)   │
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │ application  │
                    │ Complete SO  │
                    └──────┬───────┘
           ┌───────────────┼───────────────┬──────────────┐
           ▼               ▼               ▼              ▼
    ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌─────────┐
    │ SO Repo    │  │ Inventory  │  │ Vehicles   │  │ Maint.  │
    │ (infra)    │  │ Exit Port  │  │ Mileage    │  │ Port    │
    └─────┬──────┘  └─────┬──────┘  └─────┬──────┘  └────┬────┘
          │               │               │              │
          ▼               ▼               ▼              ▼
     PostgreSQL     InventoryStock   vehicles infra   maintenance
                    Service (+tx)                     infra
          │               │
          └─────── AuditService (append, same tx) ───┘
```

Módulos Nest sugeridos: `ServiceOrdersModule` importa tokens/ports exportados por `InventoryModule`, `VehiclesModule` (nuevo facade), `MaintenanceModule`, `AuditModule`.

---

## 10. Secuencia de `CompleteServiceOrder`

```text
Actor → Controller.complete(orderId, body)
  → CompleteServiceOrderUseCase.execute(ctx, orderId, input)
    → uow.run(async (tx) => {
         order = soRepo.lockById(tx, ctx.businessId, orderId)   -- FOR UPDATE
         assert transition IN_PROGRESS|OPEN → COMPLETED          -- domain
         assert not already completed (idempotent path)
         vehicleMileage.record(tx, …)                            -- vehicles port
         for usage in consumptions:
            inventoryExit.apply(tx, { type: EXIT, operationKey, related: SO })
         maintenance.upsertFromCompletion(tx, …)                 -- si hay regla
         order.markCompleted(closedBy, now)
         soRepo.save(tx, order)
         audit.record(SERVICE_ORDER_COMPLETED, tx)
       })
  → Presenter → 200
```

Fallo stock / mileage / transición → excepción → rollback → 409/422 según `AppError`.

---

## 11. Riesgos y decisiones pendientes

### Riesgos

| ID | Riesgo | Mitigación |
| --- | --- | --- |
| R-01 | Agentes ignoran reglas por path `cursor/rules` | Mover/copiar a `.cursor/rules/` |
| R-02 | Big-bang Hexagonal en módulos estables | Política “solo módulos nuevos + borders” |
| R-03 | Pérdida de CHECK/partial en migrate | CI constraint check (H-03) |
| R-04 | Complete sin port de inventario | Prohibir Prisma stock en SO |
| R-05 | Drift fleetId bajo carga | Test int unassign∥assign; reconciliación |
| R-06 | Composite FK rompe Prisma includes | Prototipo en una tabla antes del resto |

### Decisiones que requieren aprobación

1. **¿Composite FK ahora o con Service Orders primero?**  
   Recomendado: **diseñar SO con `@@unique([businessId, id])` + FK compuestas desde el día 1**; backfill de tablas existentes en fase siguiente.
2. **¿Eliminar `vehicles.fleet_id` a medio plazo?**  
   Recomendado: **no** en MVP; endurecer sincronización y tests.
3. **¿TX Port abstracto vs pasar `Prisma.TransactionClient` tipado en infra?**  
   Recomendado: puerto `UnitOfWork.run` opaco para application; el client Prisma solo dentro de infra adapters.
4. **¿Maintenance Module mínimo acoplado al complete o stub no-op?**  
   Recomendado: port + implementación stub que no persiste hasta existir tabla; o migrar `maintenance_schedules` en el mismo corte B de órdenes.
5. **¿Reglas Cursor: relajar “Prisma prohibido en UC” para módulos legacy?**  
   Recomendado: sí, cláusula explícita de legado + obligatorio en módulos nuevos.
6. **¿Ubicación canónica de rules?** `.cursor/rules/` vs `cursor/rules/`.

---

## 12. Plan de implementación por fases

| Fase | Contenido | Depende de |
| --- | --- | --- |
| **F0** | Aprobación de decisiones §11 | — |
| **F1 — H-03 documentación + CI** | `docs/db-constraints.md`; script `npm run db:verify-constraints`; comentarios en schema | F0 |
| **F2 — Rules Cursor** | Mover a `.cursor/rules/`; addendum legado vs greenfield; Vitest (no Jest); AppLogger (no Pino) | F0 — **hecho** (`docs/audits/architecture-rules-audit.md`) |
| **F3 — Hardening fleet sync (opcional P2)** | Unassign con locks; assign repara ledger; test drift | F0 |
| **F4 — Schema Service Orders + catalog (+ maintenance si se incluye)** | Migraciones con UNIQUE `(business_id,id)` + FK compuestas en tablas nuevas | F1 |
| **F5 — Módulo SO con arquitectura objetivo** | Ports, UC, Complete atómico, tests int | F4, InventoryStockService estable |
| **F6 — H-07 backfill** | UNIQUE+FK compuestas en customers/vehicles/fleets/products/movements | F5 estable |
| **F7 — Strangler selectivo** | Extraer repos en inventory/vehicles solo si duele el mantenimiento | F6 |

**Orden recomendado de correcciones:** F1 → F2 → F4/F5 (núcleo producto) → F3 según dolor → F6.

---

## 13. Archivos que deberían modificarse en cada fase

> Solo lista prevista; **no modificados en esta auditoría**.

### F1
- `docs/db-constraints.md` (nuevo)
- `package.json` (script verify)
- `scripts/verify-db-constraints.ts` (nuevo)
- `prisma/schema.prisma` (solo comentarios `///`)

### F2
- `.cursor/rules/backend-architecture.mdc` / `backend-development.mdc` (nueva ubicación)
- Posible deprecación de `cursor/rules/*` o symlink
- `AGENTS.md` (ruta de rules)

### F3
- `src/modules/fleets/application/unassign-vehicle.use-case.ts`
- `src/modules/fleets/application/assign-vehicle.use-case.ts`
- `test/fleet-*.int.spec.ts` / nuevo test drift

### F4–F5
- `prisma/schema.prisma` + `prisma/migrations/<ts>_service_orders/`
- `src/modules/service-orders/**` (nuevo)
- `src/modules/service-catalog/**` (nuevo)
- `src/modules/maintenance/**` (nuevo o stub)
- `src/modules/inventory/**` (export port tipado; sin romper `InventoryStockService`)
- `src/modules/vehicles/**` (export mileage port)
- `src/app.module.ts`
- `test/service-orders.int.spec.ts`

### F6
- Migración SQL UNIQUE + FK compuestas en tablas existentes
- Ajustes Prisma relations
- Tests int de rechazo cross-tenant a nivel DB

---

## 14. Pruebas necesarias

| Área | Pruebas |
| --- | --- |
| H-03 CI | Assert existencia de 3 índices parciales + 6 CHECK |
| H-07 | INSERT cross-tenant debe fallar tras F6; antes: tests de app que ya existen |
| Fleet drift | Concurrencia unassign/assign; query drift = 0 post-ops |
| Complete SO | Happy path atómico; stock insuficiente rollback; double complete idempotente; tenant isolation; mileage inválido; orden terminal no editable |
| Regresión | Mantener `auth-tenancy`, `auth-sessions`, `vehicle-fleet-integrity`, `fleet-owner-integrity`, `inventory` int |

---

## 15. Criterios de aceptación

### Esta auditoría
- [x] H-03 contrastado con PG vivo
- [x] H-07 clasificado sin constraints indiscriminados
- [x] Vehicle/FleetVehicle diagnosticado sin mutar datos
- [x] Arquitectura SO diseñada sin implementar
- [x] Reglas Cursor evaluadas
- [x] Sin cambios de código de producto / migraciones de esquema de negocio

### Futuras implementaciones (definición de “listo”)
- Constraints SQL documentados y verificados en CI
- CompleteServiceOrder en una TX; stock solo vía Inventory port
- Application/Domain de SO sin imports de Prisma
- FK compuestas en tablas nuevas de SO
- Tests int de complete + idempotencia + tenancy en verde
- H-01/H-02/H-04/H-12 siguen verdes

---

## Apéndice A — Matriz consolidada de hallazgos nuevos

| ID | P | Tema | Estado |
| --- | --- | --- | --- |
| H-03-01 | P1 | Índices parciales fuera de Prisma | Confirmado PG |
| H-03-02 | P1 | CHECK fuera de Prisma | Confirmado PG |
| H-03-03 | P3 | Naming índices | Confirmado |
| H-03-05 | P2 | FK `active_business_id` | Confirmado |
| H-03-06 | P2 | Estados inválidos opcionales / operation_key NULL | Confirmado / inferido |
| H-07-01 | P1 | Sin FK compuestas multi-tenant | Confirmado |
| H-07-02 | P2 | Sync fleetId ↔ abierta | Confirmado código; drift datos = 0 |
| H-05 | P1 | Prisma en Application | Confirmado (preexistente) |
| H-RULES-01 | P1 | Rules fuera de `.cursor/rules/` | **Resuelto** (F2 / `docs/audits/architecture-rules-audit.md`) |
| H-RULES-02 | P2 | Rules desalineadas con Vitest/AppLogger/legado | **Resuelto** (F2 / `docs/audits/architecture-rules-audit.md`) |

### Preservado (no reabrir)

| ID | Nota |
| --- | --- |
| H-01 | AuthGuard activeBusiness + switch-business |
| H-04 | `auth_refresh_sessions` + rotación |
| H-02 | `assertSameCustomerAsFleet` en update vehicle |
| H-12 | Update fleet owner + locks con assign |

---

## Apéndice B — Consultas de verificación usadas

```sql
-- Constraints e índices: ver salida agent-tools 2026-11-04
-- Drift fleet:
SELECT v.id, v.fleet_id, fv.fleet_id AS open_fleet_id
FROM vehicles v
LEFT JOIN fleet_vehicles fv
  ON fv.vehicle_id = v.id AND fv.unassigned_at IS NULL
WHERE (v.fleet_id IS DISTINCT FROM fv.fleet_id)
   OR (v.fleet_id IS NOT NULL AND fv.id IS NULL)
   OR (v.fleet_id IS NULL AND fv.id IS NOT NULL);
-- Resultado auditoría: 0 filas
```

---

**Fin del informe.** Esperar aprobación explícita antes de implementar cualquier fase.
