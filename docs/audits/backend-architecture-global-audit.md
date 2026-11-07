# Auditoría arquitectónica global — KONTI Backend

| | |
| --- | --- |
| Repo | `back-fleet-management` (`konti-api`) |
| Fecha | 2026-11-05 |
| Rol | Arquitecto de software (solo lectura) |
| Stack | NestJS 12 · TypeScript strict · Prisma 6 · PostgreSQL 16 · Vitest + Testcontainers |
| Alcance | Calidad de código, capas, módulos, TX, dirección objetivo |
| Fuera | Implementación, migraciones, escritura en BD, H-07 Fase 6, reapertura de SEC/H-01…H-07 F0–F5 |

**Clasificación de observaciones**

| Etiqueta | Significado |
| --- | --- |
| **Problema comprobado** | Evidencia en código o tests |
| **Riesgo potencial** | Posible bajo crecimiento / Service Orders; no incidente hoy |
| **Preferencia de diseño** | Estilo; no bloquea |
| **Mejora opcional** | Valor bajo o diferible |

---

## A. Diagnóstico ejecutivo

KONTI backend es un **monolito modular NestJS bien orientado**: casos de uso explícitos, tenancy consistente, contratos HTTP respetados, errores tipados (`AppError`), auditoría append-only dentro de TX, y un núcleo de inventario (`InventoryStockService`) listo para ser reutilizado por Service Orders.

**No** es Clean Architecture / Hexagonal completo. Los módulos actuales son **legado pragmático**: `presentation → application (+ domain fino)`; Prisma vive en Application; **no** hay carpeta `infrastructure/` por feature. Las reglas del repo ya lo reconocen (`legado vs greenfield`) — y eso es una decisión correcta, no un defecto a “arreglar” con reescritura.

| Pregunta | Respuesta corta |
| --- | --- |
| ¿Qué tan bien está construido? | **Sólido para MVP operativo** (≈ 7.5/10). Mejor que un CRUD Nest típico; por debajo de un greenfield hexagonal estricto — a propósito. |
| ¿Qué conservar? | Use cases + `businessId`, `InventoryStockService.apply(tx?)`, `AppError`/filter, Audit en TX, lock-order, domain helpers puros, Vitest/int, DI Nest. |
| ¿Mayor deuda? | Prisma en Application (aceptable legado); fleets sin `domain/`; cross-import vehicles↔fleets; CRUD users/roles HTTP pendiente; Service Orders aún no existe (el riesgo real es **cómo** nacerá). |
| ¿Mejorar primero? | Estándar greenfield para SO + puerto de stock; endurecer frontera inventory; alinear presentación/errores menores; no reescribir CRUD. |
| ¿Qué de .NET adoptar? | SoC, Options tipadas (parcial), Exception Filter (ya), DI (Nest), tests por capa (parcial). |
| ¿Qué no necesitamos? | CQRS/Mediator, GenericRepository, Result en todo, interfaces por clase, microservicios. |

**Veredicto:** la arquitectura es **consistente con las reglas del propio repo**. El riesgo principal no es el legado actual, sino **contaminar Service Orders** con atajos Prisma o stock bypaseando `InventoryStockService`.

---

## B. Mapa arquitectónico actual

### B.1 Forma real

```text
src/
├── main.ts                    ValidationPipe global, prefix /api/v1, AppLogger
├── app.module.ts              wiring módulos + APP_FILTER
├── modules/
│   ├── identity/              presentation + application + domain (token-hash)
│   ├── customers/             presentation + application + domain
│   ├── vehicles/              presentation + application + domain
│   ├── fleets/                presentation + application   ← sin domain/
│   ├── products/              presentation + application + domain (sku)
│   ├── inventory/             presentation + application + domain (stock-math)
│   ├── audit/                 AuditService (plano; sin capas)
│   └── health/                HealthController suelto
└── shared/
    ├── authorization/         Guard, permisos, rate limit, access session
    ├── tenant/                RequestContext, decorator
    ├── database/              PrismaModule / PrismaService
    ├── errors/                HttpExceptionFilter
    ├── logging/               AppLogger + sinks
    ├── config/                JWT + rate-limit loaders
    └── common/                AppError, pagination, decimal
```

**Flujo típico de request**

