# Backend KONTI — tecnología, patrones y arquitectura

Documento para **planear y construir** el API. El frontend Angular vive en el repo hermano `fleet-management` (mocks + contratos). Este archivo no sustituye los contratos: los organiza y fija cómo construirlos. Índice para agentes: [`INDEX.md`](./INDEX.md).

| | |
| --- | --- |
| Estado | Nest en este repo. Listo: auth, productos, inventario, clientes, vehículos, flotas, auditoría, tenancy. Pendiente: órdenes/ventas HTTP, usuarios/roles HTTP. |
| Frontend | Angular 22 · `environment.apiBaseUrl` = `http://localhost:3000/api/v1` · `useMocks: true` |
| Producto | Gestión y trazabilidad vehicular. Multi-tenant. El cambio de aceite es el primer caso de uso, no el modelo. |

## 1. Qué es KONTI en el servidor

Plataforma **SaaS multi-tenant**: cada empresa que contrata KONTI es un **negocio** (`businesses`) y ve **toda** la plataforma aislada de las demás.

| Término | Tabla | Qué es |
| --- | --- | --- |
| Tenant / negocio | `businesses` | Cliente de KONTI (el taller, la red, la operación). |
| Usuario | `users` + `user_business_roles` | Persona. Puede pertenecer a **varios** negocios. |
| Cliente del taller | `customers` (`PERSON` \| `COMPANY`) | Dueño de vehículos **dentro** de un tenant. Nunca es el tenant. |

Contrato canónico de aislamiento: [`docs/api-contracts/00-multitenancy.md`](./api-contracts/00-multitenancy.md).

## 2. Inventario: lo que ya tenemos para el back

### 2.1 Contratos HTTP (fuente de verdad de endpoints)

Índice: [`docs/api-contracts/README.md`](./api-contracts/README.md).

**MVP 1 (construir primero)**

| Doc | Dominio |
| --- | --- |
| [00-architecture.md](./api-contracts/00-architecture.md) | Capas, errores, paginación, JWT, storage |
| [00-multitenancy.md](./api-contracts/00-multitenancy.md) | Tenant, JWT claims, login 409, QA |
| [01-auth.md](./api-contracts/01-auth.md) | Login, refresh, users |
| [18-roles.md](./api-contracts/18-roles.md) | Roles y matriz ver/editar/eliminar |
| [02-customers.md](./api-contracts/02-customers.md) | Clientes PERSON/COMPANY |
| [03-vehicles.md](./api-contracts/03-vehicles.md) | Vehículos, km, hoja de vida |
| [04-fleets.md](./api-contracts/04-fleets.md) | Flotas N:M histórica |
| [05-service-catalog.md](./api-contracts/05-service-catalog.md) | Tipos de servicio genéricos |
| [06-service-orders.md](./api-contracts/06-service-orders.md) | Órdenes + **completar atómico** |
| [16-service-suggestions.md](./api-contracts/16-service-suggestions.md) | Sugerencias de producto (mock hoy) |
| [17-sales.md](./api-contracts/17-sales.md) | Venta directa (mock hoy) |
| [07-audit.md](./api-contracts/07-audit.md) | `audit_logs` append-only |
| [08-attachments.md](./api-contracts/08-attachments.md) | Evidencias + URL firmada |
| [09-inventory.md](./api-contracts/09-inventory.md) | Productos y movimientos |
| [11-maintenance.md](./api-contracts/11-maintenance.md) | Programación por km/tiempo |

**MVP 2+ (no abrir hasta congelar MVP 1)**

Notificaciones, portales, documentos vehiculares (SOAT/RTM/seguro), reportes, expansión: contratos 12, 13, 14, 15, 22, 24.

**Propuesta comercial (no es contrato vigente):** [`docs/arquitectura-comercial/`](./arquitectura-comercial/README.md). Facturación electrónica **fuera** de este plan.

### 2.2 Dominio y reglas ya escritas

- Modelo: [`docs/domain-model.md`](./domain-model.md)
- Plan de fases: [`docs/PLAN_EJECUCION_COMPLETO.md`](./PLAN_EJECUCION_COMPLETO.md)
- Spec inventario (este repo): [`PRODUCTS_INVENTORY_SPEC.md`](./PRODUCTS_INVENTORY_SPEC.md)
- Análisis productos: [`analysis/products/`](./analysis/products/)
- En el frontend (`fleet-management`): tipos `src/app/data-access/models/`, repositorios abstractos `.../repositories/`, mocks `.../mocks/` (tenants demo `biz-001` Taller Demo Fleet, `biz-002` Lubricantes del Norte)

### 2.3 Lo que el front espera del API

```http
Authorization: Bearer <access_token>
X-Business-Id: <uuid>
Content-Type: application/json
```

