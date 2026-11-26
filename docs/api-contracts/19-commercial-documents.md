# 19 — Documentos comerciales (propuesto · Lote 5A)

| | |
| --- | --- |
| Estado | **Propuesto** — no implementado en HTTP ni Prisma |
| Diseño | [`arquitectura-comercial/12-lote-5a-modelo-comercial.md`](../arquitectura-comercial/12-lote-5a-modelo-comercial.md) |
| ADR | [`ADR-001`](../arquitectura-comercial/ADR-001-sale-vs-commercial-document.md) |
| Relacionados | [17-sales](./17-sales.md), [06-service-orders](./06-service-orders.md), [11-FE](../arquitectura-comercial/11-preparacion-facturacion-electronica.md) |

Documento comercial **interno** (borrador / emitido). No es factura electrónica, no es `VehicleDocument`, no mueve inventario.

---

## Recursos

Prefijo: `/api/v1/businesses/{businessId}/commercial-documents`

| Método | Ruta | Intención |
| --- | --- | --- |
| `GET` | `/` | Listar (`status`, `sourceType`, `customerId`, `from`, `to`, page) |
| `GET` | `/{id}` | Detalle + líneas |
| `POST` | `/` | Preparar borrador desde origen |
| `POST` | `/{id}/issue` | Emitir internamente (`DRAFT` → `ISSUED`) |
| `POST` | `/{id}/void` | Anular (`DRAFT`\|`ISSUED` → `VOIDED`) |

Permisos tentativos: `nav.billing` / `billing.prepare` / `billing.issue` / `billing.void` (nombres finales en 5B con mapa de roles).

---

## POST preparar — body

```json
{
  "sourceType": "SALE",
  "sourceId": "uuid",
  "prepareOperationId": "idempotency-key"
}
```

o `"sourceType": "SERVICE_ORDER"`.

### Reglas

- `SALE`: solo si `status === CONFIRMED`.
- `SERVICE_ORDER`: solo si `status === COMPLETED`.
- Rechazar si ya existe documento `DRAFT` o `ISSUED` para el mismo origen (409).
- Idempotencia: mismo `prepareOperationId` + negocio → mismo documento.
- **No** llamar a inventario.
- Líneas desde snapshots del origen (no catálogo vivo).
- Impuestos: `taxConfigured: false`, `taxAmountMinor: 0` hasta tarifa real (doc 11).
- Servicios en líneas solo si producto aprueba FE-04; si no, omitir o 422 con código claro.

### Respuesta (esqueleto)

```json
{
  "id": "uuid",
  "businessId": "uuid",
  "documentNumber": "CD-2026-0001",
  "status": "DRAFT",
  "sourceType": "SERVICE_ORDER",
  "sourceId": "uuid",
  "customerId": "uuid",
  "customer": {
    "displayName": "…",
    "identificationType": "NIT",
    "identificationNumber": "…",
    "verificationDigit": "1",
    "address": "…",
    "email": "…",
    "phone": "…",
    "municipality": "…",
    "department": "…"
  },
  "currencyCode": "COP",
  "currencyScale": 0,
  "lines": [
    {
      "id": "uuid",
      "lineType": "PRODUCT",
      "sku": "ACE01",
      "description": "ACEITE 5W30",
      "unit": "L",
      "quantityMillis": 4000,
      "unitPriceMinor": 45000,
      "discountMinor": 0,
      "taxAmountMinor": 0,
      "lineTotalMinor": 180000,
      "sourceLineId": "uuid",
      "productId": "uuid"
    }
  ],
  "subtotalMinor": 180000,
  "discountMinor": 0,
  "taxAmountMinor": 0,
  "totalMinor": 180000,
  "taxConfigured": false,
  "createdAt": "…",
  "updatedAt": "…"
}
```

Dinero: enteros minor + `currencyScale` (igual que [17](./17-sales.md)). Cantidades: milésimas.

---

## Issue / Void

- `POST /{id}/issue` — congela líneas; set `issuedAt`. Idempotente por `issueOperationId`.
- `POST /{id}/void` — body `{ "note": "…", "voidOperationId": "…" }`. No reversa stock. Nota crédito DIAN = fuera de alcance.

---

## Estados

`DRAFT` → `ISSUED` → `VOIDED`  
`DRAFT` → `VOIDED`

No estados DIAN (`PENDING`, `ACCEPTED`, …).

---

## Multi-tenant

Todo filtrado por `businessId` de contexto. FKs compuestas al migrar. Sin referencias cruzadas entre negocios.

---

## Fuera de este contrato

- CUFE, XML, PDF fiscal, PT, resoluciones.
- IVA / tarifas.
- Cuentas por cobrar.
- Precio de mano de obra sin FE-04.
- Modificar `complete` de órdenes o reglas de `InventoryStockService`.