```text
HTTP → ValidationPipe (DTO)
    → AuthGuard (JWT + family + membresía ACTIVE + permissionsForRoles)
    → Controller (permission + map DTO → input)
    → UseCase (reglas + Prisma.$transaction + AuditService)
    → Presenter → { data } | presentPage
```

### B.2 Capas: intención vs realidad

| Capa | Intención (.NET / Onion) | Realidad KONTI |
| --- | --- | --- |
| Presentation | Controllers, DTOs, filters | **Bien**: controllers delgados, `class-validator`, presenters, filter global |
| Application | Use cases / app services | **Bien**: un use case ≈ una intención; inputs tipados |
| Domain | Entidades, invariantes | **Fino y selectivo**: funciones/helpers puros (`customer-rules`, `ownership`, `mileage`, `stock-math`, `sku`) — no entidades ricas |
| Infrastructure | Prisma, JWT, storage | **Compartido** (`shared/database`, JwtModule); **no** adapters por módulo |

Prisma (`@prisma/client`, `PrismaService`, a menudo `Prisma.TransactionClient`) se usa **directamente en application**. Correcto bajo cláusula legado; **incorrecto** como plantilla para Service Orders.

### B.3 Cross-cutting que funciona

| Concern | Ubicación | Calidad |
| --- | --- | --- |
| Tenancy | path `businesses/:businessId` + Guard | Fuerte (H-01) |
| Autorización | `@RequirePermission` + permisos live | Fuerte (SEC-03) |
| Errores | `AppError` + `HttpExceptionFilter` | Bueno y uniforme |
| Paginación | `presentPage` → `{ data, meta }` | Consistente en listados |
| Auditoría | `AuditService.record(..., tx)` | Append-only en TX |
| Locks | `docs/lock-order.md` + FOR UPDATE | Documentado y aplicado en flotas/vehículos/stock |
| Logging | `AppLogger` (no Pino) | Infra lista; uso de negocio aún ligero |

---

## C. Evaluación por módulo

### C.1 Identity / Auth — **fuerte en seguridad; domain mínimo**

| | |
| --- | --- |
| Estructura | `presentation` (controller + DTOs inline) · `application` (login/refresh/logout/issuer/revoke) · `domain` (`token-hash`) |
| Fortalezas | Refresh rotativo + family revoke; rate limit; access revalidado; switch-business; tests int de tenancy/hardening |
| Problemas | DTOs de auth en el controller (no carpeta `dto/`); no hay API users/roles (contrato 01/18 pendiente) — **gap de producto**, no de capas |
| Oportunidad | Extraer DTOs; cuando exista admin de membresías, acoplar política de revoke (ver auditoría H-07 F6, **sin implementar**) |
| Tipo | Preferencia / gap producto |

### C.2 Customers — **referencia de legado bien hecho**

| | |
| --- | --- |
| Capas | presentation + application + domain (`customer-rules`, `display-name`) + specs unitarias |
| Fortalezas | Controller delgado; assert PERSON/COMPANY en domain; TX + audit; presenters; permisos |
| Problemas | Prisma en use case (legado aceptado) |
| Oportunidad | Ninguna urgente |
| Tipo | Conservar como plantilla de CRUD legado |

### C.3 Vehicles — **buen dominio; acoplado a flotas**

| | |
| --- | --- |
| Capas | presentation + application + domain (`ownership`, `mileage`, `plate`) |
| Fortalezas | Reglas de km/ownership testeadas; TX + FOR UPDATE; create con flota bajo lock |
| Problemas | `ownership` importado desde fleets (`assign-vehicle`) — dependencia de módulo a módulo vía domain (aceptable hoy; documentar como ACL ligera) |
| Oportunidad | Si crece ownership histórico, no meterlo en Prisma crudo del use case sin reglas |
| Tipo | Riesgo potencial bajo |

### C.4 Fleets — **application sólida; domain ausente**

| | |
| --- | --- |
| Capas | presentation + application **sin** `domain/` |
| Fortalezas | Assign/unassign con orden de locks; reparación de proyección (OC); update con FOR UPDATE; integridad cubierta por int tests |
| Problemas comprobados | Reglas de propietario viven en `vehicles/domain`; fleets no tiene helpers propios (p. ej. “flota solo COMPANY” está en use case / Errors) |
| Oportunidad | Extraer 1–2 funciones de dominio **solo si** se duplican; no inventar carpeta vacía |
| Tipo | Preferencia de diseño |

