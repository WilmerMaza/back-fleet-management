# Arquitectura comercial — KONTI

Auditoría de descubrimiento del **2026-11-02**. Describe el código y los contratos que existen hoy, y una propuesta para evolucionar catálogo, inventario, ventas, órdenes, autorizaciones y documentos comerciales.

No sustituye los contratos vigentes de `docs/api-contracts/`. Esos archivos siguen siendo el contrato del núcleo operativo. Lo propuesto aquí está marcado como **pendiente** y no está implementado.

## Cómo leerlo

| Documento                                                            | Para qué                                                                     |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| [01-auditoria-arquitectura.md](./01-auditoria-arquitectura.md)       | Mapa del sistema actual: rutas, modelos, repositorios, mock vs HTTP, pruebas |
| [02-mapa-entidades.md](./02-mapa-entidades.md)                       | Entidades que existen y las que faltan                                       |
| [03-diagrama-procesos.md](./03-diagrama-procesos.md)                 | Flujos reales y flujo objetivo                                               |
| [04-matriz-compatibilidad.md](./04-matriz-compatibilidad.md)         | Decisiones de negocio contra el código                                       |
| [05-contratos-pendientes.md](./05-contratos-pendientes.md)           | Huecos frente a los contratos actuales y operaciones propuestas              |
| [06-decisiones-tecnicas.md](./06-decisiones-tecnicas.md)             | Decisiones de esta auditoría (aún no implementadas)                          |
| [07-plan-implementacion.md](./07-plan-implementacion.md)             | Orden de trabajo por dependencia y riesgo                                    |
| [08-riesgos-migraciones.md](./08-riesgos-migraciones.md)             | Riesgos, compatibilidad de mocks y migración                                 |
| [09-sugerencias-implementadas.md](./09-sugerencias-implementadas.md) | Corte implementado: sugerencias, líneas y autorización en el mock            |
| [10-ventas-directas.md](./10-ventas-directas.md)                     | Corte implementado: venta directa, pago e inventario en el mock              |
| [11-preparacion-facturacion-electronica.md](./11-preparacion-facturacion-electronica.md) | Preparación de datos/arquitectura para FE Colombia (sin DIAN) |
| [12-lote-5a-modelo-comercial.md](./12-lote-5a-modelo-comercial.md) | **Lote 5A:** diseño Sale vs CommercialDocument, ER, estados, moneda, órdenes |
| [ADR-001-sale-vs-commercial-document.md](./ADR-001-sale-vs-commercial-document.md) | Decisión: dos agregados separados |

## Veredicto corto

KONTI es un frontend Angular 22 con API Nest en progreso. Hay clientes, vehículos, flotas, catálogo de **tipos de servicio**, órdenes (mock/HTTP), productos con stock, movimientos de inventario, evidencias y auditoría. La venta directa existe en el mock ([10-ventas-directas.md](./10-ventas-directas.md)). El **documento comercial** está diseñado en [12](./12-lote-5a-modelo-comercial.md) (sin migrar). La facturación electrónica **no** está implementada; restricciones en [11](./11-preparacion-facturacion-electronica.md).

El cierre de una orden, en el mock, descuenta stock, actualiza kilometraje y programa mantenimiento. En la fecha de la auditoría ese cierre no guardaba precio histórico y trataba todo el uso como consumido. El corte de [09-sugerencias-implementadas.md](./09-sugerencias-implementadas.md) añade precio copiado, cantidades separadas y autorización de servicios adicionales. La venta directa es otro agregado y no se genera al cerrar la orden. Los documentos de `/app/documents` son SOAT, RTM y seguros.

## Fuentes revisadas

- `design-system/MASTER.md`, `design-system/DESIGN.md`, `design-system/screens/DECISIONS.md`
- `docs/domain-model.md`, `docs/PLAN_EJECUCION_COMPLETO.md`, `docs/api-contracts/`
- [`docs/estrategia/`](../estrategia/README.md) — visión de líneas de negocio (Gestión / Comercio / Conecta / Inteligencia); no autoriza implementación
- `docs/codebase/INDEX.md` (índice generado el 2026-10-27; las relaciones críticas se confirmaron en el código)
- `src/app/features/`, `src/app/core/`, `src/app/data-access/`
- Búsqueda de backend, migraciones y `HttpRepository`: no hay implementación
