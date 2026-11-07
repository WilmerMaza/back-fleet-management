# Auditoría técnica y arquitectónica del backend — KONTI

| | |
| --- | --- |
| Repo | `back-fleet-management` (`konti-api`) |
| Fecha | 2026-11-04 |
| Alcance | Diagnóstico de solo lectura (sin correcciones) |
| Estándares | `.cursor/rules/backend-architecture.mdc`, `.cursor/rules/backend-development.mdc` (canónico; ver `docs/audits/architecture-rules-audit.md`) |
| Entrada docs | `docs/INDEX.md`, `docs/PLAN.md` |

**Veredicto en una línea:** monolito modular NestJS usable, con buen núcleo de inventario; aún no cumple Clean/Hexagonal de las reglas; hay un **P0 de autorización multi-membresía**.

---

## 1. Resumen ejecutivo

KONTI API implementa con calidad operativa: login JWT, tenancy por `business_id`, clientes, vehículos, flotas, productos, movimientos de inventario (bloqueo `FOR UPDATE`, `decimal.js`, idempotencia por `operationKey`) y auditoría append-only.

Respecto a las reglas de arquitectura/desarrollo, la implementación es una **arquitectura de 2.5 capas** (presentation + application + domain fino) con **Prisma dentro de los use cases**, sin `infrastructure/repositories` ni puertos.

El riesgo más grave: **`AuthGuard` acepta cualquier `businessId` del claim `businessIds[]` pero aplica `roles`/`permissions` del negocio con el que se emitió el token** → escalada de privilegios entre talleres si las membresías tienen roles distintos.

No se modificó código durante la auditoría. Las correcciones quedan pendientes de aprobación.

---

## 2. Inventario del backend

### Stack

| Aspecto | Evidencia |
| --- | --- |
| Runtime | Node en host de auditoría: **v24.13.0** (reglas pedían 22 LTS; no hay `engines` en `package.json`) |
| Framework | NestJS **^12** (`package.json`) |
| TypeScript | `strict: true`; `strictPropertyInitialization: false` (`tsconfig.json`) |
| ORM | Prisma **^6.16** + PostgreSQL 16 (Compose) |
| Auth | JWT (`@nestjs/jwt`) + Argon2id |
| Validación | `class-validator` + `ValidationPipe` whitelist/forbid |
| Tests | Vitest unit + int (Testcontainers) |
| Docker | Solo Postgres (`docker-compose.yml`); sin MinIO/API en Compose |
| Logging | `AppLogger` + sinks console/Better Stack (no Pino) |

### Módulos Nest existentes (`src/app.module.ts`)

| Módulo | Responsabilidad aparente | Capas reales |
| --- | --- | --- |
| `identity` | Login, refresh, switch-business, emisión de sesión | presentation + application |
| `customers` | CRUD parcial clientes PERSON/COMPANY | presentation + application + domain rules |
| `vehicles` | CRUD, km, hoja de vida básica | presentation + application + domain |
| `fleets` | CRUD flotas, assign/unassign | presentation + application |
| `products` | Catálogo productos, activate/deactivate | presentation + application + domain sku |
| `inventory` | List movimientos, ENTRY, ADJUSTMENT, `InventoryStockService` | presentation + application + domain stock-math |
| `audit` | Writer `AuditService` | service único |
| `health` | Healthcheck + `SELECT 1` | controller |
| `shared/*` | Prisma, AuthGuard, errores, paginación, logging, tenant context | transversal |

### No encontrado en código

- Service catalog, service orders, sales, attachments, maintenance
- CRUD users/roles HTTP, forgot-password
- Carpeta `infrastructure/`, repositorios abstractos
- Unit of Work explícito (sí hay `$transaction` ad hoc)

### Migraciones

- `prisma/migrations/20261103000000_init`
- `prisma/migrations/20261103010000_customers_vehicles_fleets`

---

## 3. Arquitectura actual

### Presentation — Estado: aceptable / controllers delgados

- Controllers delegan a use cases; DTOs con class-validator; `@UseGuards(AuthGuard)` + `@RequirePermission`.
- Presenters separan forma HTTP de Prisma.
- **Problema menor:** `InventoryController` valida `type === 'ENTRY'` en presentation (`src/modules/inventory/presentation/inventory.controller.ts`).
- **No** consultan Prisma directamente (excepto `HealthController`).

### Application — Estado: funcional, acoplada a Prisma

