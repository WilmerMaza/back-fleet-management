# Auditoría de seguridad — KONTI API (back-fleet-management)

| | |
| --- | --- |
| Rol | Senior Application Security Engineer |
| Repo | `back-fleet-management` |
| Fecha | 2026-11-04 |
| Alcance | Solo lectura (sin correcciones, migraciones ni cambios de config) |
| Stack verificado | NestJS 12, Prisma 6, PostgreSQL 16, JWT + Argon2id, Vitest / Testcontainers |
| Prefijo API | `/api/v1` |
| Fuera de reimplementación | H-01, H-02, H-04, H-12 (solo validación de no-regresión) |

**Veredicto:** no se confirmó ningún **P0 explotable** en el código actual tras las correcciones de aislamiento de permisos (H-01) y sesiones (H-04). El riesgo residual más urgente es **abuso de autenticación sin rate limiting** y la **ventana de access JWT no revocable** (logout / baja de membresía). El aislamiento multi-tenant de datos por fila en los módulos implementados está aplicado de forma consistente.

---

## 1. Resumen ejecutivo

KONTI API implementa un modelo SaaS multi-tenant donde el tenant es `Business`, la sesión fija un único `activeBusinessId`, y los permisos del JWT corresponden a la membresía activa. Los controladores operativos usan `@UseGuards(AuthGuard)` + `@RequirePermission`, y los use cases filtrados revisados aplican `businessId` en lecturas y mutaciones.

**Fortalezas observadas**

- H-01 corregido: path/`X-Business-Id` deben coincidir con `activeBusinessId`; no basta con aparecer en `businessIds`.
- H-04 corregido: refresh persistido (hash SHA-256), rotación, detección de reuso con revocación de familia, logout.
- Validación de entrada con `ValidationPipe` (`whitelist` + `forbidNonWhitelisted`).
- Secretos JWT validados al arranque (sin default inseguro).
- Consultas `$queryRaw` parametrizadas (Prisma tagged templates); sin concatenación de SQL dinámico inseguro.
- Inventario concurrente con `FOR UPDATE` + `operationKey`.
- Errores 500 no exponen stack al cliente.

**Riesgos prioritarios (no P0)**

1. **P1** — Sin rate limit / lockout en `/auth/login` y `/auth/refresh`.
2. **P1** — Access token sigue válido tras logout o tras desactivar usuario/membresía (TTL por defecto 8h).
3. **P2** — `switch-business` emite nueva familia de refresh **sin** revocar la anterior.
4. **P2** — AuthGuard no es `APP_GUARD` global; el aislamiento depende de no olvidar `@UseGuards`.
5. **P2** — Integridad referencial multi-tenant solo en aplicación (sin FK compuestas `business_id`) — residual H-07.

No hay endpoints HTTP de administración de usuarios/roles aún (contrato 01 parcial); eso reduce superficie de mass assignment administrativo hoy, pero deja la autorización dependiente del seed / DB directa.

---

## 2. Alcance y metodología

### Alcance

| Área | Cubierto |
| --- | --- |
| Autenticación / autorización | Sí |
| Multi-tenant / IDOR-BOLA | Sí (módulos existentes) |
| Guards, decorators, roles, permisos | Sí |
| DTOs / mass assignment | Sí |
| Exposición de errores / respuestas | Sí |
| Sesiones JWT / refresh | Sí |
| Rate limiting / abuso | Sí (ausencia) |
| CORS / secretos / bootstrap | Sí |
| Auditoría de mutaciones | Sí (writer) |
| Adjuntos / uploads | Pendiente de producto (riesgo futuro) |
| SQL injection / raw | Sí |
| Race conditions de autorización | Sí |
| Service orders / sales / attachments / users CRUD | No implementados — fuera de explotación actual |

### Metodología

