# Auditoría de concurrencia y consistencia operativa — KONTI API

| | |
| --- | --- |
| Repo | `back-fleet-management` |
| Agente | AGENTE 3 — Concurrencia y consistencia operativa |
| Fecha | 2026-11-04 |
| Alcance | Solo lectura (sin correcciones, sin cambios a `InventoryStockService`, sin triggers, sin eliminar `vehicles.fleet_id`, sin implementar Service Orders) |
| Stack | NestJS 12 · PostgreSQL 16 · Prisma 6 · Vitest + Testcontainers |
| Fuentes | `src/modules/{inventory,fleets,vehicles,customers,products,audit,identity}/**`, `prisma/schema.prisma`, `prisma/seed.ts`, `docs/db-constraints.md`, `docs/api-contracts/06-service-orders.md`, tests `test/*.int.spec.ts`, auditorías previas H-03/H-07 |

**Leyenda de evidencia**

| Etiqueta | Significado |
| --- | --- |
| **Confirmado** | Reproducible por lectura de código (y/o ya cubierto por test int). Dos caminos concurrentes pueden dejar estado contradictorio o respuesta incorrecta. |
| **Riesgo potencial** | Condición plausible; no hay prueba int que la demuestre hoy, o depende de timing/estado previo (p. ej. drift ya existente). |
| **Controlado** | Mecanismo actual (lock, unique, CHECK, TX) mitiga el fallo bajo el diseño actual. |

**Fuera de alcance de esta auditoría:** reescritura de inventario, diseño de triggers, eliminación de `vehicles.fleet_id`, implementación de órdenes.

---

## 1. Resumen ejecutivo

El núcleo de **inventario** es el área más madura en concurrencia: `FOR UPDATE` sobre `products`, `Decimal`, `CHECK (stock >= 0)`, `operationKey` único por negocio y auditoría en la misma transacción. Los tests int ya cubren salidas concurrentes e idempotencia secuencial.

El área más frágil es la **doble representación flota↔vehículo** (`fleet_vehicles` abierta vs `vehicles.fleet_id`):

1. **Confirmado (código):** `UnassignVehicleUseCase` no toma `FOR UPDATE` sobre el vehículo; puede anular `fleet_id` después de que un `Assign` concurrente lo haya puesto en otra flota → ledger abierto vs proyección `NULL`.
2. **Confirmado (código):** `AssignVehicleUseCase` hace early-return si `vehicle.fleetId === fleetId` **sin** verificar ni reparar la asignación abierta.
3. **Confirmado (código):** `CreateVehicle` con `fleetId` valida el dueño de la flota **fuera** de la TX y **sin** bloquear la flota → carrera con `UpdateFleet` (cambio de propietario) puede violar H-02/H-12.
4. **Confirmado (código):** re-seed (`upsertVehicle` + `assignIfMissing`) no realinea `vehicles.fleet_id` si ya existe el vehículo.
5. **Confirmado (código):** kilometraje en `UpdateVehicle` valida contra una lectura **pre-TX** y, si no hay cambio de dueño, **no** bloquea la fila → lost update y logs inconsistentes.

Inventario no permite stock negativo bajo el camino feliz (app + CHECK). Quedan gaps de **idempotencia concurrente** (`operationKey` duplicado en paralelo → posible `P2002` crudo) y de **entradas/ajustes manuales sin clave**.

No hay Service Orders en código; el contrato 06 exige una TX atómica multi-recurso. Sin orden de locks e `operationKey` por línea, el diseño futuro heredará deadlocks y dobles descuentos.

**Veredicto:** no hay incidente de stock negativo demostrado en el camino actual; sí hay **carreras confirmadas en flotas/vehículos/km** que pueden dejar estados contradictorios visibles en listados. Prioridad de remediación: unassign+locks → assign reparador → create-with-fleet bajo lock de flota → km con `FOR UPDATE` → hardening idempotencia inventario → diseño de complete order.

---

## 2. Hallazgos P0–P3

### P0 — Ninguno en runtime de inventario bajo carga cubierta

