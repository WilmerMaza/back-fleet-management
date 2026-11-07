# Auditoría de integridad multi-tenant y PostgreSQL (H-07)

| | |
| --- | --- |
| Repo | `back-fleet-management` |
| Fecha | 2026-11-04 |
| Rol | Senior Database Architect (solo lectura) |
| Alcance | Integridad referencial, tenancy por `business_id`, Prisma 6 ↔ PostgreSQL 16 |
| Fuentes | `prisma/schema.prisma`, `prisma/migrations/**`, BD local `konti`, `docs/db-constraints.md`, `docs/AUDITORIA_H03_H07_SERVICE_ORDERS.md` |
| Fuera de alcance | Aplicar migraciones, `ALTER`/`UPDATE`/`DELETE`, modificar `schema.prisma`, tocar las 9 restricciones H-03 |

**Leyenda**

- **Hecho verificado:** constatado en schema, migración SQL o consulta SELECT a PostgreSQL.
- **Riesgo teórico:** posible si falla la aplicación / seed / SQL crudo; no observado en datos actuales.
- **Recomendación:** diseño; requiere aprobación antes de implementar.

---

## 1. Resumen ejecutivo

La BD local demo está **consistente hoy** (0 filas cross-tenant en todas las relaciones operativas auditadas). Las **9 restricciones H-03** (3 índices parciales UNIQUE + 6 CHECK) están presentes y pasan `npm run db:verify-constraints`.

El hallazgo central **H-07 permanece abierto**: todas las FK entre entidades operativas son **simples por `id`**. PostgreSQL garantiza que el padre exista, **no** que comparta el mismo `business_id` que el hijo. Un bug de aplicación, seed o job podría enlazar, por ejemplo, un `customer_id` de “Lubricantes del Norte” a un vehículo de “Taller Demo Fleet” y la FK actual lo aceptaría.

**Veredicto:** no hay incidente de datos; sí hay deuda de defensa en profundidad. Resolver H-07 con fases (`UNIQUE (business_id, id)` → FK compuestas `NOT VALID` → `VALIDATE` → alinear Prisma), **sin reemplazar PK** y **sin tocar** las restricciones H-03.

**Recomendación concreta:** no hacer un “big bang” de FK compuestas antes de Service Orders. Orden seguro:

1. **Ahora (bajo riesgo):** script CI de diagnóstico cross-tenant (solo SELECT) + FK simple faltante en `auth_refresh_sessions.active_business_id`.
2. **Con tablas nuevas (Service Orders / catálogo):** nacer ya con `@@unique([businessId, id])` + FK compuestas.
3. **Después de SO estable (backfill):** aplicar el mismo patrón a las 6 relaciones prioritarias listadas abajo, una oleada por dominio, con gate de 0 inconsistencias.

---

## 2. Inventario de relaciones relevantes

### 2.1 Diagrama lógico (tenancy)

```text
businesses (tenant)
 ├── user_business_roles ── users          [PK compuesta user_id+business_id — OK]
 ├── customers
 │    ├── vehicles ────────── fleets (nullable denorm fleet_id)
 │    │    ├── fleet_vehicles (ledger N:M histórico)
 │    │    └── vehicle_mileage_logs
 │    └── fleets
 │         └── fleet_vehicles
 ├── products
 │    └── inventory_movements ──(self) reverses_movement_id
 ├── audit_logs                   [polimórfico entity_type+entity_id]
 └── (futuro) service_orders / attachments / maintenance

users
 └── auth_refresh_sessions
      ├── user_id → users              [FK sí]
      └── active_business_id           [sin FK — ver P2]
```

### 2.2 Conteos BD local (2026-11-04, solo lectura)

| Tabla | Filas |
| --- | ---: |
| `businesses` | 2 |
| `users` | 4 |
| `user_business_roles` | 5 |
| `customers` | 4 |
| `vehicles` | 6 |
| `fleets` | 1 |
| `fleet_vehicles` | 4 |
| `vehicle_mileage_logs` | 6 |
| `products` | 1 |
| `inventory_movements` | 2 |
| `audit_logs` | 4 |
| `auth_refresh_sessions` | 0 |