1. Lectura de `docs/INDEX.md`, contratos de auth/tenancy y auditorías previas (contexto, no como evidencia única).
2. Revisión del flujo HTTP → Guard → controller → use case → Prisma / `$queryRaw`.
3. Verificación de origen de `businessId` (JWT `activeBusinessId` vs path/header vs body).
4. Revisión de tests unitarios e integración: `auth.guard.spec.ts`, `auth-tenancy.int.spec.ts`, `auth-sessions.int.spec.ts`, integridad flota/vehículo.
5. Clasificación: **explotable con evidencia** vs **mejora preventiva / defensa en profundidad**.

### Criterio de severidad

| Severidad | Criterio |
| --- | --- |
| **P0** | Compromiso cross-tenant, escalada de privilegios entre negocios, bypass de auth, o compromiso masivo de cuentas con evidencia |
| **P1** | Explotable con impacto alto (abuso de auth, sesión no revocable en ventana amplia, escalada dentro del tenant) |
| **P2** | Riesgo real mitigado parcialmente, o fallo que requiere condiciones / bug adicional |
| **P3** | Endurecimiento, hygiene, o impacto bajo |

---

## 3. Hallazgos

### P0 — Crítico

**Ninguno confirmado en esta pasada.**

La escalada multi-membresía documentada históricamente como H-01 (token del negocio A operando el path B con permisos de A) **no se reproduce** en el `AuthGuard` actual ni en `test/auth-tenancy.int.spec.ts`. Ver §5.

---

### P1 — Alto

#### SEC-01 — Ausencia de rate limiting y lockout en autenticación

| Campo | Detalle |
| --- | --- |
| **Severidad** | P1 |
| **Archivos** | `src/modules/identity/presentation/auth.controller.ts` (L47–62); `src/main.ts`; `package.json` (sin `@nestjs/throttler` u equivalente); `docs/PLAN.md` (lo lista como pendiente) |
| **Evidencia** | `POST /auth/login`, `POST /auth/refresh` y `POST /auth/logout` no tienen throttling, CAPTCHA, backoff ni bloqueo por IP/cuenta. Argon2id encarece intentos, pero no sustituye rate limit en un endpoint público. |
| **Escenario** | Atacante ejecuta credential stuffing o fuerza bruta contra correos conocidos (`admin@fleet.local`, etc.). En refresh, fuerza bruta de tokens es improbable (entropía JWT), pero el endpoint sigue siendo amplificador de carga / oráculo 401. |
| **Impacto** | Compromiso de cuentas demo/producción débiles; degradación del servicio de auth; superficie de abuso sin fricción. |
| **Recomendación** | Throttling por IP + por email en login (p. ej. `@nestjs/throttler` o gateway); lockout temporal tras N fallos; opcionalmente rate limit estricto en `/auth/refresh`. Monitorizar 401. |
| **Prueba de corrección** | Int test/e2e: 30+ login fallidos desde la misma IP → 429; intento legítimo tras ventana → 200. |

#### SEC-02 — Access JWT no se invalida en logout ni al revocar membresía/usuario

| Campo | Detalle |
| --- | --- |
| **Severidad** | P1 |
| **Archivos** | `src/modules/identity/application/logout.use-case.ts` (revoca solo familia de refresh); `src/shared/authorization/auth.guard.ts` (solo `jwt.verify`, sin denylist ni revalidación DB); `src/shared/config/jwt.config.ts` (`JWT_EXPIRES_IN` default `8h`); `src/modules/identity/application/session.issuer.ts` (`loadMembership` solo en emisión/refresh) |
| **Evidencia** | Logout llama `revokeFamily` sobre refresh. El access token sigue firmado y es aceptado por `AuthGuard` hasta expirar. Usuario `INACTIVE` o membresía `INACTIVE` se comprueban en login/refresh/switch, **no** en cada request autenticado. |
| **Escenario** | (A) Robo de `accessToken` → logout de la víctima no corta el acceso del atacante durante hasta 8h. (B) Admin desactiva membresía en DB → el empleado conserva permisos del JWT hasta expiry. |
| **Impacto** | Persistencia de acceso no autorizado tras respuesta operativa esperada (“cerré sesión” / “lo dimos de baja”). |
| **Recomendación** | TTL de access corto (5–15 min) + refresh; y/o denylist/`jti`/`sid` de access alineada a logout; y/o revalidación de `user.status` + membresía ACTIVE en Guard (cache TTL corto). |
| **Prueba de corrección** | Tras logout, access previo → 401. Tras marcar membresía INACTIVE, access previo → 401/403 antes del expiry natural. |