No se clasifica P0 de stock negativo ni de doble descuento con `operationKey` distintas: `FOR UPDATE` + `nextStock` + CHECK serializan EXIT. Los hallazgos más graves de consistencia operativa están en flotas/proyección (P1).

---

### OC-01 — Unassign sin `FOR UPDATE` puede borrar `fleet_id` de un assign concurrente

| | |
| --- | --- |
| **ID** | OC-01 |
| **Prioridad** | **P1** |
| **Evidencia** | **Confirmado (código)** |
| **Archivos** | `unassign-vehicle.use-case.ts`, contraste con `assign-vehicle.use-case.ts` |

**Orden real de locks**

| Caso de uso | Locks |
| --- | --- |
| Assign | `fleets FOR UPDATE` → `vehicles FOR UPDATE` → escribe ledger + proyección |
| Unassign | *ninguno* → `updateMany` ledger → `findFirst` vehículo → posible `UPDATE fleet_id = null` |

**Carrera (TOCTOU)**

1. Estado: vehículo V en flota F1 (abierta + `fleet_id = F1`).
2. **A (Unassign F1):** cierra fila abierta F1; lee `vehicle.fleetId === F1` (aún true).
3. **B (Assign F2):** toma locks, cierra abiertas, crea abierta F2, `fleet_id = F2`, commit.
4. **A:** ejecuta `UPDATE vehicles SET fleet_id = null` basándose en la comprobación previa.
5. **Resultado incorrecto:** `fleet_vehicles` abierta en F2 y `vehicles.fleet_id IS NULL`.
6. **Esperado:** proyección = F2; Unassign F1 no toca proyección si ya no corresponde a F1 *al escribir*.
7. **Mecanismo:** `SELECT … FROM vehicles … FOR UPDATE` (y preferible flota) en Unassign **antes** de mutar; re-leer `fleet_id` bajo el mismo lock; mismo orden que Assign (`fleet` → `vehicle`) para evitar deadlocks.

**Impacto:** listados/`GET` flota/filtros por `fleetId` ocultan el vehículo aunque el ledger diga asignado.

---

### OC-02 — Assign early-return no verifica ni repara asignación abierta

| | |
| --- | --- |
| **ID** | OC-02 |
| **Prioridad** | **P1** |
| **Evidencia** | **Confirmado (código)**; drift en datos demo = 0 (auditoría H-03/H-07) |
| **Archivo** | `assign-vehicle.use-case.ts` L43–45 |

Si `vehicle.fleetId === fleetId`, la TX retorna sin:

- comprobar `fleet_vehicles` con `unassigned_at IS NULL`;
- recrear la abierta si falta;
- emitir auditoría.

**Escenarios**

| Estado previo | Efecto del early-return |
| --- | --- |
| Proyección = F y abierta = F | OK (no-op) |
| Proyección = F y **sin** abierta (drift por OC-01/seed) | **No repara**; lecturas OK, ledger roto |
| Proyección = F y abierta cerrada manualmente | Igual: no repara |

**Esperado:** bajo locks, reconciliar proyección ↔ abierta (fuente de verdad = abierta; o política explícita de reparación).

---

### OC-03 — CreateVehicle con flota vs UpdateFleet (cambio de dueño)

| | |
| --- | --- |
| **ID** | OC-03 |
| **Prioridad** | **P1** |
| **Evidencia** | **Confirmado (código)** — viola invariante H-02/H-12 |
| **Archivos** | `create-vehicle.use-case.ts`, `update-fleet.use-case.ts` |

Create valida `assertSameCustomerAsFleet` **antes** de la TX y **sin** `FOR UPDATE` en `fleets`. UpdateFleet sí bloquea la flota y valida solo asignaciones **ya abiertas**.

**Carrera**