Desglose por negocio: Taller Demo Fleet (3 clientes, 5 vehículos, 1 flota, 1 producto, 2 movimientos); Lubricantes del Norte (1 cliente, 1 vehículo, 0 flotas/productos).

### 2.3 FK existentes en PostgreSQL (hecho)

19 FK, **todas** de la forma `FOREIGN KEY (col) REFERENCES parent(id)`. Ninguna incluye `business_id` en el lado hijo→padre de entidad operativa.

Padres con `business_id` **sin** `UNIQUE (business_id, id)`: `customers`, `vehicles`, `fleets`, `products`, `inventory_movements`, `fleet_vehicles`, `vehicle_mileage_logs`, `audit_logs`.  
`composite_unique_business_id_id_exists = 0` (consulta a `pg_constraint`).

### 2.4 Restricciones H-03 (preservar — no modificar)

Verificadas OK en local:

| Tipo | Nombre |
| --- | --- |
| UNIQUE parcial | `customers_person_document_unique` |
| UNIQUE parcial | `customers_company_nit_unique` |
| UNIQUE parcial | `fleet_vehicles_open_assignment_unique` |
| CHECK | `products_stock_non_negative` |
| CHECK | `products_min_stock_non_negative` |
| CHECK | `inventory_movements_quantity_valid` |
| CHECK | `inventory_movements_stock_after_non_negative` |
| CHECK | `vehicles_mileage_non_negative` |
| CHECK | `vehicle_mileage_logs_mileage_non_negative` |

Documentación: [`docs/db-constraints.md`](../db-constraints.md). Verificador: `npm run db:verify-constraints`.

### 2.5 UNIQUE / índices de negocio (alineados schema ↔ PG)

| Objeto | Definición |
| --- | --- |
| `users_email_key` | UNIQUE (`email`) |
| `products_business_id_sku_key` | UNIQUE (`business_id`, `sku`) |
| `vehicles_business_id_plate_key` | UNIQUE (`business_id`, `plate`) |
| `inventory_movements_business_id_operation_key_key` | UNIQUE (`business_id`, `operation_key`) — múltiples `NULL` permitidos en PG |
| `auth_refresh_sessions_token_hash_key` | UNIQUE (`token_hash`) |
| `user_business_roles_pkey` | PK (`user_id`, `business_id`) |

---

## 3. Hallazgos P0–P3

### P0 — ninguno confirmado en datos

No hay filas cross-tenant ni drift `vehicles.fleet_id` ↔ asignación abierta en la BD demo. **No hay P0 de integridad de datos activo.**

---

### P1 — H-07-01: ausencia de FK compuestas multi-tenant

| | |
| --- | --- |
| **ID** | H-07-01 |
| **Prioridad** | **P1** (diseño / defensa en profundidad) |
| **Tipo** | Hecho verificado (schema + `pg_constraint`) + riesgo teórico (inserción maliciosa / bug) |
| **Evidencia** | FK solo por `id`; 0 UNIQUE `(business_id, id)` en padres |
| **Impacto** | Un INSERT/UPDATE que omita el filtro de tenant puede asociar entidades de dos negocios; la app mitiga en HTTP, la BD no |
| **Mitigación app actual** | Guards + `businessId` en finds/locks; ownership H-02/H-12; inventario con `WHERE id AND business_id` |
| **Corrección** | Ver §7 (fases). No aplicar sin diagnóstico previo en cada entorno |

---

### P1 — H-07-02: tablas futuras (Service Orders) sin patrón tenant-safe

