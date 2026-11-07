# Índice de documentación — KONTI API

Punto de entrada para agentes e ingenieros. **Leer esto primero**; no cargar todos los contratos de golpe.

| | |
| --- | --- |
| Repo | `back-fleet-management` (NestJS + Prisma + PostgreSQL) |
| Front hermano | [`fleet-management`](https://github.com/WilmerMaza/fleet-management) (Angular + mocks) |
| Origen de copias | [`SOURCE.md`](./SOURCE.md) |

## Lectura mínima (orden)

1. Este índice.
2. [`architecture/backend-architecture-standard.md`](./architecture/backend-architecture-standard.md) — estándar greenfield / legado (capas, TX, stock).
3. [`PLAN.md`](./PLAN.md) — stack, tenancy, cortes B0–B6, patrones.
4. Reglas Cursor: [`.cursor/rules/`](../.cursor/rules/) (`backend-architecture.mdc`, `backend-development.mdc`).
5. [`api-contracts/00-multitenancy.md`](./api-contracts/00-multitenancy.md)
6. [`api-contracts/00-architecture.md`](./api-contracts/00-architecture.md)
7. Contrato del módulo que tocas (tabla abajo).
8. [`domain-model.md`](./domain-model.md) si cambia el modelo.

Auditorías (consulta, no estándar operativo): [`audits/backend-architecture-global-audit.md`](./audits/backend-architecture-global-audit.md) · [`audits/architecture-rules-audit.md`](./audits/architecture-rules-audit.md) · auth [`audits/auth-hardening-fixes.md`](./audits/auth-hardening-fixes.md) · tenant FK [`audits/tenant-referential-integrity-audit.md`](./audits/tenant-referential-integrity-audit.md).

## Mapa rápido: contrato ↔ código

| Dominio | Contrato | Código Nest (`src/modules/…`) | Estado |
| --- | --- | --- | --- |
| Auth / identidad | [01-auth](./api-contracts/01-auth.md), [18-roles](./api-contracts/18-roles.md) | `identity/` | Login JWT listo; CRUD users/roles HTTP pendiente |
| Tenancy / contexto | [00-multitenancy](./api-contracts/00-multitenancy.md) | `shared/tenant/`, `shared/authorization/` | Listo |
| Clientes | [02-customers](./api-contracts/02-customers.md) | `customers/` | Listo |
| Vehículos + km | [03-vehicles](./api-contracts/03-vehicles.md) | `vehicles/` | Listo |
| Flotas | [04-fleets](./api-contracts/04-fleets.md) | `fleets/` | Listo |
| Productos / inventario | [09-inventory](./api-contracts/09-inventory.md), [PRODUCTS_INVENTORY_SPEC](./PRODUCTS_INVENTORY_SPEC.md) | `products/`, `inventory/` | Listo |
| Auditoría | [07-audit](./api-contracts/07-audit.md) | `audit/` | Writer listo |
| Catálogo servicios | [05-service-catalog](./api-contracts/05-service-catalog.md) | — | Pendiente |
| Órdenes + complete | [06-service-orders](./api-contracts/06-service-orders.md) | — | Pendiente (núcleo) |
| Evidencias | [08-attachments](./api-contracts/08-attachments.md) | — | Pendiente |
| Mantenimiento | [11-maintenance](./api-contracts/11-maintenance.md) | — | Pendiente |
| Sugerencias | [16-service-suggestions](./api-contracts/16-service-suggestions.md) | — | Mock en front |
| Ventas | [17-sales](./api-contracts/17-sales.md) | — | Mock en front |
| Health | — | `health/` | Listo |

Índice completo de contratos: [`api-contracts/README.md`](./api-contracts/README.md).

## Árbol `docs/`

```text
docs/
├── INDEX.md                 ← estás aquí
├── SOURCE.md                ← de dónde salió cada copia
├── PLAN.md                  ← arquitectura y orden de construcción
├── architecture/            ← estándar arquitectónico vigente
│   └── backend-architecture-standard.md
├── PLAN_EJECUCION_COMPLETO.md
├── domain-model.md
├── PRODUCTS_INVENTORY_SPEC.md
├── plataforma_gestion_trazabilidad_vehicular.md
├── audits/                  ← auditorías (diagnóstico; no sustituyen el estándar)
├── api-contracts/           ← fuente de verdad HTTP
├── arquitectura-comercial/  ← propuesta (no contrato vigente)
└── analysis/products/       ← análisis profundo inventario
```

Reglas de agentes: **`.cursor/rules/`** (canónico). `cursor/rules/` está deprecado.

## Infra compartida (código)

| Concern | Ruta |
| --- | --- |
| Prisma / migraciones | `prisma/` |
| Restricciones SQL fuera de Prisma (CHECK / índices parciales) | [`db-constraints.md`](./db-constraints.md) · `npm run db:verify-constraints` |
| Diagnóstico integridad multi-tenant (H-07 Fase 0, solo lectura) | [`audits/tenant-referential-integrity-audit.md`](./audits/tenant-referential-integrity-audit.md) · `npm run db:verify-tenant-fks` |
| Orden de bloqueos (`FOR UPDATE`) flota/vehículo/inventario | [`lock-order.md`](./lock-order.md) |
| Contexto tenant | `src/shared/tenant/` |
| Auth guard + permisos | `src/shared/authorization/` |
| Errores HTTP | `src/shared/errors/`, `src/shared/common/app-error.ts` |
| Paginación | `src/shared/common/pagination.ts` |
| Logging | `src/shared/logging/` |

## Principios que no negociar

- Tenant = `Business`. `Customer` es el cliente del taller.
- Toda tabla operativa con `business_id` + filtro por contexto.
- Prohibido `oil_changes`; servicios genéricos.
- Completar orden = transacción atómica (contrato 06).
- Stock solo vía `InventoryStockService`; locks según [`lock-order.md`](./lock-order.md).
- Evidencias polimórficas (`entity_type` + `entity_id`).
- Módulos nuevos = greenfield (`architecture/backend-architecture-standard.md`); legado no se reescribe por estética.
- El API cumple los contratos; el front no se reescribe para “adaptarse”.

## MVP 2+ (no abrir antes de congelar MVP 1)

[12-notifications](./api-contracts/12-notifications.md), [13-portal-customer](./api-contracts/13-portal-customer.md), [14-portal-fleet](./api-contracts/14-portal-fleet.md), [15-documents](./api-contracts/15-documents.md), [22-reports](./api-contracts/22-reports.md), [24-expansion](./api-contracts/24-expansion.md).

## Comercial (propuesta)

[`arquitectura-comercial/README.md`](./arquitectura-comercial/README.md) — no sustituye contratos hasta aprobación.

## Cómo validar en local

Ver [`README.md`](../README.md) del repo: Compose, seed, demo users, `npm test` / `npm run test:int`.