Base: `/api/v1`  
Prefijo de recurso: `/api/v1/businesses/{businessId}/...`  
Auth: `/api/v1/auth/login`, `/auth/refresh`, `/auth/forgot-password`, `/auth/switch-business`

Cuando `useMocks: false`, el front añadirá `XxxHttpRepository` **sin reescribir páginas**. El API debe respetar esos contratos; no al revés.

## 3. Tecnología (decisión de stack)

El plan de ejecución pide **NestJS u equivalente**. Aquí se concreta para no reabrir el debate en cada ticket.

### 3.1 Ya decidido (no negociar)

| Tema | Decisión |
| --- | --- |
| Estilo de API | REST JSON, no GraphQL en MVP 1 |
| Versionado | `/api/v1` |
| Tenancy | BD compartida + `business_id` en tablas operativas. No schema-per-tenant ni BD-per-tenant en MVP |
| Auth | JWT corto + refresh rotativo. Password hasheado (Argon2id o bcrypt) |
| Idioma de dominio | Mismos nombres que el front (`businessId`, `roleCodes`, estados en inglés de dominio: `ACTIVE`, `OPEN`, …) |
| Archivos | Object storage; en DB solo metadata + key. MVP1: JPEG, PNG, PDF |
| Auditoría | Tabla append-only; no UPDATE/DELETE físico |
| Anti-patrón | Prohibido tabla/feature `oil_changes`. Servicios genéricos |

### 3.2 Stack propuesto (arrancar con esto)

| Capa | Tecnología | Por qué |
| --- | --- | --- |
| Runtime | Node.js 22 LTS | Alineado al front; mismo ecosistema TS |
| Framework | **NestJS** | Lo nombra el plan; módulos, guards, pipes, OpenAPI |
| Lenguaje | TypeScript strict | Contratos = interfaces del front |
| BD | **PostgreSQL 16** | `uuid`, `timestamptz`, `jsonb` (auditoría y parámetros de servicio) |
| ORM / migraciones | **Prisma** | Migraciones versionadas, tipos generados, suficiente para este dominio |
| Auth | `@nestjs/jwt` + refresh en tabla | Claims: `sub`, `activeBusinessId`, `businessIds[]`, `roles[]` |
| Hash | Argon2id | Estándar actual; bcrypt aceptable |
| Storage | S3 compatible (AWS S3 en prod; MinIO en local) | URLs firmadas PUT |
| Cola | **BullMQ + Redis** (desde MVP 2) | Notificaciones y evaluación de mantenimientos. MVP 1 puede usar cron in-process |
| Observabilidad | **`AppLogger`** + sinks (console / Better Stack) + `GET /health` | No Pino directo; ver `src/shared/logging/` |
| Validación | `class-validator` (elegido) | Errores `VALIDATION_ERROR` |
| Tests | **Vitest** + Testcontainers Postgres | No Jest; isolation tenancy es criterio de DoD |
| Local | Docker Compose: API + Postgres + MinIO | `apiBaseUrl` del front ya apunta a `:3000` |

No hace falta Kubernetes ni event bus en el primer corte.

### 3.3 Repos y paquetes

Opción recomendada: **monorepo** junto al Angular (carpeta `apps/api` o `backend/`) para compartir tipos más adelante; o repo `konti-api` si el equipo de back trabaja aparte. Los contratos viven **aquí** (`docs/api-contracts/`) aunque el código API esté en otro git.

## 4. Arquitectura de sistema

```text
Angular (cabina)
    │  Bearer + X-Business-Id
    ▼
API Nest  /api/v1
    │
    ├── PostgreSQL     (estado + audit_logs)
    ├── Object storage (evidencias)
    └── Redis/BullMQ   (MVP 2: mails, evaluate maintenance)
```

Ambientes: DEV (front mocks o API local), QA (`useMocks: false` + staging), PROD. Secrets separados. Migraciones en cada deploy.

No hay consola superadmin KONTI en MVP 1: el primer `businesses` se crea por operación de plataforma (seed/migración), no desde el taller.

## 5. Arquitectura de aplicación

Alineada a `00-architecture.md` y a las reglas Cursor en [`.cursor/rules/`](../.cursor/rules/) (auditoría: [`audits/architecture-rules-audit.md`](./audits/architecture-rules-audit.md)).

```text
HTTP (controllers)
    → Application (casos de uso / services)
        → Domain (reglas: transiciones, stock, tenancy)
            → Infrastructure (Prisma, S3, JWT)
```

**Política legado vs greenfield:** módulos nuevos aplican capas + Prisma solo en Infrastructure; módulos existentes no se reescriben por obligación (Prisma en Application permanece hasta extracción justificada). Detalle: `.cursor/rules/backend-architecture.mdc`.

### 5.1 Módulos Nest (mapa 1:1 con el dominio)

