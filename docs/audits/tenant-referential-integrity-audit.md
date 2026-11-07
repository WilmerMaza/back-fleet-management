# Auditoría H-07 — Integridad referencial multi-tenant

| | |
| --- | --- |
| Repo | `back-fleet-management` |
| Fecha | 2026-11-05 |
| Rol | Arquitecto de bases de datos (solo lectura) |
| Stack | PostgreSQL 16 · Prisma 6 · NestJS 12 |
| Fuentes | `prisma/schema.prisma`, `prisma/migrations/**`, BD local `konti`, `docs/db-constraints.md`, auditorías H-03/H-07 previas, estado post OC-01…04 / auth hardening |
| Fuera de alcance | Cualquier `ALTER`/`UPDATE`/`DELETE`/`DROP`, migraciones nuevas, cambios de código o PK |

**Leyenda de evidencia**

| Etiqueta | Significado |
| --- | --- |
| **Hecho** | Constatado en schema, SQL de migración o `SELECT` a PostgreSQL en esta sesión |
| **Riesgo teórico** | Posible si falla aplicación / seed / SQL crudo; no observado en datos locales |
| **Pendiente** | No verificado en staging/producción (sin acceso en esta auditoría) |

---

## 1. Resumen ejecutivo

La base de datos **no garantiza** hoy que una FK entre entidades operativas respete el mismo `business_id`. Las **19 FK** existentes son todas de la forma `FOREIGN KEY (col) REFERENCES parent(id)`. PostgreSQL asegura existencia del padre, **no** co-tenancy.

En la BD local demo (`konti`, 2026-11-05):

- **0** filas cross-tenant en las 8 relaciones operativas auditadas.
- **0** drift `vehicles.fleet_id` ↔ asignación abierta.
- **0** UNIQUE `(business_id, id)` en padres (soporte necesario para FK compuestas = ausente).
- Las **9** restricciones H-03 (índices parciales + CHECK) pasan `npm run db:verify-constraints`.

**Veredicto:** no hay incidente de datos en local; **H-07 sigue abierto** como deuda de defensa en profundidad. La aplicación (H-01/H-02/H-12, filtros `businessId`, OC) mitiga el riesgo en caminos HTTP; un bug, job o INSERT crudo podría enlazar tenants y la BD lo aceptaría.

**No hay P0 de datos.** El hallazgo principal es **P1 de diseño** (ausencia de FK compuestas). Staging/prod **deben** repetir los diagnósticos §5 antes de cualquier migración.

---

## 2. Inventario de relaciones

### 2.1 Tablas con `business_id` (tenant-scoped)

| Tabla | PK | `business_id` | Notas |
| --- | --- | --- | --- |
| `customers` | `id` | Sí | Índices parciales UNIQUE documento/NIT (H-03) |
| `vehicles` | `id` | Sí | UNIQUE `(business_id, plate)` |
| `fleets` | `id` | Sí | |
| `fleet_vehicles` | `id` | Sí | UNIQUE parcial abierta por `vehicle_id` (H-03) |
| `vehicle_mileage_logs` | `id` | Sí | |
| `products` | `id` | Sí | UNIQUE `(business_id, sku)` |
| `inventory_movements` | `id` | Sí | UNIQUE `(business_id, operation_key)` |
| `audit_logs` | `id` | Sí | Entidad polimórfica |
| `user_business_roles` | `(user_id, business_id)` | Sí | Ya ancla membresía |
| `auth_refresh_sessions` | `id` | **No** (tiene `active_business_id`) | Sesión; no fila operativa tenant |

Sin `business_id`: `businesses`, `users`.

### 2.2 Conteos BD local (SELECT, 2026-11-05)

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

### 2.3 Diagrama lógico

```text
businesses
 ├── user_business_roles ── users
 ├── customers
 │    ├── vehicles ── fleets? (proyección fleet_id)
 │    │    ├── fleet_vehicles
 │    │    └── vehicle_mileage_logs
 │    └── fleets ── fleet_vehicles
 ├── products ── inventory_movements ──(self) reverses_movement_id
 └── audit_logs (polimórfico)

users ── auth_refresh_sessions
           ├── user_id → users          [FK sí]
           └── active_business_id       [sin FK — Hecho]
```

### 2.4 FK reales en PostgreSQL (Hecho)