- Use cases identificables (`CreateProductUseCase`, `AssignVehicleUseCase`, etc.).
- Coordinan transacciones y auditoría.
- **Contradicción con reglas:** prohíben Prisma en use cases; **todos** inyectan `PrismaService`.
- `InventoryStockService` actúa como domain service de aplicación + adaptador de persistencia mezclado.

### Domain — Estado: fino pero útil

- Funciones puras: `stock-math`, `sku`, `mileage`, `customer-rules`, `plate`, `display-name`.
- Sin entidades ricas ni value objects estructurados.
- Dependencia menor: dominio importa `Errors` / enums de `@prisma/client` (p. ej. `stock-math.ts`).

### Infrastructure — Estado: casi inexistente como capa

- Solo `shared/database/PrismaService`.
- Sin contratos de repositorio; sin adapters externos (storage/S3 pendiente).

**Impacto:** mantenible a escala actual, pero abrir órdenes/ventas sin puertos consolidará el acoplamiento Prisma.

---

## 4. Evaluación SOLID y patrones

| Principio | Evaluación |
| --- | --- |
| SRP | Buena en use cases por operación; `InventoryStockService` concentra escritura de stock (intencional y correcto). |
| OCP | Roles vía mapa `ROLE_PERMISSIONS`; permisos también denormalizados en DB → doble fuente. |
| LSP | N/A relevante (casi sin jerarquías). |
| ISP | No hay interfaces de repo que segreguar. |
| DIP | **Incumplido:** application depende de Prisma concreto. |

**Patrones presentes:** DI Nest, Use Case, Adapter de logging (sinks), transacciones como UoW implícito, Strategy implícita en `nextStock` por tipo.

**Scopes:** todo Singleton por defecto. Contexto tenant en `request[REQUEST_CONTEXT]` (no en propiedades mutables de servicios) → correcto.

**No es problema:** ausencia de Factory/Specification si no aportan valor.

---

## 5. Seguridad y multitenancy

### Cómo funciona hoy

1. Login/`SessionIssuer` carga membresías ACTIVE y firma JWT con `activeBusinessId`, `businessIds`, `roles`, `permissions` de **esa** membresía (`src/modules/identity/application/session.issuer.ts`).
2. `AuthGuard` resuelve tenant: `X-Business-Id` ‖ path `businessId` ‖ `activeBusinessId` (`src/shared/authorization/auth.guard.ts`).
3. Valida pertenencia a `businessIds` y coherencia path vs requested.
4. Permisos desde **claims del JWT**, no desde DB.

### Hallazgo P0 (confirmado)

Archivo: `src/shared/authorization/auth.guard.ts` (aprox. líneas 43–70).

Un token emitido para el negocio A puede usarse contra `/businesses/B/...` si B está en `businessIds`, conservando `roles`/`permissions` de A.

Contrato de referencia: `docs/api-contracts/00-multitenancy.md` — roles del **negocio activo**; `switch-business` debe emitir nuevo token.

**Aislamiento de datos por fila:** las consultas revisadas usan `findFirst({ id, businessId })` → IDOR por UUID ajeno mitigado en flujos actuales. El P0 es de **privilegios**, no de fuga ciega de filas.

### Otros

| Tema | Estado |
| --- | --- |
| Validación relaciones mismo tenant (vehicle↔customer↔fleet) | Sí en create; hueco en update vehicle (H-02) |
| Permisos en backend | Sí, por decorator |
| Membresía INACTIVE mid-token | No revalidada (P2) |
| Refresh en tabla / rotación | No implementado (PLAN lo pedía) |
| `JWT_SECRET` default | `dev-secret-change-me` en `src/app.module.ts` |

---

## 6. Base de datos y Prisma

### Fortalezas

- UUID, `business_id` en tablas operativas
- `Decimal(14,3)` / `(14,2)`
- Unique `(businessId, sku|plate)`
- `operationKey` unique por negocio
- CHECK stock ≥ 0 y cantidades en SQL
- Índice parcial de asignación abierta de flota
- Unicidad parcial documento/NIT en migración SQL

### Problemas

1. **Drift schema ↔ SQL (P1):** índices parciales `customers_person_document_unique` / `customers_company_nit_unique` y CHECKs están en migraciones pero no en `schema.prisma` → riesgo de perderlos en futuros `migrate`.
2. **FK sin composite tenant (P2):** `vehicle.customerId → customers.id` no garantiza mismo `business_id` a nivel DB; solo aplicación.
3. Inventario: concurrencia bien pensada (`FOR UPDATE` + version increment).
4. No hay soft-delete genérico; status `ACTIVE` / `INACTIVE` en entidades.