#### SEC-03 — Autorización confía en `permissions[]` del JWT (fuente denormalizada, sin recompute live)

| Campo | Detalle |
| --- | --- |
| **Severidad** | P1 |
| **Archivos** | `src/modules/identity/application/session.issuer.ts` L111–118; `src/shared/authorization/auth.guard.ts` L71–82; `src/shared/authorization/permissions.ts` (`ROLE_PERMISSIONS` / `permissionsForRoles`); `prisma/schema.prisma` modelo `UserBusinessMembership` (`roleCodes` + `permissions`) |
| **Evidencia** | El access token embebe `permissions: membership.permissions` tal cual en DB. El Guard hace `ctx.permissions.includes(needed)`. No recalcula desde `roleCodes` ni desde el mapa `ROLE_PERMISSIONS` en request time. Si `permissions` en DB se infla (error operativo, script, futuro CRUD users) por encima de los roles, el JWT otorga esos permisos. Además, cambios de rol no surten efecto hasta nuevo token (ligado a SEC-02). |
| **Escenario** | Operador con `roleCodes: ['OPERATOR']` pero `permissions` manipuladas en `user_business_roles` para incluir `inventory.adjust` → tras login/switch obtiene ajuste de inventario. Hoy no hay API users; el vector es DB/seed/ops o el futuro endpoint del contrato 01. |
| **Impacto** | Escalada de privilegios **dentro del tenant**; desincronización rol↔permiso. |
| **Recomendación** | Emitir permisos solo vía `permissionsForRoles(roleCodes)` (o fuente única); en Guard, opcionalmente ignorar claim `permissions` y derivar de `roles`; al abrir CRUD users, nunca aceptar `permissions` del cliente. |
| **Prueba de corrección** | Membresía con roles OPERATOR y permissions artificialmente ampliadas → tras login el access **no** incluye `inventory.adjust`. Test de Guard/issuer. |

---

### P2 — Medio

#### SEC-04 — `switch-business` no revoca la familia de refresh anterior

| Campo | Detalle |
| --- | --- |
| **Severidad** | P2 |
| **Archivos** | `src/modules/identity/presentation/auth.controller.ts` L65–69; `src/modules/identity/application/session.issuer.ts` `issue()` L37–67 |
| **Evidencia** | `issue()` crea `familyId` nuevo y persiste un refresh. No llama a `revokeFamily` sobre sesiones previas del usuario. El test H-04 valida la nueva sesión, no la invalidación de la vieja (`test/auth-sessions.int.spec.ts` L242–268). |
| **Escenario** | Usuario (o malware con ambos tokens) mantiene refresh del negocio A tras “cambiar” a B. Access A sigue válido hasta expiry (SEC-02). No es cross-tenant privilege mix (H-01 cerrado), pero multiplica sesiones activas. |
| **Impacto** | Sesiones paralelas no intencionales; mayor superficie si un dispositivo se comprometió antes del switch. |
| **Recomendación** | Política explícita: (a) switch rota y opcionalmente revoca familias previas del mismo user, o (b) documentar multi-sesión como diseño y exponer “cerrar otras sesiones”. |
| **Prueba de corrección** | Tras switch, refresh anterior → 401 (si se elige revocación). |

#### SEC-05 — `AuthGuard` no registrado como `APP_GUARD`