`fk_total = 19`, `fk_composite_tenant = 0`.

Todas las FK hijo→padre operativo son **simples por `id`**. Las FK a `businesses(id)` por `business_id` son correctas y **no** necesitan convertirse en compuestas.

---

## 3. Matriz de riesgos

| ID | Severidad | Hallazgo | Evidencia |
| --- | --- | --- | --- |
| **H-07-01** | **P1** | Sin FK compuestas multi-tenant en relaciones operativas | Schema + `pg_constraint` + 0 UNIQUE `(business_id, id)` |
| **H-07-02** | **P1** | Tablas futuras (Service Orders / attachments / maintenance) sin patrón tenant-safe | Contratos pendientes; riesgo de repetir FK simples |
| **H-07-03** | **P2** | `auth_refresh_sessions.active_business_id` sin FK | Migración auth; solo FK a `users` |
| **H-07-04** | **P2** | Campos polimórficos / UUID sin FK tipada | Schema (`related_entity_*`, `entity_*`, `source_id`, `category_id`) |
| **H-07-05** | **P2** | Doble representación flota (`fleet_id` vs abierta) — consistencia operativa, no cross-tenant | Modelo; drift local = 0 post OC-01/02 |
| **H-07-06** | **P3** | `created_by` / `updated_by` / `actor_user_id` / `recorded_by` sin FK a `users` | Diseño aceptable (usuarios globales) |
| **H-07-07** | **P3** | Reglas PERSON/COMPANY solo en app | Fuera del núcleo referencial |

**P0:** ninguno en datos locales.

---

## 4. Relaciones que permiten inconsistencias entre negocios

Para cada relación: FK actual **sí** permite hijo y padre con distinto `business_id` si ambos UUIDs existen.

| Origen | Columna FK | Destino | Destino ref | Ambas con `business_id` | FK compuesta hoy | ¿Cross-tenant posible? | Protección alternativa |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `vehicles` | `customer_id` | `customers` | `id` | Sí | No | **Sí** | App: create/update + `assertSameCustomerAsFleet` (H-02) |
| `fleets` | `customer_id` | `customers` | `id` | Sí | No | **Sí** | App: create/update fleet (H-12) |
| `fleet_vehicles` | `fleet_id` | `fleets` | `id` | Sí | No | **Sí** | App: assign/unassign + locks OC |
| `fleet_vehicles` | `vehicle_id` | `vehicles` | `id` | Sí | No | **Sí** | Idem + unique parcial abierta |
| `vehicles` | `fleet_id` | `fleets` | `id` | Sí (nullable) | No | **Sí** | App sync proyección; OC-01/02 |
| `inventory_movements` | `product_id` | `products` | `id` | Sí | No | **Sí** | App: `businessId` en stock service |
| `inventory_movements` | `reverses_movement_id` | `inventory_movements` | `id` | Sí | No | **Sí** | App (poco usado hoy) |
| `vehicle_mileage_logs` | `vehicle_id` | `vehicles` | `id` | Sí | No | **Sí** | App: create/update vehicle bajo tenant |
| `*` operativas | `business_id` | `businesses` | `id` | N/A | N/A | No (ancla tenant) | FK simple correcta |
| `user_business_roles` | `user_id` / `business_id` | `users` / `businesses` | `id` | Parcial | PK ya compuesta | Bajo | PK `(user_id, business_id)` |
| `auth_refresh_sessions` | `active_business_id` | — | — | Columna sin FK | No | Orphan / negocio sin membresía | App: issue/refresh carga membresía |
| `auth_refresh_sessions` | `user_id` | `users` | `id` | No | N/A | N/A | FK Cascade OK |
| `audit_logs` | `entity_id` | polimórfico | — | — | No | UUID de otro tenant | Solo app |
| Actores (`created_by`, etc.) | UUID | `users` | — | — | No | Huérfano / OK histórico | Sin FK a propósito |

### Otras relaciones tenant-scoped a vigilar (futuro)

Cualquier `service_orders → customers|vehicles`, `order_lines → products`, `attachments → entity`, `maintenance_schedules → vehicles` debe nacer con el patrón compuesto (§7). **No convertir** en compuestas: actores de auditoría, polimórficos estables, ni FK a `businesses` ya correctas.