1. Flota F dueño Company A; CreateVehicle(customer A, fleetId F) pasa validación.
2. UpdateFleet(F → Company B) bloquea F, no hay abiertas, commit.
3. Create TX: inserta vehículo customer A + `fleet_id = F` + abierta en `fleet_vehicles`.
4. **Resultado incorrecto:** abierta con `vehicle.customer_id ≠ fleet.customer_id`.
5. **Esperado:** 409 `FLEET_VEHICLE_MISMATCH` o Create falla al revalidar bajo lock.
6. **Mecanismo:** en Create, `SELECT fleets … FOR UPDATE` dentro de la TX y re-assert de dueño antes de insertar (mismo orden: flota → vehículo nuevo).

---

### OC-04 — Kilometraje: lectura stale + ausencia de lock en updates no-owner

| | |
| --- | --- |
| **ID** | OC-04 |
| **Prioridad** | **P1** |
| **Evidencia** | **Confirmado (código)** |
| **Archivo** | `update-vehicle.use-case.ts` |

- `current` se lee **fuera** de la TX.
- `FOR UPDATE` solo si `customerChanging`.
- `assertMileageChange` usa el valor stale; dos PATCH concurrentes pueden ambos “subir” desde el mismo basen y dejar **lost update** + **dos** `vehicle_mileage_logs` con valores no monótonos respecto al `current_mileage` final.

**Relevante para** complete de orden (contrato 06: `mileage >= vehicle.currentMileage` atómico).

---

### OC-05 — Seed reentrante no realinea proyección

| | |
| --- | --- |
| **ID** | OC-05 |
| **Prioridad** | **P2** |
| **Evidencia** | **Confirmado (código)** |
| **Archivo** | `prisma/seed.ts` (`upsertVehicle`, `assignIfMissing`) |

- `upsertVehicle`: si el id existe, **return** sin actualizar `fleetId`.
- `assignIfMissing`: si hay abierta, return; si no, crea abierta **sin** `UPDATE vehicles.fleet_id`.

Tras un unassign manual (o drift OC-01), re-ejecutar seed puede dejar abierta sin proyección (o proyección vieja sin abierta si alguien solo tocó `fleet_id`).

---

### OC-06 — Idempotencia `operationKey`: carrera concurrente vs unique

| | |
| --- | --- |
| **ID** | OC-06 |
| **Prioridad** | **P2** |
| **Evidencia** | **Confirmado (código)**; test int cubre solo reintento **secuencial** |
| **Archivo** | `inventory-stock.service.ts` |

Flujo: `findUnique(operationKey)` → si null → `FOR UPDATE` producto → create.

Dos requests **paralelos** con la misma clave y mismo payload:

1. Ambos ven `existing = null`.
2. Se serializan en el lock de producto.
3. El segundo `create` choca con `@@unique([businessId, operationKey])` → `P2002` **no** mapeado a respuesta idempotente.
4. Stock queda correcto (una sola vez), pero el cliente puede ver 500 en lugar del movimiento existente.

Reintento **tras timeout** (secuencial): `findUnique` devuelve existente → **Controlado** (test `inventory.int.spec.ts`).

Payload distinto misma clave → `Errors.operationConflict()` — **Controlado**.

---

### OC-07 — ENTRY/ADJUSTMENT HTTP sin `operationKey`

| | |
| --- | --- |
| **ID** | OC-07 |
| **Prioridad** | **P2** |
| **Evidencia** | **Confirmado (código / diseño)** |
| **Archivo** | `inventory.controller.ts` |

Doble submit / retry de red en entrada o ajuste manual crea **dos** movimientos y altera stock dos veces. No es bug del stock service; es ausencia de idempotencia en API pública.

---

### OC-08 — Unassign siempre audita (incluso no-op)

| | |
| --- | --- |
| **ID** | OC-08 |
| **Prioridad** | **P3** |
| **Evidencia** | **Confirmado (código)** |

Si no había asignación abierta y `fleet_id` ya era distinto, igual se escribe `FLEET_VEHICLE_UNASSIGNED`. No corrompe datos; ensucia auditoría y complica idempotencia operativa.

---

### OC-09 — Lecturas 100 % ancladas a `vehicles.fleet_id`