| | |
| --- | --- |
| **ID** | H-07-02 |
| **Prioridad** | **P1** (preventivo) |
| **Tipo** | Inferencia / recomendación |
| **Evidencia** | Contratos 05/06/08/11 pendientes; hoy no hay tablas SO |
| **Riesgo** | Repetir FK simples y luego retrofit costoso |
| **Corrección** | Diseñar SO/attachments/maintenance **desde el día 1** con `UNIQUE (business_id, id)` + FK `(business_id, …)` |

---

### P2 — H-07-03: `auth_refresh_sessions.active_business_id` sin FK

| | |
| --- | --- |
| **ID** | H-07-03 (antes H-03-05) |
| **Prioridad** | **P2** |
| **Tipo** | Hecho verificado |
| **Evidencia** | Columna UUID NOT NULL; sola FK de la tabla es `user_id` → `users` |
| **Riesgo** | Sesión apunta a business inexistente (hoy 0 filas en tabla). No es cross-tenant de datos operativos |
| **Corrección** | FK simple → `businesses(id)` `ON DELETE RESTRICT`. Opcional posterior: CHECK/trigger o validación app de membresía (no FK a `user_business_roles` fácilmente porque necesitaría `(user_id, active_business_id)` → PK de membership — **sí viable** como FK compuesta a `user_business_roles`) |

**Nota:** una FK `(user_id, active_business_id) → user_business_roles(user_id, business_id)` es más fuerte que solo FK a `businesses`: impide sesión activa en un negocio donde el usuario no es miembro. Recomendado en la misma oleada P2 o inmediatamente después.

---

### P2 — H-07-04: relaciones polimórficas / sin FK

| | |
| --- | --- |
| **ID** | H-07-04 |
| **Prioridad** | **P2** (gobernanza) / no forzar FK SQL |
| **Tipo** | Hecho (schema) |
| **Campos** | `inventory_movements.related_entity_*`, `audit_logs.entity_*`, `vehicle_mileage_logs.source_id`, `products.category_id` |
| **Estado local** | 2 movimientos con `related_entity_*` (PRODUCT / MANUAL); `category_id` siempre NULL; `source_id` siempre NULL |
| **Riesgo** | UUID huérfano o de otro tenant; no enforceable con FK clásica |
| **Corrección** | Mantener polimorfismo; validar en application; para SO futuras preferir columnas tipadas con FK compuesta cuando el destino es estable |

---

### P2 — H-07-05: denormalización `vehicles.fleet_id` vs ledger

| | |
| --- | --- |
| **ID** | H-07-05 |
| **Prioridad** | **P2** (consistencia operativa, no cross-tenant) |
| **Tipo** | Hecho (modelo) + datos OK ahora |
| **Evidencia** | Drift local = 0; auditorías previas documentan early-return assign / unassign sin `FOR UPDATE` |
| **Corrección** | Fuera del núcleo H-07 FK; hardening de sync (F3 del plan SO). FK compuesta `vehicles → fleets` **sí** entra en H-07 |

---

### P3 — H-07-06: actores / `created_by` / `updated_by` sin FK

| | |
| --- | --- |
| **ID** | H-07-06 |
| **Prioridad** | **P3** |
| **Tipo** | Decisión de diseño (aceptable) |
| **Evidencia** | Sin FK a `users`; 0 huérfanos en demo |
| **Recomendación** | **No** añadir FK rígida: usuarios son globales entre tenants; retención/auditoría puede sobrevivir a baja de usuario. Documentar política |

---

### P3 — H-07-07: CHECK PERSON/COMPANY solo en app

| | |
| --- | --- |
| **ID** | H-07-07 |
| **Prioridad** | **P3** |
| **Tipo** | Riesgo teórico |
| **Evidencia** | Campos tipados nullable; reglas en `customer-rules.ts` |
| **Recomendación** | No añadir CHECK complejo ahora; fuera del camino crítico H-07 |

---

## 4. Tabla de relaciones (FK actual vs propuesta)

Convención propuesta (sin cambiar PK):

```text
Padre:  PRIMARY KEY (id)  +  UNIQUE (business_id, id)
Hijo:   FOREIGN KEY (business_id, <fk_col>) REFERENCES padre (business_id, id)
```