---

## 5. Consultas SQL de diagnóstico (solo lectura)

Ejecutar en **cada** entorno antes de migrar. No modifican datos.

```sql
-- A) Cross-tenant operativo
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

-- B) Ownership flota↔cliente (invariante H-02, no cross-tenant)
SELECT count(*)::int AS vehicles_fleet_customer_mismatch
FROM vehicles v
JOIN fleets f ON f.id = v.fleet_id
WHERE v.fleet_id IS NOT NULL AND v.customer_id <> f.customer_id;

-- C) Drift proyección vs ledger
SELECT count(*)::int AS fleet_open_drift
FROM vehicles v
FULL OUTER JOIN (
  SELECT vehicle_id, fleet_id, business_id
  FROM fleet_vehicles WHERE unassigned_at IS NULL
) o ON o.vehicle_id = v.id
WHERE (v.fleet_id IS DISTINCT FROM o.fleet_id)
   OR (v.id IS NOT NULL AND o.vehicle_id IS NOT NULL AND v.business_id IS DISTINCT FROM o.business_id)
   OR (v.fleet_id IS NOT NULL AND o.vehicle_id IS NULL)
   OR (v.fleet_id IS NULL AND o.vehicle_id IS NOT NULL);

-- D) Auth
SELECT
  (SELECT count(*)::int FROM auth_refresh_sessions s
   LEFT JOIN businesses b ON b.id = s.active_business_id WHERE b.id IS NULL) AS orphan_business,
  (SELECT count(*)::int FROM auth_refresh_sessions s
   LEFT JOIN user_business_roles ubr
     ON ubr.user_id = s.user_id AND ubr.business_id = s.active_business_id
   WHERE ubr.user_id IS NULL) AS no_membership;

-- E) Soporte UNIQUE (business_id, id) — debe ser 0 hoy
SELECT conrelid::regclass::text AS tbl, conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE contype = 'u'
  AND connamespace = 'public'::regnamespace
  AND pg_get_constraintdef(oid) ILIKE '%(business_id, id)%';

-- F) ¿Existen FK compuestas tenant?
SELECT count(*)::int AS fk_composite_tenant
FROM pg_constraint
WHERE contype = 'f'
  AND connamespace = 'public'::regnamespace
  AND pg_get_constraintdef(oid) ILIKE '%FOREIGN KEY (business_id,%';
```

**Prohibido en esta auditoría / pre-gate:** `UPDATE`, `DELETE`, `ALTER`, `VALIDATE` sin plan, `DROP`.

---

## 6. Resultados de validación de datos

### 6.1 BD local `konti` (2026-11-05) — Hecho

| Check | Filas malas |
| --- | ---: |
| `vehicles_customer` | **0** |
| `fleets_customer` | **0** |
| `fleet_vehicles_fleet` | **0** |
| `fleet_vehicles_vehicle` | **0** |
| `mileage_vehicle` | **0** |
| `movements_product` | **0** |
| `movements_reversal` | **0** |
| `vehicles_fleet` | **0** |
| `vehicles_fleet_customer_mismatch` | **0** |
| `fleet_open_drift` | **0** |
| `auth` orphan / no membership | **0** (tabla vacía) |
| `audit_logs` actor huérfano | **0** |
| UNIQUE `(business_id, id)` | **0** objetos |
| FK compuestas tenant | **0** |
| H-03 `db:verify-constraints` | **9/9 OK** |

### 6.2 Staging / producción — Pendiente

Sin acceso en esta sesión. **No** asumir `bad = 0`. Repetir §5 es gate obligatorio antes de Fase 1–3.

---

## 7. Diseño de claves foráneas compuestas recomendado

### 7.1 Patrón (sin cambiar PK)

```text
Padre:  PRIMARY KEY (id)
        + UNIQUE (business_id, id)

Hijo:   FOREIGN KEY (business_id, <fk_col>)
        REFERENCES padre (business_id, id)
        ON UPDATE CASCADE ON DELETE RESTRICT
```

Las FK simples actuales pueden coexistir temporalmente; tras validar la compuesta, dropear la simple es opcional (Fase limpieza).

### 7.2 UNIQUE compuestos faltantes (padres)

