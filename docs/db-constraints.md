# Restricciones PostgreSQL no modeladas en Prisma

| | |
| --- | --- |
| Alcance | CHECK e índices parciales UNIQUE creados en SQL y ausentes de `schema.prisma` |
| Verificación | `npm run db:verify-constraints` → `scripts/verify-db-constraints.ts` |
| Auditoría origen | [`AUDITORIA_H03_H07_SERVICE_ORDERS.md`](./AUDITORIA_H03_H07_SERVICE_ORDERS.md) (H-03) |

Prisma 6 no expresa de forma portable índices parciales (`WHERE …`) ni `CHECK`. Esas reglas viven en migraciones SQL versionadas y se reaplican con `prisma migrate deploy` / `migrate dev` cuando el historial de migraciones está intacto.

## Aclaración sobre riesgo

`prisma migrate deploy` y `prisma migrate reset` **ejecutan el SQL de las migraciones existentes**. Si el historial incluye estos `CREATE INDEX` / `CHECK`, **no se pierden** al resetear sobre ese historial.

El riesgo real es:

1. Regenerar el esquema **solo** desde `schema.prisma` (`migrate diff`, baseline nuevo, “squash” que omite SQL custom).
2. Editar o simplificar migraciones históricas eliminando estos artefactos.
3. Herramientas de sync schema→DB que no preservan objetos fuera del DMMF de Prisma.

Por eso documentamos aquí y verificamos contra el catálogo de PostgreSQL.

---

## Procedimiento para mantenerlas

1. **Nunca** borrar estos objetos “porque Prisma no los muestra”.
2. Cualquier cambio de regla de negocio → **nueva migración SQL** (`prisma migrate dev --create-only` + editar el `.sql`, o migración manual) que `DROP`/`CREATE` o `ALTER` de forma explícita.
3. Actualizar esta doc y las expectativas en `scripts/verify-db-constraints.ts` en el mismo cambio.
4. Tras `prisma migrate deploy`, ejecutar `npm run db:verify-constraints`.
5. En CI / Testcontainers: migrate deploy → verify → tests.

---

## Índices parciales UNIQUE

### `customers_person_document_unique`

| Campo | Valor |
| --- | --- |
| Tabla | `customers` |
| Tipo | UNIQUE INDEX parcial |
| SQL | `CREATE UNIQUE INDEX "customers_person_document_unique" ON "customers"("business_id", "document_type", "document_number") WHERE "type" = 'PERSON';` |
| Migración | `prisma/migrations/20261103010000_customers_vehicles_fleets/migration.sql` |
| Motivo | Un mismo documento no puede repetirse para dos PERSON del mismo negocio. |
| Riesgo si se elimina | Duplicados de identidad; fallos de negocio / fraude de datos. |
| Por qué no en Prisma | `@@unique` no admite predicado `WHERE`. |

### `customers_company_nit_unique`

| Campo | Valor |
| --- | --- |
| Tabla | `customers` |
| Tipo | UNIQUE INDEX parcial |
| SQL | `CREATE UNIQUE INDEX "customers_company_nit_unique" ON "customers"("business_id", "nit") WHERE "type" = 'COMPANY';` |
| Migración | `prisma/migrations/20261103010000_customers_vehicles_fleets/migration.sql` |
| Motivo | NIT único por negocio para COMPANY. |
| Riesgo si se elimina | Empresas duplicadas con el mismo NIT. |
| Por qué no en Prisma | Índice parcial; un `@@unique([businessId, nit])` global bloquearía PERSON con `nit` null/conflictivo de forma incorrecta. |

### `fleet_vehicles_open_assignment_unique`

| Campo | Valor |
| --- | --- |
| Tabla | `fleet_vehicles` |
| Tipo | UNIQUE INDEX parcial |
| SQL | `CREATE UNIQUE INDEX "fleet_vehicles_open_assignment_unique" ON "fleet_vehicles"("vehicle_id") WHERE "unassigned_at" IS NULL;` |
| Migración | `prisma/migrations/20261103010000_customers_vehicles_fleets/migration.sql` |
| Motivo | A lo sumo una asignación de flota **abierta** por vehículo (historial N:M permitido). |
| Riesgo si se elimina | Un vehículo en dos flotas a la vez; desync con `vehicles.fleet_id`. |
| Por qué no en Prisma | Unique parcial sobre `unassigned_at IS NULL`. |

---

## CHECK constraints