| | |
| --- | --- |
| **ID** | OC-09 |
| **Prioridad** | **P2** (impacto alto **si** hay drift) |
| **Evidencia** | **Confirmado (código)**; datos demo sin drift hoy |

`list-vehicles`, `get-fleet`, `list-fleets` (groupBy), `get-fleet-summary` usan proyección, no la abierta. Cualquier OC-01/OC-05 se vuelve inconsistencia de producto visible.

---

### OC-10 — `products.version` se incrementa pero no se usa (OCC)

| | |
| --- | --- |
| **ID** | OC-10 |
| **Prioridad** | **P3** |
| **Evidencia** | **Confirmado** |

El incremento es informativo; la serialización real es `FOR UPDATE`. No es fallo; no sustituye locks en complete multi-producto.

---

### OC-11 — Diseño futuro Complete Service Order (aún no implementado)

| | |
| --- | --- |
| **ID** | OC-11 |
| **Prioridad** | **P1 (diseño)** — no es bug actual |
| **Evidencia** | Contrato `06-service-orders.md` + ausencia de módulo |

Complete debe ser **una** TX: transición estado, km+log, N× EXIT stock, maintenance, audit. Riesgos si se implementa mal:

| Riesgo | Mitigación recomendada |
| --- | --- |
| Doble complete | `operationKey` por orden (`order:{id}:complete`) + `FOR UPDATE` de la orden |
| Doble EXIT por línea | `operationKey` por línea (`order:{id}:exit:{productId}`) vía `InventoryStockService.apply(..., tx)` |
| Stock parcial | Todo en la misma TX; no commits intermedios |
| Deadlock multi-producto | Ordenar `productId` ASC antes de `FOR UPDATE` |
| Deadlock orden↔vehículo↔flota | Orden global de locks documentado (ver §4) |
| Km vs PATCH concurrente | `FOR UPDATE` vehículo; revalidar `mileage >= current` bajo lock |
| Audit huérfana / perdida | `audit.record(..., tx)` obligatorio dentro de la TX |

**No implementar aquí** — solo requisitos de consistencia.

---

### Controles que sí funcionan (referencia)

| Área | Mecanismo | Estado |
| --- | --- | --- |
| EXIT concurrentes distintas keys | `FOR UPDATE` + insufficient stock | **Controlado** (test int) |
| Stock ≥ 0 | App + `products_stock_non_negative` | **Controlado** |
| Una abierta por vehículo | Unique parcial SQL | **Controlado** (si migraciones intactas) |
| Assign ∥ UpdateFleet owner | Ambos lockean flota; test H-12 | **Controlado** para ese par |
| Audit en mutaciones actuales | `record(..., tx)` dentro de `$transaction` | **Controlado** (no se pierde si rollback) |
| Refresh token concurrente | `updateMany` condicional + revoke family | **Controlado** (test int) |

---

## 3. Matriz de operaciones críticas

| Operación | TX | Locks (orden real) | Idempotencia | Escribe audit en TX | Riesgo residual |
| --- | --- | --- | --- | --- | --- |
| Inventory ENTRY/EXIT/ADJ/RETURN | Sí (`apply` o TX padre) | `products FOR UPDATE` | `operationKey` opcional | Sí | OC-06, OC-07 |
| CreateProduct + stock inicial | Sí | Producto nuevo → apply (mismo tx) | Key `product:{id}:initial-entry` | Sí (+ movimiento) | Bajo |
| AssignVehicle | Sí | `fleets` → `vehicles` | Early-return parcial (OC-02) | Solo si muta | OC-01/02 |
| UnassignVehicle | Sí | **Ninguno** | No (audit siempre) | Sí siempre | **OC-01**, OC-08 |
| UpdateFleet (owner) | Sí | `fleets FOR UPDATE` | N/A | Sí | OC-03 con Create |
| CreateVehicle (+ fleet) | Sí | Ninguno en flota | Placa unique | Sí | **OC-03** |
| UpdateVehicle owner | Sí | `vehicles FOR UPDATE` si cambia dueño | N/A | Sí | Bajo vs Assign (re-assert) |
| UpdateVehicle mileage | Sí | **Sin** lock si no cambia dueño | No | Sí | **OC-04** |
| UpdateCustomer | Sí | Ninguno explícito | N/A | Sí | Lost update campos; no rompe flota directamente |
| Refresh session | Sí | Optimistic claim `updateMany` | Rotación one-shot | No (auth) | Controlado |
| Complete order (futuro) | Debe | Orden → vehículo → products ordenados | Keys por complete/línea | Debe | OC-11 |