| Padre | Constraint propuesto | Obligatorio antes de |
| --- | --- | --- |
| `customers` | `UNIQUE (business_id, id)` | FK vehicles/fleets → customers |
| `products` | `UNIQUE (business_id, id)` | FK movements → products |
| `fleets` | `UNIQUE (business_id, id)` | FK fleet_vehicles/vehicles → fleets |
| `vehicles` | `UNIQUE (business_id, id)` | FK fleet_vehicles/mileage → vehicles |
| `inventory_movements` | `UNIQUE (business_id, id)` | Self-FK `reverses_movement_id` |

`fleet_vehicles`, `vehicle_mileage_logs`, `audit_logs`: UNIQUE `(business_id, id)` solo si algún hijo futuro los referencia por compuesto; no urgente hoy.

### 7.3 FK compuestas a añadir (prioridad)

| # | Hijo | FK compuesta | Prioridad |
| --- | --- | --- | --- |
| 1 | `vehicles` | `(business_id, customer_id) → customers` | Crítica |
| 2 | `fleets` | `(business_id, customer_id) → customers` | Crítica |
| 3 | `fleet_vehicles` | `(business_id, fleet_id) → fleets` | Crítica |
| 4 | `fleet_vehicles` | `(business_id, vehicle_id) → vehicles` | Crítica |
| 5 | `inventory_movements` | `(business_id, product_id) → products` | Crítica |
| 6 | `vehicle_mileage_logs` | `(business_id, vehicle_id) → vehicles` | Crítica |
| 7 | `vehicles` | `(business_id, fleet_id) → fleets` (nullable; MATCH SIMPLE) | Importante |
| 8 | `inventory_movements` | `(business_id, reverses_movement_id) → inventory_movements` | Importante |

### 7.4 Auth (no es el mismo patrón operativo)

| Opción | SQL conceptual | Efecto |
| --- | --- | --- |
| Mínima | `active_business_id → businesses(id)` | Evita UUID de negocio inexistente |
| Fuerte | `(user_id, active_business_id) → user_business_roles(user_id, business_id)` | Impide sesión en negocio sin membresía |

### 7.5 Qué **no** convertir en compuesto

- FK `business_id → businesses(id)` (ya correctas).
- `created_by` / `updated_by` / `actor_user_id` / `recorded_by` → `users`.
- Polimórficos: `related_entity_id`, `audit_logs.entity_id`, `source_id`, `category_id` (hasta tabla tipada).
- PK de `users` / email global.

### 7.6 Prisma 6 — representabilidad

Prisma **sí** soporta relaciones multi-campo compartiendo `businessId`:

```prisma
// Padre
@@unique([businessId, id])

// Hijo
customer Customer @relation(fields: [businessId, customerId], references: [businessId, id])
```

Efectos a vigilar:

1. `prisma migrate diff` / `migrate dev` puede intentar `DROP`/`ADD` agresivo: usar **`--create-only`** y revisar SQL a mano.
2. **No** dejar que un squash regenere el historial omitiendo H-03 (índices parciales / CHECK).
3. Preferible: aplicar UNIQUE+FK en SQL versionado **antes** de alinear `schema.prisma`, para que el diff Prisma sea mínimo.
4. Tests int (H-02/H-12/OC) deben seguir verdes; no cambian contratos HTTP.

---

## 8. Plan de migración (no ejecutar)

### Principios

1. No reemplazar PK `id`.
2. No tocar las 9 restricciones H-03.
3. Gate: §5 → `bad = 0` en el entorno destino.
4. `NOT VALID` + `VALIDATE CONSTRAINT` para minimizar bloqueos de escritura largos.
5. Oleadas por dominio; no big-bang.
6. Compatibilidad Prisma Migrate: SQL en historial + schema alineado después.

### Fase 0 — Observabilidad (sin schema)

- Empaquetar §5 (p. ej. futuro `npm run db:verify-tenant-fks`).
- CI / pre-migrate: fallar si `bad > 0`.
- Correr en staging/prod (pendiente).

### Fase 1 — `UNIQUE (business_id, id)` en padres

Orden: `customers` → `products` → `fleets` → `vehicles` → `inventory_movements`.

```sql
ALTER TABLE customers
  ADD CONSTRAINT customers_business_id_id_key UNIQUE (business_id, id);
```