### C.5 Products — **CRUD claro; stock delegado**

| | |
| --- | --- |
| Capas | presentation + application + domain (`sku`) |
| Fortalezas | Importa `InventoryModule` y usa `InventoryStockService` en create (entry inicial) — **patrón correcto de frontera** |
| Problemas | Update/status siguen con Prisma directo (OK legado) |
| Oportunidad | Mantener la regla: **nadie escribe `products.stock` fuera de InventoryStockService** |
| Tipo | Conservar |

### C.6 Inventory — **pieza más “.NET Application Service” del repo**

| | |
| --- | --- |
| Capas | presentation + application (`InventoryStockService`, list) + domain (`stock-math`) |
| Fortalezas | Único escritor de stock; `apply(input, tx?)` para participar en TX externa; idempotencia `operationKey`; FOR UPDATE; exportado por módulo |
| Problemas | Sigue tipado con `Prisma.TransactionClient` en firma — acopla consumidores a Prisma (**riesgo** para greenfield SO si se propaga el tipo) |
| Oportunidad | Para SO: consumir `apply(..., tx)` vía puerto opaco o seguir pasando client Prisma **solo** desde infrastructure del módulo nuevo |
| Tipo | Problema comprobado (acoplamiento de tipo) · mejora P2 |

### C.7 Audit — **simple y correcto**

| | |
| --- | --- |
| Forma | `AuditService` plano + `AuditModule` export |
| Fortalezas | Misma TX que el use case; sin UPDATE/DELETE |
| Problemas | Sin controller de lectura (contrato 07 puede pedir listado después) |
| Tipo | Gap producto opcional |

### C.8 Health — **mínimo viable**

Controller en `modules/health` registrado en `AppModule`. Suficiente. No forzar capas.

### C.9 Shared — **el “kernel” estilo ASP.NET**

Equivalente conceptual a:

- Middleware/Filters → `HttpExceptionFilter`, `AuthGuard`
- Options → loaders en `shared/config` (JWT, rate limit) — **parcial Options Pattern**
- DI → Nest modules globales (`Prisma`, `Auth`, `Logging`, `Jwt`)

Fortaleza clara. Preferencia: tipar más configs con schemas validados al boot (hoy loaders ad hoc).

### C.10 Service Orders (pendiente) — **punto de inflexión**

No hay código. El contrato 06 exige complete atómico (stock + km + audit + orden). La dirección correcta está en §H: **greenfield con TX compartida** y stock vía `InventoryStockService.apply`.

---

## D. Comparación con buenas prácticas de .NET

| Principio / patrón .NET | ¿Aplicado? | ¿Correcto? | ¿Introducir? | Complejidad |
| --- | --- | --- | --- | --- |
| Separation of Concerns (Controller vs App) | Sí | Sí | Mantener | Baja |
| DI (constructor injection) | Sí (Nest) | Sí | Mantener | — |
| Clean Architecture / Onion deps | Parcial | OK legado; estricto solo greenfield | Sí en **nuevos** | Media |
| Hexagonal ports/adapters | No en módulos actuales | N/A | Solo si frontera real (stock, storage, TX) | Media |
| Use cases / Application Services | Sí | Sí | Mantener | — |
| Domain rich entities | No | Helpers puros bastan hoy | No forzar | Alta si se fuerza |
| Value Objects | Implícitos (plate, qty) | Suficiente | Solo si validación se duplica | Baja–media |
| Repository Pattern | No | Prisma es el acceso | **No** GenericRepo; repos tipados solo en greenfield si aportan | Media |
| CQRS / MediatR | No | Correcto no tenerlo | **No** | Alta |
| Result Pattern | No (`AppError` throw) | Adecuado a Nest + filter | No obligatorio | Media |
| Exception Filter | Sí | Sí | Mantener | — |
| Options Pattern | Parcial | Mejorable | Endurecer configs críticas | Baja |
| Structured logging | Infra sí; negocio poco | Parcial | Usar AppLogger en mutaciones críticas | Baja |
| Unit tests domain + int Testcontainers | Sí | Sí | Extender a SO | — |
| Unit of Work | Prisma `$transaction` | Pragmático | Puerto TX en greenfield SO | Media |
| Middleware pipeline | Nest guards/pipes | Sí | No reinventar | — |

**Traducción Nest ↔ .NET (útil para el equipo)**

