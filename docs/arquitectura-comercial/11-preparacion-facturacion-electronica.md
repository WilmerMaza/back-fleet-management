# 11 — Preparación arquitectónica para facturación electrónica

| | |
| --- | --- |
| Fecha | 2026-11-15 |
| Estado | Preparación (sin emisión DIAN) |
| Alcance | Datos comerciales/fiscales mínimos + separación de responsabilidades |
| No incluye | Emisión, proveedor tecnológico, IVA inventado, contabilidad, valoración de stock |

Complementa [README](./README.md), [06-decisiones-tecnicas](./06-decisiones-tecnicas.md) y [10-ventas-directas](./10-ventas-directas.md). No sustituye `docs/api-contracts/`.

---

## 0. Restricciones arquitectónicas (obligatorias)

1. Respetar los modelos y contratos actuales.
2. Utilizar `salePrice` como precio comercial del producto, diferenciándolo del stock y del costo.
3. Revisar el mapeo existente entre `price` del frontend y `salePrice` de la API antes de tocar contratos.
4. Exponer el precio de venta en la ficha del producto cuando corresponda al alcance aprobado (DT-04 producto).
5. Conservar cantidades decimales y precisión de API `Decimal(14,3)` (cantidades/stock); precio comercial en API usa escala monetaria aparte (`Decimal` de venta).
6. Mantener la unidad actual (`unit` texto) sin inventar códigos DIAN.
7. No agregar tarifas de IVA ni clasificación tributaria inventada.
8. No implementar costos ni valoración monetaria del inventario.
9. Mantener separados los movimientos de inventario y los documentos comerciales.
10. No modificar órdenes para convertirlas automáticamente en facturas.
11. No modificar catálogos actuales para reescribir operaciones históricas.
12. Preparar la futura utilización de snapshots comerciales sin implementar todavía el motor de facturación.

**Antes de cambiar modelo o contratos:** identificar si la información ya existe y documentar el cambio aquí o en el contrato. Los campos tributarios pendientes (FE-01…FE-07) permanecen pendientes hasta decisión validada.

### Cumplimiento actual (mapeo precio)

| Capa | Campo | Notas |
| --- | --- | --- |
| API / Prisma | `salePrice` | Precio comercial; distinto de `stock` / `minStock` |
| Front modelo / mock | `price?` | Alias de UI; **no** es costo |
| Adapter HTTP | `InventoryHttpRepository` | `payload.price` → `salePrice`; `dto.salePrice` → `price` |
| Formulario producto | `price` (sección comercial) | Alta + edición; opcional; preview COP |
| Front `cost?` | modelo | No persistido en Prisma; no usar para FE ni valoración |

---

## 1. Objetivo

Cuando KONTI integre un proveedor tecnológico ante la DIAN, la plataforma ya debe disponer de:

1. Identidad del **emisor** (negocio / tenant).
2. Identidad del **adquirente** (cliente del taller).
3. Conceptos cobrables (productos y, si aplica, servicios) con precio de venta.
4. Operaciones con **snapshots** (líneas inmutables al cobrar).
5. Un documento comercial distinto del documento electrónico.

Esta fase **no** emite facturas. Prepara datos y límites para no reconstruir módulos después.

---

## 2. Separación de capas (futuro)

```text
1. Operación comercial     Sale | ServiceOrder (+ consumos)
2. Documento de venta      CommercialDocument (borrador / emitido interno)
3. Documento electrónico   payload + CUFE + XML/PDF (proveedor)
4. Integración proveedor   API del PT, credenciales por tenant
5. Validación DIAN         estados, reintentos, respuestas almacenadas
```

Reglas:

- Completar una orden **no** implica emitir factura (DT-07 / DT-08).
- El catálogo vigente no reescribe líneas históricas (snapshots).
- Inventario escribe stock; facturación lee snapshots comerciales.
- Secretos del PT: never plaintext en `businesses` (vault / secret manager).

### Estados de emisión (diseño, no código)

| Estado | Significado |
| --- | --- |
| `NOT_REQUESTED` | Hoy en `Sale.billing` |
| `PENDING` | Encolado / enviado al PT |
| `ACCEPTED` | Validado (CUFE) |
| `REJECTED` | Rechazo DIAN/PT |
| `FAILED` | Error técnico; reintento controlado |
| `CANCELLED` / nota | Decisión de negocio pendiente (DT-08) |