Las FK simples actuales pueden **coexistir** temporalmente con las compuestas; al validar la compuesta, la simple queda redundante (opcional dropear en fase posterior).

| # | Tabla hija | Tabla padre | FK actual | Riesgo multi-tenant | FK compuesta propuesta | Prioridad |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `vehicles` | `customers` | `customer_id` → `customers(id)` | **Alto** — ownership núcleo | `(business_id, customer_id)` → `customers(business_id, id)` | Crítica |
| 2 | `fleets` | `customers` | `customer_id` → `customers(id)` | **Alto** | `(business_id, customer_id)` → `customers(business_id, id)` | Crítica |
| 3 | `fleet_vehicles` | `fleets` | `fleet_id` → `fleets(id)` | **Alto** | `(business_id, fleet_id)` → `fleets(business_id, id)` | Crítica |
| 4 | `fleet_vehicles` | `vehicles` | `vehicle_id` → `vehicles(id)` | **Alto** | `(business_id, vehicle_id)` → `vehicles(business_id, id)` | Crítica |
| 5 | `inventory_movements` | `products` | `product_id` → `products(id)` | **Alto** — stock cruzado | `(business_id, product_id)` → `products(business_id, id)` | Crítica |
| 6 | `vehicle_mileage_logs` | `vehicles` | `vehicle_id` → `vehicles(id)` | **Alto** — hoja de vida | `(business_id, vehicle_id)` → `vehicles(business_id, id)` | Crítica |
| 7 | `vehicles` | `fleets` | `fleet_id` → `fleets(id)` (nullable) | Medio | `(business_id, fleet_id)` → `fleets(business_id, id)` | Importante |
| 8 | `inventory_movements` | `inventory_movements` | `reverses_movement_id` → `id` | Medio | `(business_id, reverses_movement_id)` → `(business_id, id)` | Importante |
| 9 | `*` operativas | `businesses` | `business_id` → `businesses(id)` | Bajo (ya existe) | N/A — correcta | — |
| 10 | `user_business_roles` | `users` / `businesses` | PK + FK simples | Bajo | Ya ancla membresía | — |
| 11 | `auth_refresh_sessions` | `businesses` | **ninguna** | Medio (sesión) | FK simple `active_business_id` → `businesses(id)`; idealmente también `(user_id, active_business_id)` → `user_business_roles` | Importante |
| 12 | `audit_logs` | polimórfico | sin FK entidad | Bajo–medio | No FK SQL; filtro app | Baja |
| 13 | Futuro `service_orders` | `customers` / `vehicles` / `products` | — | **Alto** si nacen simples | Compuestas desde día 1 | Crítica (greenfield) |

**No priorizar FK** en: `created_by`, `updated_by`, `actor_user_id`, `recorded_by`, `category_id` (hasta existir tabla categorías), `related_entity_id`, `source_id`.

---

## 5. Consultas SQL de diagnóstico (solo lectura)

Ejecutar en cada entorno **antes** de cualquier `ALTER`. No modifican datos.