| .NET | Nest / KONTI |
| --- | --- |
| Controller | `@Controller` |
| MediatR handler | `*UseCase` injectable |
| `IOptions<T>` | `ConfigModule` + loader tipado |
| ExceptionFilter | `HttpExceptionFilter` + `APP_FILTER` |
| `DbContext` + UoW | `PrismaService` + `$transaction` |
| FluentValidation | `class-validator` + `ValidationPipe` |
| Integration tests | Vitest + Testcontainers |

---

## E. Problemas priorizados

### P0 — bloqueante

**Ninguno** en la arquitectura actual para el perímetro implementado. La integridad operativa y auth críticas ya se endurecieron (H/SEC) y no se reabren aquí.

### P1 — importante (antes o al abrir Service Orders)

| ID | Evidencia | Problema | Impacto | Recomendación | Esfuerzo | Riesgo cambio |
| --- | --- | --- | --- | --- | --- | --- |
| **A-P1-01** | Contrato 06 pendiente; `InventoryStockService` exportado | SO puede nacer escribiendo stock/Prisma directo | Doble fuente de stock; regresiones H-03/idempotencia | Estándar escrito: complete llama `InventoryStockService.apply(tx)`; prohibido `product.update({ stock })` fuera | Bajo (política) + medio (impl SO) | Bajo si se hace al crear SO |
| **A-P1-02** | `inventory-stock.service.ts` firma `Prisma.TransactionClient` | Acopla greenfield a Prisma en Application | Contagia el anti-patrón a módulos nuevos | En SO: puerto TX / adapter; stock recibe client opaco o se invoca solo desde infra | Medio | Medio (refactor acotado) |
| **A-P1-03** | `docs/lock-order.md` reserva `service_orders` #1 | Complete Order sin respetar orden → deadlocks | Incidentes de concurrencia | Seguir lock-order al implementar; tests int de contención | Medio (con SO) | Medio |

### P2 — mejora necesaria (sin reescritura)

| ID | Evidencia | Problema | Impacto | Recomendación | Esfuerzo | Riesgo |
| --- | --- | --- | --- | --- | --- | --- |
| **A-P2-01** | `fleets/` sin `domain/` | Reglas repartidas / import desde vehicles | Mantenibilidad | Extraer helpers solo si hay duplicación real | Bajo | Bajo |
| **A-P2-02** | Auth DTOs en `auth.controller.ts` | Menos consistente que otros módulos | DX | Mover a `presentation/dto` | Bajo | Bajo |
| **A-P2-03** | AppLogger poco usado en use cases | Observabilidad de negocio débil | Debug prod | Log estructurado en mutaciones (sin PII/tokens) | Bajo | Bajo |
| **A-P2-04** | Config JWT/rate-limit loaders ad hoc | Fallos de config tardíos | Boot seguro | Validar env al arranque (Options-like) | Bajo–medio | Bajo |
| **A-P2-05** | CRUD users/roles HTTP ausente | Admin de membresía solo por seed/SQL | Operación | Implementar cuando el contrato 01/18 se priorice; ligar revoke (H-07 F6 audit) | Alto | Medio |
| **A-P2-06** | Cross-import `fleets → vehicles/domain/ownership` | Acoplamiento entre features | Fricción futura | Aceptar como shared-domain ligero o mover `ownership` a `shared/domain` **solo si** un 3.er módulo lo necesita | Bajo | Bajo |

### P3 — optimización opcional

| ID | Tema | Nota |
| --- | --- | --- |
| **A-P3-01** | Presenters vs serializers | Estilo OK; no unificar en un framework |
| **A-P3-02** | OpenAPI / Swagger | Útil para front; no bloquea arquitectura |
| **A-P3-03** | Result Pattern | `AppError` + filter cubre el caso Nest |
| **A-P3-04** | Lectura de audit logs HTTP | Cuando el contrato lo pida |
| **A-P3-05** | Observe / telemetría | Mencionado en AGENTS; opcional hasta producción |

**No clasificados como deuda a “arreglar”:** Prisma en Application de módulos actuales (legado aceptado); coexistencia FK simples + tenant (H-07); soft-delete membresía vs FK futura (Fase 6 pendiente).

---

## F. Elementos que debemos conservar