Idempotencia: clave por `businessId + documentId + attemptIntent` (mismo patrón que `operationKey` de inventario).

---

## 3. Modelos actuales vs información faltante

### 3.1 Productos

| Necesidad FE / comercial | Hoy (front) | Hoy (API/Prisma) | Acción |
| --- | --- | --- | --- |
| SKU | `sku` | `sku` | OK |
| Nombre | `name` | `name` | OK |
| Descripción | — (opcional en UI) | `description` | Alinear UI cuando se edite ficha |
| Unidad | `unit` texto | `unit` | OK; catálogo DIAN de unidades = pendiente validación |
| Stock / precisión | `number` | `Decimal(14,3)` | OK en API; mock usa number |
| Precio de venta | `price?` | `salePrice?` | Mapeo HTTP + **ficha UI (lote 1)**; opcional; COP solo visual |
| Costo | `cost?` | — en Prisma | Prohibido valorar inventario; no persistir ni usar para FE |
| Clasificación tributaria | — | — | **Pendiente** (no inventar código IVA/producto) |
| Tratamiento impuestos | — | — | **Pendiente**; venta mock deja `taxConfigured: false` |

**Diferenciar:** existencia (`stock`) ≠ precio de venta (`salePrice`/`price`) ≠ costo. El costo no entra en el payload FE de venta.

### 3.2 Clientes

| Necesidad | Hoy | Acción |
| --- | --- | --- |
| Tipo persona/empresa | `PERSON` \| `COMPANY` | OK |
| Tipo / número ID | `documentType`, `documentNumber` / `nit` | OK |
| DV | — | **Añadido** `verificationDigit?` (opcional) |
| Nombre / razón social | first/last o legal/trade | OK |
| Correo, teléfono, dirección | sí | OK |
| Municipio / departamento | — | **Añadido** `municipality?`, `department?` (opcionales) |
| Responsabilidades / régimen | — | **Pendiente** validación tributaria (no inventar códigos) |

Campos nuevos: opcionales, no rompen CRUD ni validaciones actuales. La UI de captura puede llegar en un ticket aparte.

### 3.3 Catálogo de servicios

| Necesidad | Hoy | Acción |
| --- | --- | --- |
| Código, nombre, descripción, estado | sí (`service_types`) | OK |
| Precio de venta | no | **Bloqueado** (DT-04): confirmar si se cobra mano de obra |
| Unidad | no | Pendiente si se factura por unidad distinta de “servicio” |
| Tratamiento tributario | no | Pendiente (igual que producto) |

### 3.4 Órdenes de trabajo

| Necesidad | Hoy | Acción |
| --- | --- | --- |
| Cliente, vehículo, ítems, usos | sí (mock + contrato 06) | OK |
| Snapshots nombre servicio | sí | OK |
| Precio / descuento / tax en línea | parcial en mock (`unitPrice?`) | Completar cuando exista cobro |
| Completar ≠ facturar | sí (diseño) | Conservar |
| Consumo inventario | sí | Conservar; escritor único inventario |

Origen futuro de documento: líneas **ejecutadas/consumidas** + snapshots, no el catálogo vivo.

### 3.5 Negocio (emisor)

| Necesidad | Hoy | Acción |
| --- | --- | --- |
| Nombre, razón social, taxId, email, phone, address | `Business` | Base OK |
| DV, municipio, departamento, establecimiento | — | Pendiente perfil fiscal (`BusinessCommercialProfile` ya esbocado en venta mock) |
| Resoluciones / numeración | — | Tabla futura por tenant |
| Credenciales PT | — | Secret store; no columnas plaintext |

### 3.6 Inventario / compras

Decisiones vigentes: ENTRY/EXIT/ADJUSTMENT/RETURN; compras con proveedor + referencia documental (cuando exista módulo compras); costos fuera de alcance; no confundir recepción con factura de venta.

---

## 4. Snapshots históricos (diseño)

```text
Catálogo actual (Product / ServiceType / Customer)
        │ copia al cobrar / confirmar
        ▼
Línea operativa inmutable (SaleLine | CommercialDocumentLine | uso cobrable)
        │
        ▼
Documento comercial ──► Documento electrónico (PT/DIAN)
```

Referencia viva: `SaleCustomerSnapshot`, `SaleLine` (`sale.model.ts`) y `SaleBillingRecord` con `NOT_REQUESTED`.