```sql
-- A) Cross-tenant: hijos vs padres
SELECT 'vehicles_customer' AS chk, count(*)::int AS bad
FROM vehicles v JOIN customers c ON c.id = v.customer_id
WHERE c.business_id <> v.business_id
UNION ALL
SELECT 'fleets_customer', count(*)::int
FROM fleets f JOIN customers c ON c.id = f.customer_id
WHERE c.business_id <> f.business_id
UNION ALL
SELECT 'fleet_vehicles_fleet', count(*)::int
FROM fleet_vehicles fv JOIN fleets f ON f.id = fv.fleet_id
WHERE f.business_id <> fv.business_id
UNION ALL
SELECT 'fleet_vehicles_vehicle', count(*)::int
FROM fleet_vehicles fv JOIN vehicles v ON v.id = fv.vehicle_id
WHERE v.business_id <> fv.business_id
UNION ALL
SELECT 'mileage_vehicle', count(*)::int
FROM vehicle_mileage_logs m JOIN vehicles v ON v.id = m.vehicle_id
WHERE v.business_id <> m.business_id
UNION ALL
SELECT 'movements_product', count(*)::int
FROM inventory_movements im JOIN products p ON p.id = im.product_id
WHERE p.business_id <> im.business_id
UNION ALL
SELECT 'movements_reversal', count(*)::int
FROM inventory_movements im
JOIN inventory_movements rev ON rev.id = im.reverses_movement_id
WHERE im.reverses_movement_id IS NOT NULL AND rev.business_id <> im.business_id
UNION ALL
SELECT 'vehicles_fleet', count(*)::int
FROM vehicles v JOIN fleets f ON f.id = v.fleet_id
WHERE v.fleet_id IS NOT NULL AND f.business_id <> v.business_id;

-- B) Ownership flota vs cliente (no es cross-tenant, sí inconsistencia de negocio)
SELECT count(*) AS vehicles_fleet_customer_mismatch
FROM vehicles v
JOIN fleets f ON f.id = v.fleet_id
WHERE v.fleet_id IS NOT NULL AND v.customer_id <> f.customer_id;

-- C) Drift denormalizado fleet_id vs asignación abierta
SELECT count(*) AS fleet_open_drift
FROM vehicles v
FULL OUTER JOIN (
  SELECT vehicle_id, fleet_id, business_id
  FROM fleet_vehicles WHERE unassigned_at IS NULL
) o ON o.vehicle_id = v.id
WHERE (v.fleet_id IS DISTINCT FROM o.fleet_id)
   OR (v.id IS NOT NULL AND o.vehicle_id IS NOT NULL AND v.business_id IS DISTINCT FROM o.business_id)
   OR (v.fleet_id IS NOT NULL AND o.vehicle_id IS NULL)
   OR (v.fleet_id IS NULL AND o.vehicle_id IS NOT NULL);

-- D) Auth sessions
SELECT
  (SELECT count(*) FROM auth_refresh_sessions s
   LEFT JOIN businesses b ON b.id = s.active_business_id WHERE b.id IS NULL) AS orphan_business,
  (SELECT count(*) FROM auth_refresh_sessions s
   LEFT JOIN user_business_roles ubr
     ON ubr.user_id = s.user_id AND ubr.business_id = s.active_business_id
   WHERE ubr.user_id IS NULL) AS no_membership;

-- E) ¿Ya existen UNIQUE (business_id, id)?
SELECT conrelid::regclass::text AS tbl, conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE contype = 'u'
  AND connamespace = 'public'::regnamespace
  AND pg_get_constraintdef(oid) ILIKE '%(business_id, id)%';
```

**Consultas que NO ejecutar en esta auditoría** (modificarían estado): cualquier `UPDATE`/`DELETE` de limpieza, `ALTER TABLE … ADD CONSTRAINT` sin gate, `VALIDATE` en horario pico sin plan.

---

## 6. Conteos de inconsistencias (BD local, 2026-11-04)

| Check | Filas malas | Clasificación |
| --- | ---: | --- |
| `vehicles_customer_cross_tenant` | 0 | Hecho |
| `vehicles_fleet_cross_tenant` | 0 | Hecho |
| `fleets_customer_cross_tenant` | 0 | Hecho |
| `fleet_vehicles_fleet_cross_tenant` | 0 | Hecho |
| `fleet_vehicles_vehicle_cross_tenant` | 0 | Hecho |
| `mileage_logs_vehicle_cross_tenant` | 0 | Hecho |
| `inventory_movements_product_cross_tenant` | 0 | Hecho |
| `inventory_reversal_cross_tenant` | 0 | Hecho |
| `vehicles_fleet_customer_mismatch` | 0 | Hecho |
| `fleet_open_vs_vehicles_fleet_id_drift` | 0 | Hecho |
| `auth_sessions_orphan_business` | 0 | Hecho (tabla vacía) |
| `auth_sessions_no_membership` | 0 | Hecho |
| `audit_logs_orphan_actor` | 0 | Hecho |
| `*_created_by` huérfanos | 0 | Hecho |
| `composite_unique_business_id_id_exists` | 0 | Hecho (ausencia del soporte) |
| H-03 verify (9/9) | OK | Hecho |