1. **Use case por intención** (`CreateX`, `AssignVehicle`, `RefreshSession`) — equivalente a Application Services .NET.
2. **Filtro estricto `businessId`** en lecturas/escrituras + Guard de path.
3. **`InventoryStockService` como único escritor de stock** + `apply(..., tx?)` + `operationKey`.
4. **`AuditService.record` dentro de la misma TX** que la mutación.
5. **`AppError` + `Errors.*` + `HttpExceptionFilter`** — contrato de error estable.
6. **`presentPage` / presenters** — forma HTTP estable para el front.
7. **Domain helpers puros + Vitest unit** donde hay invariantes (stock, mileage, customer type, ownership).
8. **Integración con Testcontainers** para caminos críticos (auth, flota, inventario, H-07).
9. **Lock-order documentado** y aplicado.
10. **Cláusula legado vs greenfield** en reglas Cursor — evita reescrituras vanidosas.
11. **Modular monolith** — un deploy, módulos Nest claros.
12. **Contratos en `docs/api-contracts/`** como fuente de verdad HTTP.

---

## G. Elementos que NO debemos implementar

| Anti-patrón | Por qué |
| --- | --- |
| GenericRepository / BaseRepository | Pierde semántica; Prisma ya abstrae SQL |
| Interface por cada use case | Ruido; Nest DI trabaja con clases concretas |
| CQRS + MediatR obligatorio | Un solo modelo de lectura/escritura basta en MVP |
| Microservicios / event bus | Complejidad operacional injustificada |
| Reescribir customers/vehicles/… a Hexagonal | Costo alto, beneficio bajo |
| Result\<T\> en todos los use cases | Choca con filter Nest; duplica `AppError` |
| Entidades de dominio ricas con Prisma entities | Duplicación y mapeo eterno |
| Carpeta `domain/` vacía “por simetría” | Viola proporcionalidad |
| Segundo logger (Pino) | `AppLogger` es canónico |
| Controllers gordos con Prisma | Ya evitado; no reintroducir |
| Escribir stock fuera de InventoryStockService | Rompe invariantes |

---

## H. Dirección arquitectónica objetivo

### H.1 Módulos existentes (legado)

```text
presentation → application → (domain helpers)
                 ↓
            PrismaService / $transaction
```

- Seguir así.
- Extraer a `domain/` solo reglas que se repiten o se testean solas.
- No añadir `infrastructure/` retrospectivo sin dolor real.

### H.2 Módulos nuevos (Service Orders, attachments, catalog, sales HTTP)

```text
presentation/     controllers, DTO, presenters
application/      use cases, inputs tipados, puertos (TX, stock, storage) si aportan
domain/           invariantes de orden/complete (puro, testeable sin Nest/Prisma)
infrastructure/   Prisma repos/adapters, UnitOfWork
```

Reglas:

1. Prisma **no** en Domain ni (idealmente) en Application tipado.
2. Complete Order = **una** TX; participantes reciben el mismo client/UoW.
3. Stock **solo** vía `InventoryStockService.apply`.
4. Km / flota respetan `docs/lock-order.md`.
5. FK tenant compuestas desde el día 1 (patrón H-07), no retrofit.
6. Exportar solo lo que otros módulos deben llamar (como `InventoryModule` exporta stock).

### H.3 Fronteras entre módulos

| Productor | Consumidor permitido | Mecanismo |
| --- | --- | --- |
| Inventory | Products, futuro SO/Sales | `InventoryStockService` exportado |
| Audit | Cualquier mutación | `AuditService` exportado |
| Vehicles domain ownership | Fleets | Import de función pura (OK) o shared si crece |
| Identity | Shared AuthGuard | Ya desacoplado vía JWT + sesiones |

Evitar: módulo A importando use cases internos de B “por comodidad”. Preferir servicio de aplicación exportado o puerto.

---

## I. Plan general de mejora (pocas iniciativas)

No una fase por hallazgo. Cuatro iniciativas coherentes:

### Iniciativa 1 — “Service Orders greenfield” (mayor impacto)

- Nacer con capas H.2.
- Complete atómico + stock port / `apply(tx)` + lock-order + audit + tests int.
- Cierra A-P1-01…03.

### Iniciativa 2 — “Frontera de inventario tipada” (soporte a 1)

- Reducir fuga de `Prisma.TransactionClient` hacia application de otros módulos (adapter/UoW en SO o wrapper mínimo).
- Documentar contrato de `ApplyStockInput` como API estable entre módulos.
- Cierra A-P1-02.