No reutilizar `VehicleDocument` (SOAT/RTM) como factura.

---

## 5. Cambios implementados en esta preparación (2026-11-15)

| Cambio | Dónde | Justificación |
| --- | --- | --- |
| `Customer.verificationDigit?` | front model + Prisma + API | Identificación colombiana; opcional |
| `Customer.municipality?` | idem | Ubicación comercial/fiscal sin inventar DIVIPOLA obligatorio aún |
| `Customer.department?` | idem | idem |
| Este documento | `docs/arquitectura-comercial/11-…` | Plan y gaps |
| Precio de venta en ficha producto (lote 1) | form + listado + edit route; `price`↔`salePrice` | DT-04 producto |
| UX inventario (lote 2) | Pestañas Productos/Movimientos; KPIs; consulta | Sin entradas/FE |

**No implementado a propósito:** precios de `ServiceType`, códigos IVA, tablas de resolución, integración PT, motor de emisión. Categoría libre del front no tiene columna API (solo `description` / futuro `categoryId`).

---

## 6. Dependencias futuras (orden sugerido)

1. ~~Exponer/editar `salePrice` de producto en UI~~ **Hecho (lote 1).**
2. ~~Diseñar Sale vs CommercialDocument, ER y contrato~~ **Hecho (lote 5A):** [12-lote-5a-modelo-comercial.md](./12-lote-5a-modelo-comercial.md), [ADR-001](./ADR-001-sale-vs-commercial-document.md), [19-commercial-documents](../api-contracts/19-commercial-documents.md).
3. Decidir DT-04 (precio de servicio) → si sí, columna `sale_price` en `service_types`.
4. Perfil fiscal del negocio (`BusinessCommercialProfile` persistido).
5. UI cliente: DV + municipio/departamento.
6. **Lote 5B:** persistir Sale + CommercialDocument (migraciones + HTTP + mock); preparar desde Sale/orden.
7. Proveedor tecnológico + secretos + estados de emisión.
8. Validación tributaria real (tarifas, exclusiones) con asesoría — **no inventar**.

---

## 7. Decisiones pendientes (bloquean campos fiscales)

| ID | Tema | Por qué no inventar |
| --- | --- | --- |
| FE-01 | Catálogo de unidades DIAN vs texto libre | Mapping externo |
| FE-02 | Código / clasificación tributaria por producto y servicio | Norma y tarifa |
| FE-03 | Responsabilidades fiscales del adquirente y del emisor | Régimen del taller |
| FE-04 | ¿Se factura mano de obra? (DT-04) | Producto |
| FE-05 | Anulación / nota crédito vs reversa de stock (DT-08) | Operación |
| FE-06 | Numeración y resoluciones por establecimiento | Legal |
| FE-07 | Consumidor final vs cliente registrado en taller | Ya parcialmente en `Sale` |

---

## 8. Riesgos de migración

| Riesgo | Mitigación |
| --- | --- |
| Front `price` vs API `salePrice` | Adapter en `InventoryHttpRepository` / presenter; unificar contrato en docs |
| Clientes sin municipio/DV | Campos opcionales; exigir solo al preparar documento FE |
| Órdenes sin precio histórico | No emitir desde órdenes viejas sin snapshot; o backfill explícito |
| Secretos en `.env` compartido | Per-tenant encrypted secrets fuera del schema operativo |
| Asumir IVA 19% en mock | Prohibido; mantener `taxConfigured: false` hasta tarifa real |

---

## 9. Plan de evolución (resumen)

| Fase | Entrega |
| --- | --- |
| **P0 — Preparación (esta)** | Gaps documentados; cliente con DV/ubicación opcionales |
| **P1 — Comercial visible** | Precio producto en UI (**lote 1 hecho**); perfil emisor básico pendiente |
| **P2 — Documento interno** | `CommercialDocument` + snapshots desde Sale/orden |
| **P3 — Emisión** | PT + estados + idempotencia + almacenamiento de respuesta |
| **P4 — Cumplimiento** | Tarifas validadas, notas, resoluciones |

---

## 10. Criterio de éxito de esta fase

- Queda claro qué datos ya existen y cuáles faltan.
- No se inventan requisitos DIAN.
- Inventario, órdenes y venta siguen separados de la emisión.
- Los campos añadidos son opcionales y no rompen el CRUD.
- El camino a FE es integración sobre datos estructurados, no un rediseño.