| Campo | Detalle |
| --- | --- |
| **Severidad** | P2 |
| **Archivos** | `src/shared/authorization/auth.module.ts`; `src/app.module.ts`; controllers con `@UseGuards(AuthGuard)` manual |
| **Evidencia** | El guard se aplica por controlador. `HealthController` está abierto a propósito. Un futuro controller sin `@UseGuards` + sin `@Public` quedaría anónimo. |
| **Escenario** | Regresión humana al añadir `service-orders` u otro módulo. |
| **Impacto** | Endpoint operativo expuesto sin auth (alto si ocurre; probabilidad por proceso). |
| **Recomendación** | `APP_GUARD` global + decorator `@Public()` para health/login/refresh. |
| **Prueba de corrección** | Spec de módulo: rutas no públicas sin token → 401. |

#### SEC-06 — Controllers pasan `businessId` del path en lugar del contexto del Guard

| Campo | Detalle |
| --- | --- |
| **Severidad** | P2 (defensa en profundidad) |
| **Archivos** | p. ej. `customers.controller.ts`, `vehicles.controller.ts`, `fleets.controller.ts`, `products.controller.ts`, `inventory.controller.ts` |
| **Evidencia** | Tras H-01, Guard garantiza `pathBusiness === activeBusinessId`. Aun así, los use cases reciben `@Param('businessId')`, no `ctx.businessId`. Si el Guard se omitiera (SEC-05), el path sería la fuente de tenant. |
| **Escenario** | Controller nuevo sin Guard + path `businessId` arbitrario. |
| **Impacto** | Cross-tenant si se rompe la capa de presentación. |
| **Recomendación** | Usar siempre `ctx.businessId` en mutaciones/lecturas; path solo para routing/assert. |
| **Prueba de corrección** | Convención lint/test: use cases de tenant no reciben businessId distinto del contexto. |

#### SEC-07 — Sin FK compuestas multi-tenant (residual H-07)

| Campo | Detalle |
| --- | --- |
| **Severidad** | P2 |
| **Archivos** | `prisma/schema.prisma` (FKs por `id` simple); use cases con validación app-level (create/update vehicle/fleet) |
| **Evidencia** | Documentado en `docs/AUDITORIA_H03_H07_SERVICE_ORDERS.md`. La app mitiga con `findFirst({ id, businessId })` y reglas H-02/H-12. Un bug futuro en application podría enlazar `customerId`/`fleetId` de otro tenant si solo valida existencia por UUID global. |
| **Escenario** | Use case nuevo que hace `findUnique({ id })` sin `businessId` y asigna la FK. |
| **Impacto** | Corrupción cross-tenant de relaciones (no lectura directa hoy). |
| **Recomendación** | FK compuestas `(business_id, id)` o triggers; checklist de PR para filtros tenant. |
| **Prueba de corrección** | Int test: intentar asignar customer de otro `businessId` → rechazo a nivel DB o app. |

#### SEC-08 — Listados que materializan el dataset completo (DoS autenticado)

| Campo | Detalle |
| --- | --- |
| **Severidad** | P2 |
| **Archivos** | `src/modules/customers/application/list-customers.use-case.ts` L49–58; `src/modules/fleets/application/list-fleets.use-case.ts` L28–70 |
| **Evidencia** | Con ciertos `sortBy`, customers carga **todas** las filas del tenant en memoria y ordena en Node. Fleets siempre carga todas las flotas + `groupBy` de vehículos. `pageSize` máx. 100 no limita el fetch previo. |
| **Escenario** | Usuario con `*.read` en un tenant grande fuerza CPU/memoria/DB repetidamente. |
| **Impacto** | Denegación de servicio lógica autenticada; coste de infra. |
| **Recomendación** | Ordenación en SQL; índices; techos; evitar `findMany` sin `take` para sort. |
| **Prueba de corrección** | Seed con N grande + assert de query plan / tiempo; o spy de que no se pide el set completo. |

