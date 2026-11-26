# ADR-001 — Sale y CommercialDocument como agregados separados

| | |
| --- | --- |
| Fecha | 2026-11-16 |
| Estado | Aceptada (diseño Lote 5A) |
| Contexto | [12-lote-5a-modelo-comercial](./12-lote-5a-modelo-comercial.md), [11](./11-preparacion-facturacion-electronica.md), DT-07 / DT-08 |

## Contexto

KONTI necesita:

1. Vender productos en mostrador (con efecto de inventario al confirmar).
2. Cobrar (internamente) conceptos originados en una orden de trabajo ya completada.
3. Preparar datos para facturación electrónica futura **sin** emitir DIAN ahora.

El mock FE ya modela `Sale` con líneas, pagos, moneda en minor units y `billing: NOT_REQUESTED`. El doc 11 exige un **documento comercial** distinto del electrónico y distinto del movimiento de inventario. DT-07 prohíbe que la orden cree una venta implícita.

## Decisión

Mantener **dos agregados**:

1. **`Sale`** — operación comercial de **venta directa**. Dueña del ciclo borrador → confirmada → cancelada, de los pagos del corte actual y de la solicitud de `EXIT`/`RETURN` vía `InventoryStockService`.
2. **`CommercialDocument`** — documento que consolida líneas cobrables con snapshots. Puede originarse en `SALE` o en `SERVICE_ORDER`. No mueve inventario. Emisión interna (`ISSUED`) ≠ DIAN.

La capa electrónica (PT/CUFE/XML) queda **fuera** de ambos y leerá documentos `ISSUED`.

## Alternativas consideradas

### A. Solo `CommercialDocument` (con `source=DIRECT|ORDER`)

- **Pros:** un solo modelo de cobro.
- **Contras:** mezcla confirmación de stock/pagos con documento inmutable; o bien el documento “directo” tendría que reinventar todo el ciclo de `Sale`. Duplica conceptos ya estables en contrato 17.

### B. Siempre crear un `Sale` al completar la orden

- **Pros:** un solo origen hacia el documento.
- **Contras:** viola DT-07; riesgo de **doble descuento** (consumo de orden + EXIT de venta); obliga a precios de servicio dentro de Sale sin FE-04.

### C. Embebido `Sale.billing` como documento definitivo

- **Pros:** cero tablas nuevas a corto plazo.
- **Contras:** no cubre cobro desde orden; mezcla operación y documento; campos DIAN terminarían hinchando `Sale`.

## Consecuencias

- Persistencia 5B: tablas de venta **y** de documento.
- Unicidad: un documento activo por `(businessId, sourceType, sourceId)`.
- `complete()` de orden **no** crea Sale ni CommercialDocument.
- Front: Repository separado; mock de documento no escribe stock.
- `Sale.billing` del mock se depreca en favor de `commercialDocumentId`.

## No decisiones (explícitas)

- Precio de `ServiceType` (FE-04 / DT-04).
- Anulación con nota crédito vs reversa de stock (FE-05 / DT-08).
- Numeración DIAN / resoluciones (FE-06).