### Iniciativa 3 — “Higiene de presentación y ops” (bajo riesgo)

- DTOs auth en carpeta; validación de config al boot; logging en mutaciones clave.
- Cierra A-P2-02…04.

### Iniciativa 4 — “Admin de identidad” (producto, cuando toque)

- CRUD users/roles HTTP + política soft-delete membresía + revoke sesiones (coordina con H-07 F6 **tras** aprobación aparte).
- Cierra A-P2-05; no bloquea SO si el seed cubre demos.

**Fuera de este plan:** reescritura legado, CQRS, drop FK simples H-07, microservicios.

---

## J. Criterios arquitectónicos para el futuro

Checklist para PR / agentes (nuevos módulos o cambios estructurales):

1. ¿El controller solo valida HTTP, autoriza y llama un use case?
2. ¿Toda query/mutación operativa filtra `businessId` del contexto (no solo del body)?
3. ¿Las reglas de negocio testeables viven fuera de Prisma (domain puro) cuando no son triviales?
4. ¿Las mutaciones multi-recurso usan **una** TX?
5. ¿El stock pasa por `InventoryStockService`?
6. ¿Se respeta `docs/lock-order.md` si hay `FOR UPDATE`?
7. ¿La auditoría va en la misma TX cuando el contrato lo pide?
8. ¿Errores son `AppError` con código estable (no strings sueltos 500)?
9. ¿Respuestas alineadas a `presentPage` / presenter del módulo?
10. ¿Módulo **nuevo**? Prisma solo en infrastructure; no copiar el atajo legado sin justificación.
11. ¿Se evita GenericRepository, CQRS ornamental e interfaces vacías?
12. ¿Hay prueba unitaria de dominio y/o int proporcional al riesgo?
13. ¿Se actualizó contrato/`docs/INDEX.md` si cambió la API?
14. ¿No se reabrió H/SEC cerrado sin evidencia nueva?

---

## Respuestas explícitas (resultado esperado)

1. **¿Qué tan bien está construido?** Bien para un MVP multi-tenant serio: use cases claros, tenancy/auth fuertes, inventario y flotas con invariantes reales. Capas domain/infra incompletas a propósito en legado.
2. **¿Qué conservar?** Use cases, tenancy, stock service, audit-in-TX, AppError/filter, presenters, domain helpers + tests, lock-order, monolito modular, legado vs greenfield.
3. **¿Mayor deuda?** No el Prisma en CRUD legado; el **riesgo de contagio** a Service Orders y el tipado Prisma en la frontera de stock; fleets sin domain; admin users pendiente.
4. **¿Mejorar primero?** Estándar e implementación greenfield de Service Orders + frontera de stock/TX; higiene menor de DTOs/config/logging.
5. **¿Qué de .NET adoptar?** SoC, DI, Application Services, Exception Filters, Options tipadas, UoW en operaciones compuestas, tests por capa — **ya parcialmente presentes**.
6. **¿Qué no necesitamos?** CQRS/MediatR, GenericRepository, Result global, Hexagonal retrospectivo, microservicios, interfaces por clase.
7. **¿Cómo no deteriorar?** Criterios §J + reglas Cursor greenfield + code review enfocado en TX/stock/tenancy; no uniformar carpetas del legado por estética.

---

## Apéndice — Evidencia rápida de archivos

| Tema | Archivos |
| --- | --- |
| Wiring | `src/app.module.ts`, `src/main.ts` |
| Stock frontera | `src/modules/inventory/application/inventory-stock.service.ts`, `inventory.module.ts`, `products.module.ts` |
| Locks | `docs/lock-order.md`, `fleets/application/assign-vehicle.use-case.ts` |
| Errores | `src/shared/common/app-error.ts`, `src/shared/errors/http-exception.filter.ts` |
| Auth | `shared/authorization/*`, `identity/application/*` |
| Domain fino | `customers/domain/*`, `vehicles/domain/*`, `inventory/domain/stock-math.ts` |
| Reglas arch | `.cursor/rules/backend-architecture.mdc`, `docs/audits/architecture-rules-audit.md` |
| Estándar vigente (post-auditoría) | [`docs/architecture/backend-architecture-standard.md`](../architecture/backend-architecture-standard.md) |

**Detenido para revisión.** Sin correcciones de negocio. Estándar consolidado en `docs/architecture/` + reglas Cursor (2026-11-05).