No se propone cambiar el modelo de dinero/stock: ya es decimal correcto.

---

## 7. Flujos críticos

| Flujo | Implementado | Observaciones |
| --- | --- | --- |
| Clientes create/update/list/get | Sí | Unicidad vía índice parcial SQL; sin DELETE (desactivar por status) |
| Vehículos + km | Sí | Create atómico + mileage log; update km ADMIN puede bajar |
| Vehículo cambia cliente con flota | Parcial | No limpia/valida `fleetId` (H-02) |
| Flotas assign/unassign | Sí | Transacción + historial `fleet_vehicles` |
| Productos + stock inicial | Sí | Stock solo vía `InventoryStockService` |
| ENTRY / ADJUSTMENT HTTP | Sí | EXIT solo interno (correcto para órdenes futuras) |
| Órdenes / complete atómico | No | Pendiente por diseño |
| Ventas | No | Pendiente |

`GetFleetSummaryUseCase` documenta placeholder: sin maintenance, todo “onTrack”.

---

## 8. Calidad del código

- Tipado estricto; sin `any` encontrado en `src/`.
- Convenciones kebab-case / UseCase naming alineadas a reglas.
- Errores de dominio vía `AppError` + filter HTTP consistente.
- JSDoc en español en varios use cases.
- Deuda: acoplamiento Prisma, drift Prisma schema, lint script roto, Node no fijado a 22, refresh sin store.
- Código muerto / módulos vacíos: no observados.

---

## 9. Pruebas y resultados

| Comando | Resultado |
| --- | --- |
| `npx vitest run` (unit) | **10/10 passed** (sku, mileage, customer-rules, stock-math) |
| `npx tsc -p tsconfig.build.json --noEmit` | **OK (exit 0)** |
| `npm run lint` / oxlint | **Falló**: `oxlint` no está en dependencies del proyecto |
| `npm run test:int` | **No ejecutado** en esta auditoría (Testcontainers/Docker) |

Existen specs int con tenancy, concurrencia de EXIT e idempotencia (`test/inventory.int.spec.ts`, `test/operations.int.spec.ts`) — diseño sólido, no verificados en esta corrida.

---

## 10. Matriz de hallazgos P0–P3

| ID | P | Módulo | Ubicación | Problema | Tipo | Impacto | Solución recomendada |
| --- | --- | --- | --- | --- | --- | --- | --- |
| H-01 | **P0** | auth | `src/shared/authorization/auth.guard.ts` | Permisos del token A aplicados a business B | **Resuelto (2026-11-04)** | Escalada de privilegios multi-membresía | Guard exige path/header ≡ `activeBusinessId`; cambio vía `switch-business`. Tests: `auth.guard.spec.ts`, `auth-tenancy.int.spec.ts` |
| H-02 | **P1** | vehicles | `src/modules/vehicles/application/update-vehicle.use-case.ts` | Cambio de `customerId` sin invariante de flota | **Resuelto (2026-11-04)** | Datos inconsistentes vehicle/fleet | Rechaza con `FLEET_VEHICLE_MISMATCH` si la flota es de otro cliente. Tests: `vehicle-fleet-integrity.int.spec.ts` |
| H-03 | **P1** | prisma | `schema.prisma` vs migrations | Índices parciales/CHECKs fuera de Prisma | Confirmado | Pérdida de integridad en migraciones futuras | Reflejar en schema o documentar SQL raw + CI check |
| H-04 | **P1** | identity | `src/app.module.ts`, `session.issuer.ts` | Secret default; refresh no rotativo/persistido | **Resuelto (2026-11-04)** | Compromiso/sesión no revocable | `jwt.config` sin default; `auth_refresh_sessions` + rotación/reuso/logout. Tests: `auth-sessions.int.spec.ts` |
| H-05 | **P1** | architecture | use cases | Prisma en application (vs reglas) | Confirmado | Acoplamiento al crecer órdenes | Introducir ports al abrir módulos nuevos |
| H-06 | **P2** | auth | guard + JWT | Permisos stale; membresía inactive | Confirmado | Ventana hasta expiry | Revalidar membresía o TTL corto + revoke |
| H-07 | **P2** | db | FKs | Sin composite `business_id` | Riesgo potencial | Bypass solo vía SQL/bug | Triggers/composite FK progresivo |
| H-08 | **P2** | mvp | `docs/INDEX.md` | Órdenes/ventas/catálogo ausentes | Confirmado | MVP incompleto | Implementar tras H-01/stock |
| H-09 | **P2** | tooling | `package.json` | lint no ejecutable | Confirmado | CI/local lint roto | Añadir oxlint deps o cambiar script |
| H-10 | **P3** | inventory | `inventory.controller.ts` | Regla ENTRY en presentation | Mejora | Menor | Mover a use case |
| H-11 | **P3** | fleets | `assign-vehicle.use-case.ts` | `updateMany` sin `businessId` | Riesgo potencial | Defensa en profundidad | Añadir filtro |
| H-12 | **P1** | fleets | `update-fleet.use-case.ts` | Cambio de `customerId` de flota con asignaciones abiertas incompatibles | **Resuelto (2026-11-04)** | Misma inconsistencia simétrica a H-02 | Rechaza con `FLEET_VEHICLE_MISMATCH`; `FOR UPDATE` flota + assign. Tests: `fleet-owner-integrity.int.spec.ts` |