#### SEC-09 — `PRODUCT_INACTIVE` definido pero no enforced en movimientos HTTP nuevos

| Campo | Detalle |
| --- | --- |
| **Severidad** | P2 |
| **Archivos** | `src/shared/common/app-error.ts` L29–33; `src/modules/inventory/application/inventory-stock.service.ts` (sin check de `status`); `src/modules/inventory/presentation/inventory.controller.ts` |
| **Evidencia** | Existe `Errors.productInactive`, pero `InventoryStockService.apply` no lee `status`. Un producto `INACTIVE` acepta `ENTRY`/`ADJUSTMENT` vía API si el actor tiene permiso. El test int documenta EXIT interno sobre inactivo como deseado para órdenes abiertas. |
| **Escenario** | Tras desactivar un producto, un usuario con `inventory.write` sigue registrando entradas/ajustes “nuevos”. |
| **Impacto** | Bypass de política de catálogo (menor que authz cross-tenant); inconsistencia con el mensaje de error preparado. |
| **Recomendación** | Bloquear ENTRY/ADJUSTMENT/RETURN “manuales” si `INACTIVE`; permitir EXIT/RETURN ligados a órdenes abiertas con regla explícita. |
| **Prueba de corrección** | PRODUCT INACTIVE + POST inventory-movements ENTRY → 409 `PRODUCT_INACTIVE`. |

#### SEC-10 — Doble fuente de verdad `roleCodes` vs `permissions` en membresía

| Campo | Detalle |
| --- | --- |
| **Severidad** | P2 |
| **Archivos** | `prisma/schema.prisma` `UserBusinessMembership`; `prisma/seed.ts` (sincroniza con `permissionsForRoles`); `session.issuer.ts` |
| **Evidencia** | Ambas columnas se persisten. El seed las alinea; nada en runtime garantiza invariante. Relacionado con SEC-03. |
| **Escenario** | Update parcial futuro de solo `roleCodes` deja `permissions` stale (sobre o sub privilegio). |
| **Impacto** | Autorización incorrecta sostenida por JWT. |
| **Recomendación** | Eliminar columna `permissions` **o** tratarla como cache regenerada siempre al escribir roles. |
| **Prueba de corrección** | Al cambiar roles, assert DB permissions === `permissionsForRoles(roles)`. |

---

### P3 — Bajo

#### SEC-11 — Cabeceras de seguridad HTTP ausentes

| Campo | Detalle |
| --- | --- |
| **Severidad** | P3 |
| **Archivos** | `src/main.ts` (solo CORS + ValidationPipe; sin Helmet) |
| **Evidencia** | No hay `helmet`, CSP, `X-Content-Type-Options`, etc. |
| **Escenario** | Mitigaciones browser-side débiles si un día se sirve contenido interactivo / error HTML. |
| **Impacto** | Bajo en API JSON pura; hygiene producción. |
| **Recomendación** | `helmet` o headers en reverse proxy. |
| **Prueba** | Response incluye `X-Content-Type-Options: nosniff` (u equivalentes acordados). |

#### SEC-12 — `/health` público con dependencia de base de datos

| Campo | Detalle |
| --- | --- |
| **Severidad** | P3 |
| **Archivos** | `src/modules/health/health.controller.ts` |
| **Evidencia** | `GET /api/v1/health` ejecuta `SELECT 1` sin auth. |
| **Escenario** | Sondeo externo para descubrir disponibilidad API+DB; amplificación de carga trivial. |
| **Impacto** | Info / DoS menor. |
| **Recomendación** | Separar liveness (sin DB) y readiness (protegido o red interna). |
| **Prueba** | Liveness 200 sin DB; readiness falla solo en red privada. |

#### SEC-13 — Oráculo de timing en login

