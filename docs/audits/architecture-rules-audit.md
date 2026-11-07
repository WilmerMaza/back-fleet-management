# Auditoría — Normalización de reglas de arquitectura Cursor (KONTI API)

| | |
| --- | --- |
| Repo | `back-fleet-management` (`konti-api`) |
| Fecha | 2026-11-04 |
| Agente | AGENTE 4 — Normalización de arquitectura y reglas Cursor |
| Alcance | Solo reglas Cursor + docs de arquitectura relacionadas |
| Código de negocio | **Sin cambios** (`src/*`, `prisma/*`, `package.json`, tests de negocio intactos) |

---

## 1. Estado inicial

### Ubicaciones

| Ruta | Estado previo |
| --- | --- |
| `cursor/rules/backend-architecture.mdc` | Existía (~357 líneas), `alwaysApply: true` |
| `cursor/rules/backend-development.mdc` | Existía (~254 líneas), **truncado** en §8 (`UpdateProductUse`) |
| `.cursor/rules/` | **No existía** en este repo |
| `docs/audits/` | **No existía** |

Cursor carga por convención **`.cursor/rules/`**. Las reglas vivían fuera del path canónico → riesgo de que agentes las ignoren (hallazgo H-RULES-01 en `AUDITORIA_H03_H07_SERVICE_ORDERS.md`).

### Stack real del repositorio (evidencia)

| Tema | Evidencia | Reglas previas |
| --- | --- | --- |
| Tests | `vitest.config.ts`, `npm test` → `vitest run` | Decían “Jest o el framework establecido” |
| Logging | `AppLogger` en `src/shared/logging/` | Citaban Pino |
| Nest / Prisma | NestJS 12, Prisma 6 | Parcialmente alineado |
| Capas en código | presentation + application + domain fino; **sin** `infrastructure/` en módulos actuales; Prisma en use cases | Exigían Prisma solo en Infrastructure **sin cláusula de legado** |

### Módulos existentes (legado)

`identity`, `customers`, `vehicles`, `fleets`, `products`, `inventory`, `audit`, `health` — Prisma/`Prisma.TransactionClient` en Application (decenas de imports). Sin carpeta `infrastructure/` por feature.

---

## 2. Reglas duplicadas, obsoletas y contradictorias

### Duplicación / fuentes de verdad

- Una sola pareja de reglas, pero en path **no canónico** → no había duplicado de contenido, sí **riesgo de divergencia futura** si alguien creaba `.cursor/rules/` aparte.
- `backend-development.mdc` estaba incompleto (corte a mitad de sección).

### Contradicciones detectadas

| ID | Tema | Conflicto | Resolución |
| --- | --- | --- | --- |
| C-01 | Runner de tests | Reglas: Jest opcional · Repo: Vitest | Vitest obligatorio en reglas |
| C-02 | Logging | Reglas: Pino · Repo: AppLogger | AppLogger canónico |
| C-03 | Prisma en Application | Reglas: prohibido absoluto · Código: uso generalizado en legado | Cláusula **legado vs greenfield** |
| C-04 | Hexagonal obligatorio | Reglas: ports/adapters para “todo módulo” · Acuerdo: Hexagonal en nuevos cuando aporte valor | Relajado + proporcionalidad |
| C-05 | Estructura de carpetas | Árbol completo (value-objects, interfaces, …) leído como obligatorio | “Crear solo lo que aporte valor” reforzado |
| C-06 | Paginación en docs vs código | `00-architecture.md` usa `items` · código usa `presentPage` → `{ data, meta }` | Reglas de desarrollo alineadas al helper real; nota de no inventar formatos |

### Alineación con decisiones de producto/arquitectura

Confirmado con `docs/AUDITORIA_H03_H07_SERVICE_ORDERS.md` §11–12 (F2) y acuerdos del enunciado:

- Modular monolith; no microservicios.
- Onion como regla de dependencias.
- Hexagonal en módulos nuevos cuando aporte valor.
- No GenericRepository; no interfaces por cada clase.
- No reescrituras masivas.

---

## 3. Cambios realizados

### Creados

| Archivo | Acción |
| --- | --- |
| `.cursor/rules/backend-architecture.mdc` | Contenido canónico normalizado + § legado vs greenfield + TX |
| `.cursor/rules/backend-development.mdc` | Contenido canónico completado + Vitest + AppLogger |
| `cursor/rules/README.md` | Aviso de deprecación y puntero |
| `docs/audits/architecture-rules-audit.md` | Este informe |

### Reemplazados (stubs, sin contenido normativo)

| Archivo | Acción |
| --- | --- |
| `cursor/rules/backend-architecture.mdc` | Stub `alwaysApply: false` → redirige a `.cursor/rules/` |
| `cursor/rules/backend-development.mdc` | Stub `alwaysApply: false` → redirige a `.cursor/rules/` |

### Documentación relacionada actualizada