### Clasificación de prioridad

| Prioridad | Significado |
| --- | --- |
| P0 | Vulnerabilidad crítica, fuga entre tenants o riesgo grave de integridad |
| P1 | Problema arquitectónico o funcional que compromete operaciones importantes |
| P2 | Deuda técnica significativa o incumplimiento de estándares |
| P3 | Mejora de mantenibilidad, legibilidad o consistencia |

---

## 11. Plan de corrección priorizado

### 1. Seguridad y aislamiento multi-tenant

- **H-01** en `auth.guard.ts` (+ tests).
- Criterio de aceptación: token de A no puede usar permisos de A en path B; debe `switch-business` o re-emitir.
- **H-06** (opcional en el mismo PR): revalidar membresía ACTIVE.

### 2. Integridad de datos y transacciones

- **H-02** update vehicle/fleet.
- **H-03** alinear schema/migraciones.
- Conservar `InventoryStockService` como único escritor de stock.

### 3. Fundamentos arquitectónicos

- Definir plantilla de módulo con ports **solo al implementar service orders**.
- No reescribir customers/products de golpe (**H-05** gradual).

### 4. Estandarización

- Controllers siempre `ctx.businessId` (además del path validado).
- Respuestas `{ data, meta }` ya mayormente consistentes.

### 5. Calidad y mantenibilidad

- **H-04**, **H-09**, `engines` Node 22.
- Quitar secret default fuera de test.

### 6. Cobertura de pruebas

- Unit AuthGuard multi-rol.
- Ejecutar `test:int` en CI con Testcontainers.
- Cuando existan órdenes: test transaccional complete + stock.

---

## 12. Primer módulo a corregir

**`shared/authorization` (`AuthGuard` + contrato de sesión).**

Justificación: es P0, cambio localizado, no reescribe dominio, desbloquea confianza multi-tenant antes de órdenes.

Segundo: **vehicles update** (H-02).

**No** empezar por refactor Hexagonal de products/inventory: el stock ya es el mejor núcleo del repo.

---

## 13. Decisiones que requieren aprobación

1. **Estrategia H-01:** ¿forzar `X-Business-Id === activeBusinessId` (y obligar `switch-business`), o resolver permisos desde DB por `requested` en cada request?
2. **¿Big-bang de repositorios** en módulos existentes o **solo en módulos nuevos**? (recomendado: solo nuevos)
3. **Refresh tokens:** ¿tabla + rotación ahora, o después del P0?
4. **¿Ejecutar y estabilizar `test:int` en CI** como gate antes de órdenes?
5. **Composite FKs / triggers tenant:** ¿hardening DB ahora o enforcement solo en aplicación para MVP?

---

## Fortalezas a conservar

- `InventoryStockService`: `FOR UPDATE` + Decimal + `operationKey`
- Consultas operativas con filtro `businessId` en finds
- Controllers delgados + `ValidationPipe` whitelist
- Tests int diseñados para tenancy y concurrencia de stock
- Unicidad documento/NIT parcial en SQL (migración)

---

## Criterio de finalización de esta auditoría

- [x] Backend real inspeccionado
- [x] Módulos existentes identificados
- [x] Riesgos críticos documentados con evidencia
- [x] Estado del aislamiento multi-tenant conocido
- [x] Estado de persistencia/transacciones conocido
- [x] Plan de corrección ordenado
- [x] Primer flujo a abordar identificado (`AuthGuard` / H-01)

**Sin correcciones aplicadas.** Esperar aprobación para implementar.