- Lock: `ShareUpdateExclusive` / creación de índice único; en tablas grandes valorar índice `CONCURRENTLY` + `ADD CONSTRAINT … USING INDEX` (fuera de TX Prisma si hace falta).
- Tras cada padre: `npm run db:verify-constraints`.

### Fase 2 — FK compuestas `NOT VALID` (crítica 1–6)

```sql
ALTER TABLE vehicles
  ADD CONSTRAINT vehicles_customer_tenant_fkey
  FOREIGN KEY (business_id, customer_id)
  REFERENCES customers (business_id, id)
  ON UPDATE CASCADE ON DELETE RESTRICT
  NOT VALID;
```

`NOT VALID`: el `ADD` no reescribe/escanea toda la tabla; filas nuevas sí se validan.

### Fase 3 — `VALIDATE CONSTRAINT`

```sql
ALTER TABLE vehicles VALIDATE CONSTRAINT vehicles_customer_tenant_fkey;
```

- Lock más corto que rewrite completo; planificar ventana de baja carga.
- Si falla: remediar datos (fuera de esta auditoría) y reintentar — **no** forzar.

### Fase 4 — Oleada importante (7–8 + auth)

- `vehicles → fleets` (nullable).
- Self-FK movimientos.
- Auth: FK a `businesses` y/o a `user_business_roles`.

### Fase 5 — Alinear Prisma

- `@@unique([businessId, id])` en padres.
- Relaciones hijas con `fields: [businessId, …]`.
- `migrate dev --create-only`; eliminar del SQL generado cualquier `DROP` de H-03 o FK ya creadas.

### Fase 6 — Limpieza opcional

- Dropear FK simples redundantes cuando Prisma y tests ya usan el modelo compuesto.
- No en la misma release que el primer `ADD` si se puede evitar.

### Greenfield Service Orders

Independiente del backfill: tablas nuevas nacen con UNIQUE + FK compuesta desde la migración inicial (cierra H-07-02 sin retrofit).

### Impacto esperado (volumen actual local)

Con decenas de filas, locks son triviales. En prod con tablas grandes: Fase 1 (índices únicos) es el mayor coste de I/O; Fases 2–3 con `NOT VALID`/`VALIDATE` permiten despliegue sin downtime prolongado si se siguen las ventanas recomendadas.

---

## 9. Riesgos y dependencias

| Riesgo / dependencia | Nota |
| --- | --- |
| Datos cross-tenant ocultos en staging/prod | Gate §5; remediación manual antes de VALIDATE |
| Prisma migrate regenera/squash y pierde H-03 | Documentado en `docs/db-constraints.md`; verificar siempre |
| Coexistencia FK simple + compuesta | Redundante pero seguro durante transición |
| Service Orders antes del backfill | Aceptable **solo** si SO nace con patrón compuesto |
| OC / H-02 / H-12 | No se debilitan; la FK refuerza lo que la app ya valida |
| Auth SEC-02 family check | Independiente; FK auth es defensa adicional (H-07-03) |
| Multi-réplica / locks | `VALIDATE` y UNIQUE en tablas grandes: ventana + monitorización |

---

## 10. Recomendación de implementación priorizada

```text
Hecho (Fase 0)      npm run db:verify-tenant-fks  → scripts/verify-tenant-fks.ts
Hecho (Fase 1)      UNIQUE (business_id, id) en customers/products/fleets/vehicles/inventory_movements
Hecho (Fase 2)      6 FK compuestas NOT VALID (críticas); FK simples conservadas
Hecho (Fase 3)      VALIDATE CONSTRAINT de las 6 FK tenant (convalidated = true)
Hecho (Fase 4)      2 FK restantes NOT VALID (vehicles.fleet_id, reverses_movement_id)
Hecho (Fase 5)      VALIDATE CONSTRAINT de las 2 FK Fase 4 (8/8 tenant validadas)
Siguiente           Revisión: auth FK / limpieza FK simples (no automático)
Fuera de oleada     auth sessions FK; drop FK simples
P2 rápido           H-07-03: FK auth active_business_id (+ opcional membresía)
Con SO greenfield   H-07-02: tablas nuevas con UNIQUE+FK desde día 1
Opcional            Fase 6 limpieza FK simples; no FK en actores/polimórficos
```

### Fase 0 implementada — herramienta de diagnóstico