| Campo | Detalle |
| --- | --- |
| **Severidad** | P3 |
| **Archivos** | `src/modules/identity/application/login.use-case.ts` L21–30 |
| **Evidencia** | Si el usuario no existe, no se ejecuta `argon2.verify`. Mensaje unificado (`invalidCredentials`) — bien — pero el tiempo difiere. |
| **Escenario** | Enumeración de emails por latencia. |
| **Impacto** | Bajo; emails a menudo semi-públicos. |
| **Recomendación** | Dummy `argon2.verify` con hash fijo si el usuario no existe. |
| **Prueba** | Distribuciones de latencia solapadas user known vs unknown. |

#### SEC-14 — DTO de entrada de inventario admite tipos que el controller rechaza

| Campo | Detalle |
| --- | --- |
| **Severidad** | P3 |
| **Archivos** | `inventory.dto.ts` `RegisterEntryDto.type: InventoryMovementType`; `inventory.controller.ts` L47–48 |
| **Evidencia** | Defensa en presentation; un cambio de controller podría abrir EXIT/RETURN públicos. |
| **Recomendación** | `@IsIn(['ENTRY'])` en el DTO. |
| **Prueba** | Body `type: EXIT` → 400 de validación. |

#### SEC-15 — Metacaracteres ILIKE en búsqueda de productos (lowStock)

| Campo | Detalle |
| --- | --- |
| **Severidad** | P3 |
| **Archivos** | `list-products.use-case.ts` L50–51 |
| **Evidencia** | `search` se interpola como valor parametrizado (sin SQLi), pero `%` / `_` del usuario alteran el patrón ILIKE. |
| **Impacto** | Resultados amplios / coste; no inyección. |
| **Recomendación** | Escapar `%` y `_` en el término. |

#### SEC-16 — CORS estático por env sin endurecimiento documentado

| Campo | Detalle |
| --- | --- |
| **Severidad** | P3 |
| **Archivos** | `src/main.ts` L11; `.env.example` |
| **Evidencia** | `origin: process.env.CORS_ORIGIN ?? 'http://localhost:4200'`. Tokens van en `Authorization` (no cookies) → riesgo CSRF clásico bajo. Un `CORS_ORIGIN=*` en prod ampliaría lectura browser-side. |
| **Recomendación** | Validar allowlist en bootstrap; documentar que no usar `*`. |

#### SEC-17 — Detalles de validación reenviados al cliente

| Campo | Detalle |
| --- | --- |
| **Severidad** | P3 |
| **Archivos** | `http-exception.filter.ts` L29–39 |
| **Evidencia** | `details` incluye el body completo de `HttpException` (mensajes class-validator). |
| **Impacto** | Reconocimiento de campos internos; habitual y aceptable si no hay secretos. |
| **Recomendación** | Sanitizar `details` en producción. |

#### SEC-18 — `unassign` `updateMany` sin filtro `businessId`

| Campo | Detalle |
| --- | --- |
| **Severidad** | P3 |
| **Archivos** | `unassign-vehicle.use-case.ts` L20–22 |
| **Evidencia** | `where: { fleetId, vehicleId, unassignedAt: null }` — flota ya validada por tenant. Defensa en profundidad incompleta vs `assign` (sí filtra `businessId`). |
| **Recomendación** | Añadir `businessId` al `where`. |

#### SEC-19 — TTL de access por defecto largo (8h)

| Campo | Detalle |
| --- | --- |
| **Severidad** | P3 (agrava SEC-02) |
| **Archivos** | `jwt.config.ts` L35–36 |
| **Recomendación** | 5–15 minutos en producción. |

#### SEC-20 — Access token sin claim `type: 'access'`

| Campo | Detalle |
| --- | --- |
| **Severidad** | P3 |
| **Archivos** | `session.issuer.ts` composeResponse; refresh sí usa `type: 'refresh'` |
| **Evidencia** | Hoy el refresh **no** pasa el Guard (falta `businessIds[]`). Añadir `type: 'access'` y rechazar otros tipos endurece el contrato. |
| **Recomendación** | Claim discriminador + assert en Guard. |

---

## 4. Controles verificados (positivos)