---

## 4. Riesgos de concurrencia

### 4.1 Orden de bloqueos actual

```text
Inventario:     products(id) FOR UPDATE
Assign:         fleets(id) → vehicles(id)
UpdateFleet:    fleets(id)
UpdateVehicle*: vehicles(id)          (*solo si cambia customerId)
Unassign:       (sin locks de fila)
CreateVehicle:  (sin locks de flota)
```

**Deadlock hoy:** bajo el grafo actual, Assign y UpdateFleet comparten prefijo `fleets` → bajo riesgo entre sí. Unassign no participa en el grafo de locks → **no deadlockeá**, pero **sí corrompe proyección** (OC-01).

**Deadlock futuro (complete):** si Complete hace `vehicle → productA → productB` y otro flujo hace `productB → vehicle`, deadlock. Convención propuesta:

```text
1. service_orders(id)
2. vehicles(id)
3. fleets(id)           — solo si el flujo toca flota
4. products(id) ASC     — siempre ordenados
5. maintenance_schedules / otros satélites
```

### 4.2 Aislamiento

Prisma `$transaction` interactivo usa el default de PostgreSQL (**READ COMMITTED**) salvo configuración explícita. Los `FOR UPDATE` son el mecanismo real de serialización por recurso; no hay `SERIALIZABLE` ni reintentos automáticos ante deadlock (`40P01`).

### 4.3 Tabla de carreras relevantes

| A ∥ B | ¿Estado contradictorio posible? | Clasificación |
| --- | --- | --- |
| Unassign F1 ∥ Assign F2 | Sí — abierta F2 + `fleet_id` null | **Confirmado** OC-01 |
| Assign F (idem) con drift | Sí — no repara | **Confirmado** OC-02 |
| CreateVehicle+F ∥ UpdateFleet owner | Sí — mismatch dueño | **Confirmado** OC-03 |
| UpdateFleet owner ∥ Assign (H-12) | No (locks + test) | **Controlado** |
| PATCH km ∥ PATCH km | Sí — lost update / logs | **Confirmado** OC-04 |
| EXIT k1 ∥ EXIT k2 (stock insuficiente) | Un gana, uno 409 | **Controlado** |
| EXIT same key ∥ same key | Stock OK; posible P2002 | **Confirmado** OC-06 |
| ENTRY manual ∥ ENTRY manual | Doble stock | **Confirmado** OC-07 |
| Complete ∥ Complete (futuro) | Doble km/stock si mal diseñado | **Riesgo potencial** OC-11 |
| Complete ∥ PATCH km (futuro) | Km incoherente sin locks | **Riesgo potencial** |

---

## 5. Problemas de consistencia confirmados

### 5.1 Inventario

| Tema | Estado |
| --- | --- |
| Stock negativo vía EXIT | **No** en camino actual (app + CHECK) |
| Escritura parcial movimiento vs stock | **No** — misma TX |
| Rollback | **Sí** — fallo de audit/create aborta stock |
| Idempotencia secuencial con key | **Sí** |
| Idempotencia concurrente con key | **Parcial** — unique salva stock; UX/error OC-06 |
| Ajuste a negativo | Rechazado en `nextStock` |
| RETURN over-commit concurrente | Mitigado por `FOR UPDATE` del mismo producto al serializar el aggregate |

### 5.2 Flotas / vehículos

| Tema | Estado |
| --- | --- |
| Doble fuente de verdad | **Diseño actual**; ledger = abierta |
| Drift demostrable en código concurrente | **Sí** OC-01 |
| Early-return no repara | **Sí** OC-02 |
| Create+fleet vs cambio dueño | **Sí** OC-03 |
| Seed reentrante | **Sí** OC-05 |
| Drift en BD demo actual | **0 filas** (auditoría previa; no re-consultado aquí como mutación) |

