# Estándar arquitectónico backend — KONTI

| | |
| --- | --- |
| Estado | Vigente (2026-11-05) |
| Audiencia | Ingenieros y agentes que implementan o revisan el API |
| Reglas Cursor (enforce) | [`.cursor/rules/backend-architecture.mdc`](../../.cursor/rules/backend-architecture.mdc) · [`.cursor/rules/backend-development.mdc`](../../.cursor/rules/backend-development.mdc) |
| Auditoría de origen | [`docs/audits/backend-architecture-global-audit.md`](../audits/backend-architecture-global-audit.md) |
| Stack / plan | [`docs/PLAN.md`](../PLAN.md) · [`docs/INDEX.md`](../INDEX.md) |

Este documento es la **narrativa y guía de diseño**. Las reglas `.mdc` son el checklist corto que los agentes deben cumplir. No duplicar párrafos enteros en `AGENTS.md`.

---

## 1. Principios

1. **Monolito modular NestJS** — un deploy; módulos por dominio.
2. **Dependencias hacia el interior** (Onion) — Domain no conoce frameworks.
3. **Proporcionalidad** — la complejidad de capas debe justificar el problema.
4. **Legado ≠ greenfield** — no reescribir módulos estables por uniformidad.
5. **Contratos HTTP** en `docs/api-contracts/` mandan sobre inventos de shape.
6. Inspiración .NET (SoC, Application Services, DI, Exception Filters, UoW) **adaptada a Nest**, no copiada literalmente.

---

## 2. Legado vs greenfield

| | LEGACY (módulos actuales) | GREENFIELD (módulos nuevos) |
| --- | --- | --- |
| Ejemplos | `identity`, `customers`, `vehicles`, `fleets`, `products`, `inventory`, `audit`, `health` | Service Orders, attachments, service catalog, sales HTTP, … |
| Prisma | Permitido en Application | **Solo** en Infrastructure |
| Tipos `Prisma.*` / `TransactionClient` | OK en Application del módulo | Prohibidos en Domain y Application |
| Carpetas | `presentation` + `application` + `domain` opcional; sin `infrastructure/` | Capas reales cuando aporten valor |
| Refactor | Solo por dolor demostrado | Nacer con el estándar |
| Consumir legado | — | Port/adapter en el **borde del módulo nuevo**; no reescribir el legado |

Al tocar un use case legado: preservar el estilo del módulo salvo que el ticket pida extraer un puerto.

---

## 3. Responsabilidades por capa (greenfield)

### 3.1 Presentation

| Incluye | No incluye |
| --- | --- |
| Controllers Nest | Reglas de negocio |
| DTOs + `class-validator` | Prisma / SQL |
| Guards / permisos de ruta | Abrir transacciones |
| Mapear DTO → input de use case | Orquestar varios módulos |
| Presenters (`presentX`, `presentPage`) | Lógica de stock / km / ownership |

Equivalente .NET: Controllers + FluentValidation + Authorization filters.

### 3.2 Application

| Incluye | No incluye |
| --- | --- |
| Use cases (una intención clara) | Detalles de SQL/Prisma |
| Inputs/outputs tipados (no DTO HTTP) | Tipos generados de Prisma |
| Orquestación y precondiciones | Reglas HTTP (status codes ad hoc) |
| Puertos cuando hay frontera real | Controllers |
| Abrir/coordinar TX vía puerto (UoW) | |

Equivalente .NET: Application Services / handlers (sin MediatR obligatorio).

### 3.3 Domain

| Incluye | No incluye |
| --- | --- |
| Invariantes y políticas | NestJS (`@Injectable`, etc.) |
| Funciones/helpers puros o entidades con comportamiento real | Prisma / `@prisma/client` |
| Value Objects **si** aportan validación/semántica | HTTP, JWT, logging de infra |
| Excepciones/errores de dominio mapeables a `AppError` | |

Debe poder probarse con Vitest **sin** Nest ni PostgreSQL.