| Control | Estado | Evidencia |
| --- | --- | --- |
| Path/header tenant ≡ `activeBusinessId` | OK | `auth.guard.ts` L56–64; tests H-01 |
| Permisos por negocio activo (no mezcla A→B) | OK | `auth-tenancy.int.spec.ts` |
| Refresh hasheado (SHA-256), no plaintext | OK | `token-hash.ts`; `auth-sessions.int.spec.ts` |
| Rotación + reuso revoca familia | OK | `refresh-session.use-case.ts`; test reuso/concurrencia |
| Refresh no acepta `businessId` de body | OK | ValidationPipe + test L109–114 |
| Logout revoca familia de refresh | OK | `logout.use-case.ts` + test |
| JWT secret obligatorio / anti-placeholder | OK | `jwt.config.ts` + spec |
| Whitelist / forbidNonWhitelisted | OK | `main.ts` |
| Mass assignment de `stock`/`businessId` en PATCH product | Mitigado | `update-product.use-case.ts` + pipe |
| IDOR por UUID de otro tenant (CRUD revisado) | Mitigado | `findFirst({ id, businessId })` en get/update |
| H-02 / H-12 compatibilidad customer↔fleet | OK | ownership + int specs |
| SQL raw parametrizado | OK | tagged templates Prisma |
| Inventario `FOR UPDATE` | OK | `inventory-stock.service.ts` |
| Actor de auditoría desde JWT (`ctx.userId`) | OK | controllers mutadores |
| 500 sin stack al cliente | OK | `http-exception.filter.ts` |
| Password nunca en presenters | OK | presenters revisados |
| Endpoint EXIT público | No expuesto | solo ENTRY + ADJUSTMENT HTTP |

---

## 5. Validaciones H-01 y H-04

### H-01 — Aislamiento de permisos / negocio activo

| Chequeo | Resultado |
| --- | --- |
| `AuthGuard` usa solo `activeBusinessId` como tenant de request | **OK** — `ctx.businessId = payload.activeBusinessId` |
| Header distinto → `TENANT_ACCESS_DENIED` | **OK** — L59–60 |
| Path distinto → denegado aunque esté en `businessIds` | **OK** — L62–63; unit + int |
| Token A no opera path B con header B | **OK** — `auth-tenancy.int.spec.ts` |
| `switch-business` emite roles/permisos del destino | **OK** — SessionIssuer `loadMembership` + int test |
| Permisos de ADMIN en A no aplican como OPERATOR en B sin switch | **OK** — unit tests Guard |

**Regresión:** no observada en código ni tests actuales.

### H-04 — Sesiones y refresh

| Chequeo | Resultado |
| --- | --- |
| Persistencia de sesión | **OK** — `AuthRefreshSession` |
| Hash SHA-256 del refresh | **OK** |
| Rotación (anterior `revokedAt` + `replacedById`) | **OK** |
| Reutilización → revoca familia | **OK** |
| Logout → refresh inválido | **OK** |
| Negocio activo desde sesión persistida en refresh | **OK** — no desde cliente |
| Concurrencia de refresh | **OK** — `updateMany` claim + familia |

**Hueco residual (no regresión de H-04, sí ampliación):** SEC-04 (`switch-business` no cierra familia previa) y SEC-02 (access no va a denylist).

### H-02 / H-12 (respeto, sin reabrir)

Validación puntual: `assertSameCustomerAsFleet` en create/update vehicle, assign y update fleet con `FOR UPDATE`. Tests `vehicle-fleet-integrity.int.spec.ts` / `fleet-owner-integrity.int.spec.ts` presentes. Sin evidencia de regresión en esta auditoría.

---

## 6. Riesgos que no pudieron comprobarse