```text
TenantContext / Auth
Identity          users, memberships, roles, permissions
Customers
Vehicles          + mileage logs + life projection
Fleets
Catalog           service_types
Orders            orders, items, product usages, complete
Inventory         products, movements
Attachments
Maintenance
Audit             writer only en MVP 1
Sales             después del núcleo de órdenes (contrato 17)
Suggestions       contrato 16
```

Un módulo no consulta “todo el mockDb”. Cada agregado filtra por `TenantContext.businessId`.

### 5.2 Contexto de tenant (obligatorio)

En cada request autenticado:

1. Validar JWT.
2. Resolver `businessId` = `X-Business-Id` o, si falta, `activeBusinessId`.
3. Si no está en `businessIds[]` del token → **403**.
4. Guardar `{ userId, businessId, roles }` en un contexto de request (AsyncLocalStorage / `REQUEST` scope).
5. Repositorios **siempre** añaden `WHERE business_id = ctx.businessId`. Nunca fiarse del id de la URL sin cruzarlo con el contexto (la URL y el header deben coincidir).

Un `GET` de un recurso de otro taller: **404** (no filtrar existencia) o **403**; nunca el payload.

## 6. Patrones

| Patrón | Dónde | Notas |
| --- | --- | --- |
| **Repository** | Infra por agregado | Misma idea que `XxxRepository` del front. Prisma detrás, no en controllers |
| **Tenant guard** | Global autenticado | Ver §5.2 |
| **RBAC** | Guard por permiso | Códigos iguales al front (`nav.orders`, `orders.write`, `orders.complete`, …). El usuario **acumula** permisos de todos sus `roleCodes` del negocio activo |
| **Caso de uso transaccional** | Completar orden, confirmar venta, movimiento de stock | Una transacción SQL; rollback → 409/422 |
| **Máquina de estados** | `service_orders.status` | Tabla de transiciones del contrato 06. Completar no es un `PATCH` genérico |
| **Append-only audit** | Tras mutaciones de negocio | Writer de dominio, no “log de HTTP”. Actor = `sub` |
| **Idempotencia** | Movimientos de inventario, confirmar venta | `operationKey` / idempotency key por negocio (`UNIQUE (business_id, operation_key)`) |
| **Evidencias polimórficas** | `attachments.entity_type` + `entity_id` | No hay `order_photos` |
| **Proyección / read model** | Hoja de vida del vehículo | Compone órdenes, km, evidencias, mantenimiento, audit. No una tabla God |
| **Outbox / cola** | MVP 2 notificaciones | No bloquear el complete de la orden por el mail |
| **Soft status** | `ACTIVE` / `INACTIVE` | Sin borrar tenants ni usuarios; membresía inactiva ≠ identidad inactiva |

### 6.1 Completar orden (patrón de consistencia)

Único flujo que demuestra el núcleo. Debe ser **atómico** ([06](./api-contracts/06-service-orders.md)):

1. Transición a `COMPLETED` + `closed_at` + `closed_by_user_id`.
2. `mileage >= vehicle.current_mileage` → log + update vehículo.
3. Por cada uso de producto: stock suficiente → `EXIT` → nuevo saldo.
4. Upsert `maintenance_schedules` según regla (km / tiempo / lo que ocurra primero).
5. `audit_logs` `SERVICE_ORDER_COMPLETED` (+ km / inventario / mantenimiento si aplica).
6. Fallo de stock u otra regla → rollback total.

Prohibido descontar stock “por otro camino” al cerrar.

### 6.2 Identidad vs membresía

```text
users                    identidad (email único global, hash, status de cuenta)
user_business_roles      (user_id, business_id, role_codes[], status)
roles                    por business_id (sistema + personalizados)
permissions              catálogo de códigos
```

- Inactivar membresía en A no cierra B.
- No dejar un negocio sin un `ADMIN` activo en esa membresía.
- `CUSTOMER` (rol) no entra al panel; portal es MVP 2.
- Login con varios negocios y sin `businessId` → **409** `SELECT_BUSINESS` `{ id, name }[]`.
- `POST /auth/switch-business` emite nuevo access token (mismos `businessIds`, otro `activeBusinessId` y `roles`).

## 7. Modelo de datos (tablas núcleo)

Construir en migraciones, todas las operativas con `business_id UUID NOT NULL` + índice.

```text
businesses
users
roles
permissions
user_business_roles
customers
vehicles
vehicle_mileage_logs
fleets
fleet_vehicles
service_types
service_orders
service_order_items
service_order_item_products
products
inventory_movements
attachments
maintenance_schedules
audit_logs
```

Más adelante (no bloquear MVP 1): `maintenance_records`, `notifications`, `notification_settings`, `vehicle_documents`, `sales` / pagos, sugerencias.

**Prohibido** en `vehicles`: `soat_number`, `oil_type`, `tire_brand`, etc. Eso son entidades (`vehicle_documents`, ítems de orden, productos).