| | |
| --- | --- |
| Script | [`scripts/verify-tenant-fks.ts`](../../scripts/verify-tenant-fks.ts) |
| Comando | `npm run db:verify-tenant-fks` |
| Modo | **Solo lectura** (SELECT). No INSERT/UPDATE/DELETE/ALTER. |
| Verificaciones | 12 (cross-tenant 1–8, ownership, proyección flota, auth orphan, auth membresía) |
| Salida | PASS / FAIL / ERROR por check, conteo, muestras solo con ids, exit ≠ 0 si falla |
| Tests | `scripts/verify-tenant-fks.spec.ts` + `test/verify-tenant-fks.int.spec.ts` |

**Cómo interpretar**

- `PASS` + count 0: sin inconsistencias para ese check.
- `FAIL` + count N: hay N filas inconsistentes (muestras limitadas, sin PII).
- `ERROR`: no se pudo ejecutar (tabla ausente, SQL inválido, etc.) — no ocultar.
- Exit `0` solo si las 12 están PASS.

**Limitaciones**

- No corrige datos ni crea FK (Fase 0).
- No sustituye H-03 (`npm run db:verify-constraints`).
- Rate/cache de auth y reglas de app no se evalúan aquí.
- Staging/prod deben ejecutarse por separado; local limpio ≠ prod limpio.

### Fase 1 implementada — UNIQUE `(business_id, id)`

| | |
| --- | --- |
| Migración | `prisma/migrations/20261105010000_h07_phase1_business_id_id_unique/` |
| Schema | `@@unique([businessId, id])` en Customer, Product, Fleet, Vehicle, InventoryMovement |
| Constraints | `customers_business_id_id_key`, `products_business_id_id_key`, `fleets_business_id_id_key`, `vehicles_business_id_id_key`, `inventory_movements_business_id_id_key` |
| FK compuestas | **Ninguna** (Fase 2) |
| H-03 | Intactas |

**Impacto de bloqueo (estimado):** tablas locales &lt; 10 filas; `ADD CONSTRAINT UNIQUE` toma `ACCESS EXCLUSIVE` breve. En prod con volumen alto, valorar ventana de baja carga o índice `CONCURRENTLY` + `ADD CONSTRAINT … USING INDEX` en una oleada futura.

### Fase 2 implementada — FK compuestas `NOT VALID`

| | |
| --- | --- |
| Migración | `prisma/migrations/20261105020000_h07_phase2_composite_fks_not_valid/` |
| Prisma | Relaciones hijas con `fields: [businessId, …]` / `references: [businessId, id]` |
| FK tenant | `vehicles_customer_tenant_fkey`, `fleets_customer_tenant_fkey`, `fleet_vehicles_fleet_tenant_fkey`, `fleet_vehicles_vehicle_tenant_fkey`, `inventory_movements_product_tenant_fkey`, `vehicle_mileage_logs_vehicle_tenant_fkey` |
| Estado | `convalidated = false` (`NOT VALID`) — **sin** `VALIDATE` aún |
| FK simples | Conservadas (`*_customer_id_fkey`, etc.) |
| Reglas | `ON UPDATE CASCADE ON DELETE RESTRICT` (igual que las simples) |
| Fuera | `vehicles.fleet_id`, `reverses_movement_id`, auth |

**Nota Prisma:** el schema modela solo la relación compuesta; en PostgreSQL coexisten FK simple + tenant. Un `migrate diff` futuro no debe ejecutarse a ciegas (podría proponer `DROP` de las simples).

### Fase 3 implementada — `VALIDATE CONSTRAINT`

| | |
| --- | --- |
| Migración | `prisma/migrations/20261105030000_h07_phase3_validate_composite_fks/` |
| Acción | Solo `ALTER TABLE … VALIDATE CONSTRAINT …` sobre las 6 FK de Fase 2 |
| Estado | `convalidated = true` en las seis (local tras migrate deploy) |
| Datos | **Sin** INSERT/UPDATE/DELETE |
| FK simples | Conservadas (6/6) |
| UNIQUE Fase 1 | Siguen válidas (5/5) |
| Schema Prisma | Sin cambios (ya modelaba relaciones compuestas) |