| Archivo | Cambio |
| --- | --- |
| `AGENTS.md` | Path canónico, Vitest/AppLogger, legado vs greenfield |
| `docs/INDEX.md` | Entrada a rules + carpeta `audits/` |
| `docs/PLAN.md` | Stack Observabilidad/Tests; política legado/greenfield en §5 |
| `docs/AUDITORIA_TECNICA_BACKEND.md` | Path de estándares actualizado |
| `docs/AUDITORIA_H03_H07_SERVICE_ORDERS.md` | Fase F2 marcada como hecha |

### No modificado (restricción)

- `src/**`, `prisma/**`, `package.json`, migraciones, tests de negocio, configuración de runtime.

---

## 4. Ubicación canónica final

```text
.cursor/rules/backend-architecture.mdc   ← alwaysApply: true  (FUENTE DE VERDAD)
.cursor/rules/backend-development.mdc    ← alwaysApply: true  (FUENTE DE VERDAD)

cursor/rules/*.mdc                       ← alwaysApply: false (stubs)
cursor/rules/README.md                   ← explicación
```

**Cursor detecta reglas desde `.cursor/rules/`.** No deben existir dos cuerpos normativos activos.

---

## 5. Reglas legado vs greenfield (resumen)

### Módulos nuevos

- Capas: presentation → application → domain ← infrastructure.
- Prisma solo en Infrastructure.
- Sin tipos Prisma en Domain/Application.
- Puertos cuando haya TX compartida, límite de módulo o test double.
- Una TX de negocio compartida vía Unit of Work / Transaction Port.

### Módulos existentes

- No reescritura masiva ni migración obligatoria.
- Prisma en Application permanece aceptado.
- Refactor solo con justificación concreta.
- Al consumir legado desde un módulo nuevo: adapter/port en el borde del nuevo, sin duplicar lógica.

---

## 6. Alineación con Vitest y AppLogger

| Antes | Después |
| --- | --- |
| “Jest o el framework establecido” | **Vitest** unit + int; imports desde `vitest` |
| “Pino para logging, si está configurado” | **`AppLogger`**; prohibido logger paralelo tipo Pino |

`docs/PLAN.md` §3.2 actualizado en el mismo sentido para no contradecir las reglas.

---

## 7. Decisiones de arquitectura (fijadas en reglas)

1. **Monolito modular** — sí. Microservicios — no.
2. **Onion** — dirección de dependencias obligatoria.
3. **Hexagonal** — módulos nuevos / bordes con valor; no big-bang.
4. **TX** — una por operación de negocio; Application greenfield no ve `Prisma.TransactionClient`.
5. **Patrones** — Repository, UoW, Domain Service, Adapter, Strategy, Factory solo con necesidad.
6. **Anti-patrones** — GenericRepository, interface-per-class, abstracciones prematuras, event bus innecesario.
7. **Proporcionalidad** — CRUD simple ≠ diez capas vacías; operaciones críticas sí separan reglas/TX.
8. **Fuente única** — `.cursor/rules/`; `cursor/rules/` deprecado.

---

## 8. Archivos afectados (checklist)

```text
.cursor/rules/backend-architecture.mdc          (nuevo)
.cursor/rules/backend-development.mdc           (nuevo)
cursor/rules/backend-architecture.mdc           (stub)
cursor/rules/backend-development.mdc            (stub)
cursor/rules/README.md                          (nuevo)
docs/audits/architecture-rules-audit.md         (nuevo)
AGENTS.md                                       (editado)
docs/INDEX.md                                   (editado)
docs/PLAN.md                                    (editado)
docs/AUDITORIA_TECNICA_BACKEND.md               (editado, path)
docs/AUDITORIA_H03_H07_SERVICE_ORDERS.md        (editado, F2)
```

---

## 9. Validación

| Criterio | Resultado |
| --- | --- |
| Cursor puede cargar desde `.cursor/rules/` | Sí — directorio y frontmatter `alwaysApply: true` |
| Sin dos fuentes normativas activas | Sí — stubs antiguos con `alwaysApply: false` |
| No exigen reescritura masiva | Sí — § legado explícito |
| Compatibles con el repo actual | Sí — Vitest, AppLogger, Prisma-en-Application legado |
| Sin cambios de código de negocio | Sí |

### Comprobación post-cambio (filesystem)

```text
.cursor/rules/     → 2 .mdc canónicos
cursor/rules/      → 2 stubs + README
docs/audits/       → architecture-rules-audit.md
```

---

## 10. Seguimiento opcional (fuera de este agente)

- Eliminar por completo `cursor/rules/` en un PR posterior si el equipo confirma que nadie enlaza esa ruta.
- Alinear el ejemplo de paginación en `docs/api-contracts/00-architecture.md` con `presentPage` (contrato vs implementación) en un ticket de contratos.
- Al implementar Service Orders: aplicar reglas greenfield (fase F4–F5 de la auditoría H-03/H-07).