| Riesgo | Motivo |
| --- | --- |
| Explotación real en producción (JWT leak, CORS mal configurado en deploy) | Sin acceso a entorno/prod ni secretos reales |
| Efectividad de WAF / rate limit en edge | No hay proxy/infra en el repo (Compose solo Postgres) |
| Adjuntos / path traversal / SSRF / malware upload | Módulo attachments **no implementado** |
| IDOR en service orders / sales / users admin | Módulos HTTP ausentes |
| Privilege escalation vía futuro CRUD users | Contrato 01 describe endpoints; código no existe |
| Bypass por Prisma middleware / RLS Postgres | No hay RLS ni middleware tenant en Prisma |
| Secretos en CI/CD o logs de Better Stack | Config opcional; no se inspeccionó telemetría en vivo |
| Side-channel Argon2 parámetros | No se midió coste/params del hash en seed vs prod |
| Ejecución de `npm run test:int` en esta sesión | Evidencia tomada del **código de tests**; no se re-ejecutaron containers aquí |

---

## 7. Plan de corrección priorizado

### Fase 0 — Antes de exponer a Internet (P1)

1. **SEC-01** Rate limit + lockout en `/auth/login` (y techo en `/auth/refresh`).
2. **SEC-02** Reducir `JWT_EXPIRES_IN` y/o invalidar access en logout (denylist/`sid`) + revalidar user/membresía ACTIVE en Guard o en refresh-only con TTL corto.
3. **SEC-03 / SEC-10** Una sola fuente de permisos (`permissionsForRoles`); no persistir permisos editables por separado sin regeneración.

### Fase 1 — Endurecimiento multi-tenant (P2)

4. **SEC-05** `APP_GUARD` global + `@Public`.
5. **SEC-06** Tenant siempre desde `RequestContext.businessId`.
6. **SEC-04** Política de revocación en `switch-business` / “cerrar otras sesiones”.
7. **SEC-07** Plan de FK compuestas o triggers (alineado a H-07) antes de service orders.
8. **SEC-08** Eliminar full-table sort en memoria.
9. **SEC-09** Enforce `PRODUCT_INACTIVE` en operaciones nuevas manuales.

### Fase 2 — Hygiene (P3)

10. Helmet / headers (SEC-11), health split (SEC-12), timing login (SEC-13), DTO ENTRY-only (SEC-14), escape ILIKE (SEC-15), CORS allowlist assert (SEC-16), `businessId` en unassign (SEC-18), claim `type` en access (SEC-20).

### Fase 3 — Antes de attachments / orders

11. Threat model de uploads (tipo MIME, tamaño, virus scan, URLs firmadas, `entityType`/`entityId` con check de tenant).
12. Complete de orden: transacción atómica ya prevista; añadir checklist de authz (`orders.complete`) + locks de stock (ya en `InventoryStockService`).
13. Al implementar users/roles HTTP: tests de mass assignment (`permissions`, `businessId`, `passwordHash`) y de no-escalada cross-tenant.

### Criterios de salida sugeridos

- [ ] `npm run test:int` verde incluyendo auth-tenancy + auth-sessions.
- [ ] Nuevos tests para SEC-01/02/03 según se implementen.
- [ ] Ningún controller operativo sin Guard global o explícito.
- [ ] Documento de política de sesión (TTL, switch, logout, multi-dispositivo) aprobado.

---

## 8. Mapa rápido hallazgo → decisión

| ID | Sev | ¿Explotable hoy? | ¿Bloquea release interno demo? | ¿Bloquea exposición pública? |
| --- | --- | --- | --- | --- |
| SEC-01 | P1 | Sí (abuso auth) | No | **Sí** |
| SEC-02 | P1 | Sí (ventana post-logout/baja) | Condicional | **Sí** recomendado |
| SEC-03 | P1 | Condicional (DB/ops) | No | Mitigar antes de CRUD users |
| SEC-04…10 | P2 | Parcial / defensa | No | Planificar |
| SEC-11…20 | P3 | Bajo | No | Backlog |

---

*Fin del informe. No se modificó código de aplicación ni configuración; únicamente se añadió este documento.*