**Entornos:** el preflight (`db:verify-tenant-fks` + `db:verify-constraints`) **debe** ejecutarse en cada entorno antes de validar allí. Local limpio ≠ staging/prod. **No** aplicar a producción sin autorización expresa.

**Impacto de bloqueo:** `VALIDATE` usa `SHARE UPDATE EXCLUSIVE` (permite DML concurrente; bloquea DDL conflictivo). Local: tablas demo ≤ 6 filas → coste trivial. Prod con volumen alto: ventana de baja carga + monitorización.

**Criterio de “H-07 cerrado”**

1. §5 = 0 en todos los entornos relevantes.
2. UNIQUE `(business_id, id)` en padres críticos.
3. FK compuestas 1–8 validadas (6 de F2–F3 + 2 de F4; auth pendiente).
4. Auth con al menos FK a `businesses` (ideal: membresía).
5. `schema.prisma` alineado; H-03 verify 9/9; tests int verdes.
6. Nuevas tablas tenant-scoped no introducen FK simples hijo→padre operativo.

### Fase 4 implementada — FK restantes `NOT VALID`

| | |
| --- | --- |
| Migración | `prisma/migrations/20261105040000_h07_phase4_remaining_composite_fks_not_valid/` |
| FK | `vehicles_fleet_tenant_fkey` · `inventory_movements_reversal_tenant_fkey` |
| Estado | `convalidated = false` (`NOT VALID`) — **sin** `VALIDATE` aún |
| Nullable | `vehicles.fleet_id` y `inventory_movements.reverses_movement_id` siguen NULLABLES |
| FK simples | Conservadas (`vehicles_fleet_id_fkey`, `inventory_movements_reverses_movement_id_fkey` + las 6 de oleada anterior) |
| Reglas | `ON UPDATE CASCADE ON DELETE RESTRICT` |
| Prisma | `Vehicle.fleet` y `InventoryMovement.reverses` con `fields: [businessId, …]` |
| Fuera | Auth sessions; drop de FK simples; VALIDATE de estas dos |

**Notas:** NULL = sin flota / sin reversión (PG no evalúa FK). Self-FK de reversión exige `@@unique([businessId, id])` (Fase 1). No se tocaron use cases de assign/unassign ni inventario.

### Fase 5 implementada — `VALIDATE` de las 2 FK restantes

| | |
| --- | --- |
| Migración | `prisma/migrations/20261105050000_h07_phase5_validate_remaining_composite_fks/` |
| Acción | Solo `ALTER TABLE … VALIDATE CONSTRAINT …` sobre las 2 FK de Fase 4 |
| Estado | `convalidated = true` en las ocho FK tenant (local tras migrate deploy) |
| Datos | **Sin** INSERT/UPDATE/DELETE |
| Nullable | Sin cambios (`fleet_id`, `reverses_movement_id` siguen YES) |
| FK simples | Conservadas (8/8) |
| UNIQUE Fase 1 | Siguen válidas (5/5) |
| Schema Prisma | Sin cambios |

**Entornos:** preflight obligatorio en cada entorno antes de validar. Local limpio ≠ staging/prod. **No** producción sin autorización expresa.

**Impacto:** `SHARE UPDATE EXCLUSIVE`; local trivial (vehicles 6, movements 2). Prod: ventana de baja carga.

---

## Apéndice — Qué se comprobó vs qué quedó pendiente

| Comprobado en esta auditoría | Pendiente |
| --- | --- |
| Schema Prisma + migraciones SQL H-07 F0–F5 | Staging / producción (§5 + migraciones allí) |
| FK tenant 1–8 con `convalidated = true` (local) | Volumen real / tiempo de VALIDATE en prod |
| UNIQUE `(business_id, id)` Fase 1 (5 tablas) | FK auth sessions |
| Matriz cross-tenant local = 0 | Remediación si algún entorno tiene `bad > 0` |
| Drift flota / ownership local = 0 | Diseño detallado de tablas SO (cuando existan) |
| H-03 verify 9/9 en local | Limpieza opcional FK simples |
| Fase 0 script + tests int | Aplicar F3–F5 en staging/prod tras preflight |

**Fase 0 no aplica correcciones de esquema.** Documento hermano: [`database-integrity-audit.md`](./database-integrity-audit.md). Restricciones H-03: [`docs/db-constraints.md`](../db-constraints.md).