No crear entidades “ricas” artificiales ni carpetas `domain/` vacías.

### 3.4 Infrastructure

| Incluye | No incluye |
| --- | --- |
| Prisma client / repos concretos | Reglas de negocio |
| Adaptadores de puertos | Controllers |
| Unit of Work (encapsula `$transaction`) | DTO HTTP |
| Storage, JWT adapters, integraciones | |

Encapsula `Prisma.TransactionClient`. Application greenfield no lo importa.

---

## 4. Estructura de módulo

### 4.1 Greenfield (cuando la complejidad lo justifica)

```text
src/modules/<feature>/
├── presentation/
│   ├── <feature>.controller.ts
│   ├── dto/
│   └── <feature>.presenter.ts
├── application/
│   ├── <verb>-<noun>.use-case.ts
│   ├── ports/                    # solo si hay consumidores/adapters reales
│   └── ...
├── domain/
│   └── ...                       # solo reglas con valor de prueba
├── infrastructure/
│   ├── persistence/
│   └── ...
└── <feature>.module.ts
```

### 4.2 Módulo simple (proporcional)

Un CRUD sin invariantes complejos puede vivir con:

```text
presentation/ + application/ (+ domain/helpers si hay asserts)
```

sin `infrastructure/` ni puertos — **solo en legado** o greenfield trivial de lectura. Cualquier greenfield que persista estado de negocio multi-recurso debe aislar Prisma.

### 4.3 Shared

`src/shared/`: `tenant`, `authorization`, `database`, `logging`, `errors`, `common`, `config`. No meter reglas de un dominio de negocio aquí salvo helpers realmente transversales.

---

## 5. Flujo de dependencias

```text
HTTP
  → Presentation (DTO, Guard, Presenter)
      → Application UseCase (input tipado)
          → Domain (invariantes)
          → Ports (Repository, TransactionPort, StockPort, …)
              ↑
Infrastructure implementa ports (Prisma, UoW, adapters)
```

```text
Incorrecto (greenfield):
  UseCase → PrismaService / Prisma.TransactionClient

Correcto (legado actual):
  UseCase → PrismaService   // aceptado solo en módulos listados como legado

Correcto (greenfield → legado):
  ServiceOrders UseCase → StockPort (app)
       ↑
  Adapter llama InventoryStockService.apply(input, txClient)
  (el tipo Prisma queda detrás del adapter / UoW)
```

---

## 6. Transacciones y multi-módulo

### 6.1 Reglas

1. Toda operación de negocio multi-recurso tiene **un límite TX explícito**.
2. Una sola transacción PostgreSQL compartida por los participantes de esa unidad de trabajo.
3. Prohibido que cada módulo abra su propia `$transaction` anidada independiente para la misma intención de negocio.
4. Fallo parcial → rollback total de esa unidad.
5. **Greenfield:** Application abre TX vía `UnitOfWork` / `TransactionPort` opaco; no importa `Prisma.TransactionClient`.
6. **Legado:** puede usar `prisma.$transaction` como hoy.
7. Respetar [`docs/lock-order.md`](../lock-order.md) al adquirir `FOR UPDATE`.
8. Auditoría append-only (`AuditService.record`) en la **misma** TX cuando el contrato lo pida.
9. Stock: **únicamente** `InventoryStockService.apply` (nunca `product.update({ stock })`).

### 6.2 Caso de referencia — inventario (sin cambiar implementación)

Hoy `InventoryStockService` (legado):

- Es el **único escritor** de `products.stock`.
- Expone `apply(input, tx?)`: si recibe `tx`, participa; si no, abre TX propia.
- Idempotencia vía `operationKey`.
- Exportado por `InventoryModule` (p. ej. `CreateProductUseCase` ya lo consume).

**Para Service Orders (futuro):** el use case de complete debe:

1. Abrir una TX (UoW greenfield).
2. Bloquear recursos en orden (`service_orders` → … → `products` según lock-order).
3. Llamar stock a través de la frontera acordada (`apply` con el client de esa TX, vía adapter si Application no ve Prisma).
4. Registrar audit en la misma TX.
5. Commit único.

No introducir abstracciones nuevas sobre stock **hasta** que SO (u otro consumidor) las necesite de verdad. Documentar `ApplyStockInput` como contrato estable entre módulos.

### 6.3 Ejemplo conceptual (complete order)

```text
CompleteServiceOrderUseCase.execute(input)
  └─ uow.run(async (tx) => {
       lock order (FOR UPDATE)
       domain: transición OPEN → COMPLETED
       stock.apply({ …, operationKey }, tx)   // misma TX
       mileage / satélites
       audit.record(…, tx)
     })
```

---

## 7. Tenancy, auth y errores

- Tenant = `Business`. `Customer` = cliente del taller.
- Filtrar siempre por `businessId` del **contexto** (Guard / path), no solo body.
- Autenticación ≠ autorización; permisos en backend (`AuthGuard` + `@RequirePermission`).
- Errores de negocio: `AppError` / `Errors.*` → `HttpExceptionFilter`.
- Listados: `presentPage` → `{ data, meta }`.
- Prohibido `oil_changes`; servicios genéricos; evidencias polimórficas (`entityType` + `entityId`).

---

## 8. Patrones: usar vs evitar

| Usar (con necesidad) | Evitar |
| --- | --- |
| Use case por intención | CQRS / MediatR obligatorio |
| Repository por agregado (greenfield) | GenericRepository / BaseRepository |
| Unit of Work / Transaction Port | Interface por cada clase |
| Adapter (ACL) hacia legado | Event bus / microservicios |
| Domain helpers / VO con valor | Entidades ricas artificiales |
| `AppError` + filter | Result\<T\> obligatorio en todos los UC |
| Export de servicio de frontera (`InventoryStockService`) | Importar use cases internos ajenos “por comodidad” |

---

## 9. Pruebas

| Tipo | Alcance |
| --- | --- |
| Unit (Vitest) | Domain puro; helpers |
| Unit | Use cases con doubles de puertos (greenfield) |
| Integración | TX, tenancy, permisos, idempotencia (`npm run test:int` + Testcontainers) |

Proporcional al riesgo. Importar desde `vitest`, no Jest.

---

## 10. Checklist de PR (módulos nuevos o cambios estructurales)

1. Controller solo HTTP + auth + map a use case.
2. Filtro `businessId` de contexto en lecturas/escrituras.
3. Reglas testeables fuera de Prisma cuando no sean triviales.
4. Mutaciones multi-recurso = una TX.
5. Stock solo vía `InventoryStockService`.
6. `docs/lock-order.md` respetado si hay `FOR UPDATE`.
7. Auditoría en la misma TX si el contrato lo pide.
8. Errores `AppError` con códigos estables.
9. Respuestas alineadas a presenter / `presentPage`.
10. Greenfield: Prisma solo en infrastructure.
11. Sin GenericRepository, CQRS ornamental ni interfaces vacías.
12. Tests proporcionales.
13. Contrato / `docs/INDEX.md` actualizados si cambió la API.
14. No reabrir H/SEC cerrados sin evidencia nueva.

---

## 11. Mapa de fuentes (evitar repetición)

| Tema | Dónde vive |
| --- | --- |
| Reglas enforce agentes | `.cursor/rules/*.mdc` |
| Narrativa + ejemplos (este doc) | `docs/architecture/backend-architecture-standard.md` |
| Entrada agentes | `AGENTS.md` + `docs/INDEX.md` |
| Diagnóstico histórico | `docs/audits/backend-architecture-global-audit.md` |
| Locks | `docs/lock-order.md` |
| Constraints SQL | `docs/db-constraints.md` |
| Contratos HTTP | `docs/api-contracts/` |

Ante conflicto código legado ↔ regla greenfield: **gana la cláusula legado** (§2) hasta extracción justificada.