### 5.3 Clientes / vehículos

| Tema | Estado |
| --- | --- |
| Cambio dueño vehículo con flota | Re-assert bajo `FOR UPDATE` — bueno |
| UpdateCustomer concurrente | Lost update de campos; no desync flota por sí solo |
| Km concurrente | **Sí** OC-04 |

### 5.4 Auditoría

| Tema | Estado |
| --- | --- |
| Pérdida si falla después del negocio | **No** en caminos actuales (mismo `tx`) |
| Duplicados por retry sin key | Posibles en ENTRY/ADJ y Unassign no-op |
| Early-return Assign | No escribe audit (aceptable si estado ya OK; malo si drift) |
| Idempotent stock hit | No re-audita — correcto |

---

## 6. Recomendaciones

> Solo diseño; **no implementar** en esta tarea.

### 6.1 Flotas (prioridad)

1. **Unassign:** mismo orden de locks que Assign (`fleets` → `vehicles`); mutar ledger y proyección solo tras re-leer bajo lock; no nullificar `fleet_id` si ya apunta a otra flota.
2. **Assign:** eliminar early-return ciego; reconciliar abierta vs proyección; opcionalmente tratar “ya asignado coherente” como no-op **después** de verificar ledger.
3. **CreateVehicle con fleetId:** `FOR UPDATE` flota + re-assert dueño dentro de la TX.
4. **Seed:** si existe vehículo, alinear `fleet_id` con abierta canónica (o viceversa) en la misma operación de seed.
5. **No** eliminar `vehicles.fleet_id`; no triggers. Opcional: job/query de drift (ya esbozada en H-03/H-07).

### 6.2 Vehículos / km

6. Siempre `FOR UPDATE` del vehículo cuando se muta `currentMileage` (y en complete futuro).
7. Releer `currentMileage` bajo lock antes de `assertMileageChange`.

### 6.3 Inventario (sin reescribir el servicio de forma amplia)

8. En carrera `P2002` por `operationKey`: catch → re-`findUnique` → mismo criterio `sameMovement` / conflict (capa delgada alrededor del create, sin cambiar el modelo de locks).
9. API manual: aceptar `Idempotency-Key` / `operationKey` opcional en ENTRY y ADJUSTMENT.
10. Conservar CHECK e índices parciales (`docs/db-constraints.md`).

### 6.4 Complete order (cuando se construya)

11. Una TX; pasar `tx` a `InventoryStockService.apply`.
12. Keys: `order:{id}:complete` + `order:{id}:exit:{productId}` (o line id).
13. Orden de locks §4.1; productos ordenados.
14. Audit único `SERVICE_ORDER_COMPLETED` en la misma TX.
15. Tests int de concurrencia **antes** de marcar el corte como listo.

### 6.5 Operaciones / plataforma

16. Documentar política de reintento ante deadlock (mapear `P2034`/`40P01` si aparece).
17. Timeout de TX acorde a complete multi-línea (default 5s de Prisma puede ser corto).

---

## 7. Pruebas necesarias (Testcontainers)

Patrón sugerido: mismo harness que `inventory.int.spec.ts` / `fleet-owner-integrity.int.spec.ts` (`PostgreSqlContainer` + `migrate deploy` + seed + `Promise.allSettled` sobre use cases inyectados).

### T-01 — Unassign ∥ Assign (OC-01)

| Campo | Valor |
| --- | --- |
| **Estado inicial** | V asignado a F1 (abierta + `fleet_id=F1`); existe F2 mismo customer |
| **A** | `UnassignVehicleUseCase(F1, V)` |
| **B** | `AssignVehicleUseCase(F2, V)` |
| **Intercalación** | Paralelo `Promise.allSettled` (repetir N veces o barrera artificial si se añade hook de test) |
| **Incorrecto** | Abierta en F2 y `fleet_id IS NULL` (o abierta F2 y `fleet_id=F1`) |
| **Esperado** | Si B gana: abierta F2 + `fleet_id=F2`. Si solo A: sin abierta + `fleet_id` null. Nunca abierta≠proyección |
| **Restricción** | `FOR UPDATE` vehículo en Unassign + write condicional |