**Conclusión de datos:** el entorno local está listo *en principio* para añadir UNIQUE/FK; **otros entornos (staging/prod) deben repetir §5** antes de validar constraints. No asumir 0 en prod.

---

## 7. Diseño de migración por etapas (no ejecutar)

### Principios

1. **No** reemplazar `PRIMARY KEY (id)`.
2. **No** tocar las 9 restricciones H-03.
3. Gate obligatorio: todas las queries §5 → `bad = 0` en el entorno destino.
4. Preferir `NOT VALID` + `VALIDATE CONSTRAINT` para no reescribir tablas enteras bajo lock largo.
5. Una oleada = un dominio (clientes/vehículos/flotas **o** inventario), no las 8 FK a la vez en el primer intento.
6. Prisma: `migrate dev --create-only` + SQL revisado a mano; regenerar client solo tras SQL aplicado.

### Fase 0 — Observabilidad (sin cambio de schema)

| Acción | Detalle |
| --- | --- |
| Script | SELECT de §5 empaquetado (p.ej. `npm run db:verify-tenant-fks`) |
| CI / pre-migrate | Fallar si `bad > 0` |
| Doc | Enlace desde `docs/db-constraints.md` o este audit |

### Fase 1 — Soporte UNIQUE en padres (online-friendly)

Orden de padres (por dependencias de hijos):

1. `customers`
2. `products`
3. `fleets`
4. `vehicles`
5. `inventory_movements` (para reversiones)

SQL ilustrativo (por tabla):

```sql
-- Ejemplo: customers
ALTER TABLE customers
  ADD CONSTRAINT customers_business_id_id_key UNIQUE (business_id, id);
```

Notas:

- En PostgreSQL, `UNIQUE (business_id, id)` crea índice único; compatible con PK existente.
- Si el volumen crece: crear índice `UNIQUE …` con `CONCURRENTLY` fuera de transacción de migración Prisma, luego `ALTER … ADD CONSTRAINT … USING INDEX` (avanzado; documentar si se usa).
- Tras cada padre: `npm run db:verify-constraints` (H-03 intacto).

### Fase 2 — FK compuestas `NOT VALID` (oleada crítica 1–6)

Ejemplo:

```sql
ALTER TABLE vehicles
  ADD CONSTRAINT vehicles_customer_tenant_fkey
  FOREIGN KEY (business_id, customer_id)
  REFERENCES customers (business_id, id)
  ON UPDATE CASCADE
  ON DELETE RESTRICT
  NOT VALID;
```

Repetir para filas 1–6 de §4. `NOT VALID` evita scan completo en el `ADD` (solo nuevas filas se chequean).

### Fase 3 — `VALIDATE CONSTRAINT`

```sql
ALTER TABLE vehicles VALIDATE CONSTRAINT vehicles_customer_tenant_fkey;
```

- Requiere `ACCESS SHARE` / share lock más corto que rewrite; planificar ventana baja.
- Si falla: **no** forzar; corregir datos con plan de remediación (fuera de esta auditoría) y reintentar.

### Fase 4 — Oleada importante (7–8 + auth)

- `vehicles → fleets` (nullable: MATCH SIMPLE ignora filas con `fleet_id` NULL — correcto).
- `inventory_movements` self-FK tenant.
- `auth_refresh_sessions.active_business_id` → `businesses`.
- Opcional: `(user_id, active_business_id)` → `user_business_roles`.

### Fase 5 — Alinear Prisma

En padres:

```prisma
@@unique([businessId, id])
```

En hijos, **sustituir** la relación simple por:

```prisma
customer Customer @relation(fields: [businessId, customerId], references: [businessId, id])
```

Mantener FK a `Business` por `businessId` (Prisma permite compartir `businessId` en varias relaciones).

Generar migración con `--create-only` y **eliminar** del SQL generado cualquier `DROP` de H-03 o de las FK compuestas ya creadas. Preferible: schema Prisma actualizado **después** de que el SQL de Fases 1–4 ya esté en el historial, para que el diff sea mínimo.

### Fase 6 — Limpieza opcional

- Dropear FK simples redundantes (`vehicles_customer_id_fkey`, etc.) solo cuando Prisma y tests int ya usan el modelo compuesto.
- No dropear en la misma release que el ADD si se puede evitar.

### Greenfield paralelo (Service Orders)

Independiente del backfill: nuevas tablas nacen en Fase 1+2 del propio módulo (UNIQUE + FK compuesta desde la migración inicial). Evita retrofit.

---

## 8. Riesgos para Prisma

| Riesgo | Severidad | Mitigación |
| --- | --- | --- |
| `prisma migrate diff` propone dropear CHECK/índices parciales H-03 | Alta | Nunca aplicar diff ciego; `verify-constraints` post-migrate; SQL create-only |
| Relación compuesta exige `@@unique` en padre; sin él el client no genera | Alta | Fase 1 antes de cambiar models hijos |
| Dos relaciones sobre el mismo `businessId` (Business + Customer) | Media | Soportado; nombrar relaciones si hay ambigüedad (`@relation("VehicleCustomer")`) |
| `include` / nested writes cambian forma | Media | Tests int de create vehicle, assign fleet, stock exit; prototipo en **una** relación primero (`vehicles→customers`) |
| Prisma intenta recrear FK simple al editar schema | Media | Revisar SQL generado; mapear nombres `map: "…_tenant_fkey"` |
| Self-relation `reverses` con clave compuesta | Media | Prototipo aislado; mantener FK simple temporalmente si el model Prisma se complica |
| Seeds / factories con IDs cruzados | Baja en demo | Seeds actuales coherentes; añadir test negativo que espere fallo P2003 |

**Impacto en consultas de aplicación:** los `where: { id, businessId }` actuales **siguen válidos**. Nested `connect: { id }` puede requerir `connect: { businessId_id: { businessId, id } }` según el unique compuesto — auditar writes en vehicles/fleets/inventory tras Fase 5.

---

## 9. Rollback

| Fase aplicada | Rollback |
| --- | --- |
| Solo UNIQUE `(business_id, id)` | `ALTER TABLE … DROP CONSTRAINT …_business_id_id_key;` (seguro si aún no hay FK que lo referencien) |
| FK `NOT VALID` sin validate | `ALTER TABLE … DROP CONSTRAINT …_tenant_fkey;` inmediato |
| FK ya `VALIDATED` | Mismo `DROP CONSTRAINT`; no borra datos; pierde solo la garantía |
| Prisma client regenerado | Revertir commit de schema + `prisma generate`; redeploy API previa |
| Datos “limpiados” | **Esta auditoría no propone limpiezas**; si en el futuro se corrigen filas malas, el rollback de datos es restore de backup — por eso el gate de 0 filas es obligatorio |

Rollback de migración Prisma: no reescribir historial aplicado en prod; añadir migración inversa explícita (`DROP CONSTRAINT`).

**H-03:** cualquier rollback/forward debe terminar con `npm run db:verify-constraints` en verde.

---

## 10. Pruebas de integración necesarias

### 10.1 Negativas (deben fallar a nivel DB)