PK de vehículo: UUID, **no** la placa. Placa única por `(business_id, plate)` si se exige unicidad.

`audit_logs`: ver columnas e índices en [07-audit.md](./api-contracts/07-audit.md).

## 8. Convención HTTP (implementar igual en todos los módulos)

### Paginación

`?page=1&pageSize=20&search=`

```json
{ "items": [], "total": 0, "page": 1, "pageSize": 20 }
```

### Errores

```json
{
  "code": "VALIDATION_ERROR",
  "message": "Stock insuficiente",
  "details": { "productId": "..." }
}
```

Códigos: `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `VALIDATION_ERROR`, `CONFLICT`, `INVALID_TRANSITION`, `SELECT_BUSINESS`.

### JWT (mínimo)

```json
{
  "sub": "<userId>",
  "activeBusinessId": "<uuid>",
  "businessIds": ["<uuid>"],
  "roles": ["OPERATOR"]
}
```

Refresh rotativo: al usar el refresh se invalida el anterior.

## 9. Seguridad (mínimo MVP 1)

- CORS acotado al origen del front.
- Rate limit en `/auth/login`.
- Forgot-password: 202 siempre, no revela si el correo existe.
- Usuario `INACTIVE` no autentica.
- Hashes nunca salen en JSON (`User` del contrato no lleva password).
- URLs firmadas con caducidad corta; MIME allowlist.
- Tests de tenancy: usuario A no lee/escribe B (DoD de cada fase).

## 10. Orden de construcción

Congruente con el plan §10 (prioridad B).

| Corte | Entrega | Contratos |
| --- | --- | --- |
| **B0** | Repo Nest, Compose, Prisma, health, logging, TenantContext vacío | 00 |
| **B1** | Migraciones identidad + tenancy. Login, refresh, switch-business, CRUD users/roles, RBAC | 00-multitenancy, 01, 18 |
| **B2** | Clientes → vehículos + km → flotas | 02, 03, 04 |
| **B3** | Catálogo `service_types` + órdenes + **complete transaccional** + evidencias + inventario + mantenimiento + audit | 05, 06, 07, 08, 09, 11 |
| **B4** | Front: interceptor + `HttpRepository` + `useMocks: false` en QA | — |
| **B5** | Sugerencias y ventas (ya hay mock) | 16, 17 |
| **B6** | MVP 2: cola, notificaciones, portales | 12–14 |

No empezar portales ni facturación antes de B3+B4.

Criterio de una fase (DoD del plan):

- [ ] Endpoint documentado y cumplido
- [ ] Reglas de negocio testeadas
- [ ] Auditoría escrita donde el contrato lo pide
- [ ] Datos aislados por `business_id`
- [ ] Front en HTTP (desde B4) o contrato listo para `HttpRepository`

## 11. Cómo se conecta el Angular

Hoy: `provideDataAccess()` registra mocks.

Después:

1. API en `http://localhost:3000/api/v1`.
2. Interceptor: `Authorization`, `X-Business-Id` desde `AuthService.businessId()`.
3. `XxxHttpRepository implements XxxRepository`.
4. `environment.useMocks = false`.
5. Las páginas **no** cambian: siguen `inject(XXX_REPOSITORY)`.

## 12. Roles de producto (semilla por negocio)

| Rol | Alcance |
| --- | --- |
| ADMIN | Negocio completo (usuarios y roles) |
| OPERATOR | Clientes, vehículos, órdenes, historial |
| TECHNICIAN | Ejecución, evidencias |
| INVENTORY | Productos y movimientos |
| FLEET_MANAGER | Flotas, mantenimiento |
| CUSTOMER | Solo portal (MVP 2) |

Un usuario acumula permisos de todos los roles de **ese** negocio.

## 13. Fuera de este plan

- Facturación electrónica / DIAN.
- Superadmin de plataforma (UI).
- Sedes distintas del tenant.
- GraphQL, Kafka, schema-per-tenant.
- Tabla `oil_changes`.
- Reescribir el front para “adaptarse” a un API distinto de los contratos.

## 14. Lectura mínima antes de picar código

1. Este archivo.
2. [`00-multitenancy.md`](./api-contracts/00-multitenancy.md)
3. [`00-architecture.md`](./api-contracts/00-architecture.md)
4. [`01-auth.md`](./api-contracts/01-auth.md) + [`18-roles.md`](./api-contracts/18-roles.md)
5. [`06-service-orders.md`](./api-contracts/06-service-orders.md) + [`07-audit.md`](./api-contracts/07-audit.md)
6. [`domain-model.md`](./domain-model.md)

Demo de aislamiento en el mock: `admin@norte.local` / `demo123` (Lubricantes del Norte) vs `admin@fleet.local` / `demo123` (Taller Demo Fleet). El operador `operador@fleet.local` pertenece a los dos.