### T-02 — Assign no-op con drift (OC-02)

| Campo | Valor |
| --- | --- |
| **Estado inicial** | `vehicles.fleet_id=F`; **sin** fila `unassigned_at IS NULL` (insertar drift a propósito) |
| **A** | `AssignVehicleUseCase(F, V)` |
| **Incorrecto** | Return OK sin crear abierta |
| **Esperado** | Tras execute: exactamente una abierta F y proyección F |
| **Restricción** | Reconciliación bajo locks |

### T-03 — CreateVehicle+fleet ∥ UpdateFleet owner (OC-03)

| Campo | Valor |
| --- | --- |
| **Estado inicial** | Flota F dueño Company A; Company B COMPANY válida |
| **A** | `CreateVehicleUseCase({ customerId: A, fleetId: F, … })` |
| **B** | `UpdateFleetUseCase(F, { customerId: B })` |
| **Incorrecto** | Vehículo A con abierta en F cuyo `customer_id` es B |
| **Esperado** | Una falla con mismatch/conflict **o** ambas OK solo si el vehículo queda alineado al dueño final (preferible: Create revalida y falla) |
| **Restricción** | Lock flota en Create |

### T-04 — PATCH mileage concurrente (OC-04)

| Campo | Valor |
| --- | --- |
| **Estado inicial** | `currentMileage=100` |
| **A** | PATCH `{ currentMileage: 150 }` |
| **B** | PATCH `{ currentMileage: 160 }` |
| **Incorrecto** | `current=150` con log `160` posterior sin ajuste admin, o ambos logs con final no igual al máximo aplicado bajo reglas |
| **Esperado** | Serialización: final ∈ {150,160} coherente con el último commit bajo lock; logs monótonos respecto a la política elegida |
| **Restricción** | `FOR UPDATE` + revalidación |

### T-05 — operationKey paralelo (OC-06)

| Campo | Valor |
| --- | --- |
| **Estado inicial** | Producto stock 10 |
| **A/B** | `stock.apply` EXIT 2 con **misma** `operationKey` en paralelo |
| **Incorrecto** | 500 no recuperable sin dejar stock 8; o stock 6 |
| **Esperado** | Ambos “éxito” idempotente **o** uno éxito y otro 409 mapeado; stock 8; un solo movimiento EXIT |
| **Restricción** | Unique + manejo P2002 → find existing |

### T-06 — Seed reentrante (OC-05)

| Campo | Valor |
| --- | --- |
| **Estado inicial** | Tras seed, unassign V de F (cierra abierta, `fleet_id` null) |
| **A** | Reejecutar `prisma/seed.ts` |
| **Incorrecto** | Abierta recreada y `fleet_id` sigue null |
| **Esperado** | Proyección y abierta alineadas al intent del seed **o** seed no recrea asignación sin proyección |
| **Restricción** | Lógica seed de realineación |

### T-07 — UpdateFleet ∥ Assign (regresión H-12)

Ya existe en `fleet-owner-integrity.int.spec.ts`. Mantener como guardrail.

### T-08 — Complete order (futuro, OC-11)

| Campo | Valor |
| --- | --- |
| **Estado inicial** | Orden IN_PROGRESS; stock justo para una complete |
| **A/B** | `CompleteServiceOrder` paralelo misma orden |
| **Incorrecto** | Dos COMPLETED, stock doble descontado, dos audits, km duplicado |
| **Esperado** | Una complete; segunda idempotente o 409; stock/km/audit una vez |
| **Restricción** | `FOR UPDATE` orden + operationKeys |

### T-09 — Complete ∥ EXIT manual mismo producto (futuro)