### `products_stock_non_negative`

| Campo | Valor |
| --- | --- |
| Tabla | `products` |
| Tipo | CHECK |
| SQL | `CHECK ("stock" >= 0)` |
| Migración | `prisma/migrations/20261103000000_init/migration.sql` |
| Motivo | El saldo de inventario no puede ser negativo a nivel físico. |
| Riesgo si se elimina | Stock negativo por bug o carrera no cubierta. |
| Por qué no en Prisma | Prisma no declara `CHECK` en el schema. |

### `products_min_stock_non_negative`

| Campo | Valor |
| --- | --- |
| Tabla | `products` |
| Tipo | CHECK |
| SQL | `CHECK ("min_stock" >= 0)` |
| Migración | `prisma/migrations/20261103000000_init/migration.sql` |
| Motivo | Umbral de alerta coherente (≥ 0). |
| Riesgo si se elimina | Configuración absurda de mínimo. |
| Por qué no en Prisma | Idem CHECK. |

### `inventory_movements_quantity_valid`

| Campo | Valor |
| --- | --- |
| Tabla | `inventory_movements` |
| Tipo | CHECK |
| SQL | `CHECK (("type" = 'ADJUSTMENT' AND "quantity" >= 0) OR ("type" <> 'ADJUSTMENT' AND "quantity" > 0))` |
| Migración | `prisma/migrations/20261103000000_init/migration.sql` |
| Motivo | ENTRY/EXIT/RETURN exigen cantidad &gt; 0; ADJUSTMENT permite cantidad ≥ 0 (saldo objetivo). |
| Riesgo si se elimina | Movimientos con cantidad 0 o negativa inválidos. |
| Por qué no en Prisma | CHECK condicional por enum. |

### `inventory_movements_stock_after_non_negative`

| Campo | Valor |
| --- | --- |
| Tabla | `inventory_movements` |
| Tipo | CHECK |
| SQL | `CHECK ("stock_after" >= 0)` |
| Migración | `prisma/migrations/20261103000000_init/migration.sql` |
| Motivo | El saldo resultante del movimiento no puede ser negativo. |
| Riesgo si se elimina | Historial inconsistente aunque `products.stock` se corrija después. |
| Por qué no en Prisma | Idem CHECK. |

### `vehicles_mileage_non_negative`

| Campo | Valor |
| --- | --- |
| Tabla | `vehicles` |
| Tipo | CHECK |
| SQL | `CHECK ("current_mileage" >= 0)` |
| Migración | `prisma/migrations/20261103010000_customers_vehicles_fleets/migration.sql` |
| Motivo | Kilometraje actual siempre ≥ 0. |
| Riesgo si se elimina | Valores inválidos en hoja de vida. |
| Por qué no en Prisma | Idem CHECK. |

### `vehicle_mileage_logs_mileage_non_negative`

| Campo | Valor |
| --- | --- |
| Tabla | `vehicle_mileage_logs` |
| Tipo | CHECK |
| SQL | `CHECK ("mileage" >= 0)` |
| Migración | `prisma/migrations/20261103010000_customers_vehicles_fleets/migration.sql` |
| Motivo | Cada registro de km es ≥ 0. |
| Riesgo si se elimina | Historial de kilometraje corrupto. |
| Por qué no en Prisma | Idem CHECK. |

---

## Cómo verificar

```bash
# BD local (usa DATABASE_URL de .env; Prisma carga .env automáticamente)
npm run db:up
npx prisma migrate deploy
npm run db:verify-constraints
```

El script consulta `pg_index` / `pg_constraint`, valida **nombre + unicidad/tipo + predicado o expresión + estado válido**, y sale con código ≠ 0 si hay diferencia. No modifica datos ni imprime la URL de conexión.

### Integración CI (propuesta mínima)

No hay workflows en el repo hoy. Cuando exista CI:

```text
npm ci
npx prisma migrate deploy   # contra Postgres de servicio / Testcontainers
npm run db:verify-constraints
npm test
npm run test:int            # ya hace migrate deploy en contenedor
```

Opción equivalente en Testcontainers: tras `migrate deploy` del setup de int, invocar el mismo script con `DATABASE_URL` del contenedor.

---

## Relación con `schema.prisma`

Los modelos afectados llevan comentarios `///` que apuntan a este documento. Esos comentarios **no** crean las restricciones; solo evitan que un agente las “limpie” por omisión.