1. INSERT `vehicles` con `business_id = A` y `customer_id` de customer en B → violación FK tenant.
2. Idem `fleets.customer_id`, `fleet_vehicles` (fleet o vehicle de otro business), `inventory_movements.product_id`, `vehicle_mileage_logs.vehicle_id`.
3. INSERT movimiento con `reverses_movement_id` de otro business (tras oleada 8).
4. INSERT `auth_refresh_sessions` con `active_business_id` inexistente (tras P2).
5. INSERT sesión con business existente pero **sin** membresía (si se añade FK a `user_business_roles`).

### 10.2 Positivas (happy path intacto)

1. Create vehicle + customer mismo tenant.
2. Assign / unassign fleet (sin drift).
3. Inventory ENTRY/EXIT/ADJUSTMENT + idempotencia `operation_key`.
4. Mileage log manual.
5. Login / refresh / switch-business (H-04 intacto).
6. `npm run db:verify-constraints` + nuevo verificador tenant.

### 10.3 Prisma

1. Create con `connect` al unique compuesto.
2. Nested include `vehicle.customer` / `movement.product` post-cambio.
3. Transacción assign flota (`FOR UPDATE`) sin P2003 falso positivo.

---

## 11. Compatibilidad con migraciones actuales

| Migración | Contenido relevante | Compatibilidad H-07 |
| --- | --- | --- |
| `20261103000000_init` | products, movements, audit, memberships + CHECK stock | FK simples; CHECK H-03 a preservar |
| `20261103010000_customers_vehicles_fleets` | customers/fleets/vehicles/mileage/fleet_vehicles + parciales + CHECK km | FK simples; índices parciales a preservar |
| `20261104020000_auth_refresh_sessions` | refresh sessions | Sin FK `active_business_id` |

Añadir **nuevas** migraciones forward-only. No editar SQL histórico ya aplicado (rompería checksums y Testcontainers).

---

## 12. Recomendación concreta para cerrar H-07 sin riesgo de datos

### Decisión

**Adoptar FK compuestas con `@@unique([businessId, id])`, en fases, con gate de datos = 0.**  
No big-bang. No cambiar PK. No tocar H-03.

### Orden de ejecución recomendado

```text
F0  Script SELECT cross-tenant en CI          ← inmediato, cero riesgo
F0b FK auth active_business_id (+ opcional membership)  ← P2 bajo riesgo
F1  UNIQUE (business_id, id) en padres        ← tras F0 verde en cada env
F2  FK tenant NOT VALID (relaciones 1–6)      ← mismo gate
F3  VALIDATE CONSTRAINT                       ← ventana controlada
F4  Relaciones 7–8                            ← segunda oleada
F5  Alinear schema.prisma + tests             ← después de SQL estable
── en paralelo ──
SO  Tablas nuevas ya con patrón compuesto     ← no esperar al backfill completo
```

### Criterio de “hecho” para H-07

1. Las 6 FK críticas (§4 filas 1–6) existen y están `VALID` en PG.
2. Prisma modela las mismas relaciones compuestas.
3. Tests int negativos demuestran rechazo cross-tenant.
4. `db:verify-constraints` (H-03) sigue en verde.
5. Diagnóstico §5 → 0 en local, Testcontainers y staging.

### Qué no hacer

- No asumir que local limpio ⇒ prod limpio.
- No `VALIDATE` sin haber corrido §5.
- No squash de migraciones que elimine SQL de H-03.
- No FK rígidas a campos polimórficos ni a `created_by` en esta iniciativa.

---

## 13. Referencias

- [`docs/db-constraints.md`](../db-constraints.md) — H-03
- [`docs/AUDITORIA_H03_H07_SERVICE_ORDERS.md`](../AUDITORIA_H03_H07_SERVICE_ORDERS.md) — origen H-07
- [`docs/audits/architecture-rules-audit.md`](./architecture-rules-audit.md) — reglas Cursor
- [`docs/api-contracts/00-multitenancy.md`](../api-contracts/00-multitenancy.md)
- `scripts/verify-db-constraints.ts` — verificador 9 restricciones

---

*Fin del informe. Solo lectura; ninguna migración ni cambio de datos fue aplicado.*