Stock inicial límite; complete necesita 5; EXIT manual 5 en paralelo → un 409 insufficient; nunca stock negativo ni orden COMPLETED con EXIT a medias.

---

## 8. Priorización y dependencias

```text
P1  OC-01 Unassign locks + write condicional
 │
 ├─► P1  OC-02 Assign reconciliación (depende de poder confiar en unassign)
 │
 ├─► P1  OC-03 CreateVehicle lock flota (independiente; mismo invariante H-12)
 │
 └─► P1  OC-04 Mileage FOR UPDATE (bloqueante para Service Orders)

P2  OC-06 Manejo P2002 operationKey concurrente
P2  OC-07 Idempotency-Key en ENTRY/ADJ HTTP
P2  OC-05 Seed realign
P2  OC-09 Monitoreo/query drift (ops)

P3  OC-08 Unassign audit no-op
P3  OC-10 Clarificar rol de products.version

Diseño (antes de código B-orders)
    OC-11 Complete: TX única, keys, orden de locks, tests T-08/T-09
```

**Dependencias con otros frentes**

| Frente | Relación |
| --- | --- |
| H-02 / H-12 | Ownership ya validado en Assign/UpdateFleet/UpdateVehicle; OC-03 es el hueco restante en Create |
| H-03 unique parcial `fleet_vehicles_open_assignment_unique` | Evita dos abiertas; **no** evita drift proyección |
| InventoryStockService | **No reescribir**; Complete debe *llamarlo* con `tx` |
| Service Orders | Bloqueado en calidad hasta OC-01/04 + diseño OC-11 |
| Eliminar `fleet_id` | Explicitamente **fuera**; mantener proyección sincronizada |

---

## 9. Apéndice — Fragmentos de evidencia

### Assign early-return

```43:45:src/modules/fleets/application/assign-vehicle.use-case.ts
      if (vehicle.fleetId === fleetId) {
        return;
      }
```

### Unassign sin lock

```14:30:src/modules/fleets/application/unassign-vehicle.use-case.ts
    await this.prisma.$transaction(async (tx) => {
      const fleet = await tx.fleet.findFirst({ where: { id: fleetId, businessId } });
      // ...
      await tx.fleetVehicle.updateMany({ ... });
      const vehicle = await tx.vehicle.findFirst({ where: { id: vehicleId, businessId } });
      if (vehicle?.fleetId === fleetId) {
        await tx.vehicle.update({
          where: { id: vehicleId },
          data: { fleetId: null, updatedBy: actorId },
        });
      }
```

### Inventario — lock + idempotencia (referencia; no modificar en esta auditoría)

```46:73:src/modules/inventory/application/inventory-stock.service.ts
    if (input.operationKey) {
      const existing = await tx.inventoryMovement.findUnique({ ... });
      // ...
    }
    const rows = await tx.$queryRaw<LockedProduct[]>`
      SELECT id, stock::text AS stock
      FROM products
      WHERE id = ${input.productId}::uuid AND business_id = ${input.businessId}::uuid
      FOR UPDATE
    `;
```

### Seed assign sin proyección

```309:318:prisma/seed.ts
async function assignIfMissing(fleetId: string, vehicleId: string, businessId: string) {
  const open = await prisma.fleetVehicle.findFirst({
    where: { vehicleId, unassignedAt: null },
  });
  if (open) {
    return;
  }
  await prisma.fleetVehicle.create({
    data: { businessId, fleetId, vehicleId },
  });
}
```

---

## 10. Conclusión

KONTI tiene un **buen patrón de inventario concurrente** y varios caminos de flota ya endurecidos (Assign/UpdateFleet + test H-12). Los huecos que hoy pueden dejar **estados contradictorios** están en Unassign sin locks, Assign no reparador, CreateVehicle con flota fuera del lock de dueño, km sin serialización y seed reentrante.

Ninguna corrección se aplicó en esta auditoría. El siguiente paso de ingeniería debería ser T-01 → fix OC-01, luego OC-02/OC-03/OC-04, y solo después abrir la implementación de Complete Service Order bajo las reglas de OC-11.
