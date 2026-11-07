# Reglas Cursor — ubicación deprecada

**Fuente de verdad canónica:** [`.cursor/rules/`](../../.cursor/rules/)

| Archivo canónico | Rol |
| --- | --- |
| `.cursor/rules/backend-architecture.mdc` | Capas, legado vs greenfield, TX, tenancy, stock |
| `.cursor/rules/backend-development.mdc` | Stack (Vitest, AppLogger), convenciones, pruebas |
| `docs/architecture/backend-architecture-standard.md` | Narrativa + ejemplos (no enforce) |

Los `.mdc` de este directorio son **stubs de redirección** (`alwaysApply: false`). Cursor carga reglas desde `.cursor/rules/`.

Auditorías: [`docs/audits/backend-architecture-global-audit.md`](../../docs/audits/backend-architecture-global-audit.md) · [`docs/audits/architecture-rules-audit.md`](../../docs/audits/architecture-rules-audit.md).
