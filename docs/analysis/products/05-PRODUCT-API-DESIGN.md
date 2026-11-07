# 05 — Contratos REST: Producto e inventario

Fecha: 2026-11-02.

El contrato **vigente** es [`docs/api-contracts/09-inventory.md`](../../api-contracts/09-inventory.md). Esta sección lo detalla para implementar y marca **enmiendas** que no se pueden colar en silencio.

Base: `/api/v1`  
Headers: `Authorization`, `X-Business-Id`  
Prefijo: `/businesses/{businessId}/...`  
Errores: `00-architecture.md` (`UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `VALIDATION_ERROR`, `CONFLICT`).  
Paginación lista productos: `?page&pageSize&search` → `{ items, total, page, pageSize }`.

Permisos (hoy): ver `nav.inventory`; mutar `inventory.write`; ajuste (09) INVENTORY/ADMIN. `inventory.delete` sin operación definida.

---

## A. Endpoints vigentes (implementar tal cual)

### A1. Listar productos

- **Método / ruta:** `GET /businesses/{businessId}/products`
- **Propósito:** Catálogo + stock del tenant.
- **Query:** `search` (09). El mock también pagina (`page`, `pageSize`, default 50). HTTP debe documentar paginación estándar (00) — **enmienda menor recomendada**, no cambio de recurso.
- **Search mock:** nombre, sku, categoría (case insensitive).
- **Response:** `Paginated<Product>`.
- **Validaciones:** tenant del token = path.
- **Errores:** 401, 403.
- **Permiso:** `nav.inventory` (ruta Angular). El back no debe fiarse solo del menú: exigir el mismo código o `inventory.write` para mutar.
- **Hueco:** no hay `?status=`. El mock devuelve ACTIVE e INACTIVE.

### A2. Crear producto

- **Método / ruta:** `POST /businesses/{businessId}/products`
- **Body (lo que envía el front hoy):**

```json
{
  "sku": "OIL-5W30",
  "name": "Aceite 5W30",
  "category": "ACEITES",
  "unit": "L",
  "stock": 0,
  "minStock": 20,
  "status": "ACTIVE"
}
```

Campos de modelo que el front **no** manda: `brand`, `reference`, `cost`, `price`. El POST debe aceptarlos como opcionales para no cerrar 16/17, o rechazarlos hasta D-PERM-PRECIO.

- **Response:** `201` + `Product`.
- **Validaciones:** sku/name/unit required; stock y minStock ≥ 0.
- **Errores:** 422 validación; 409 si se aprueba D-SKU.
- **Permiso:** `inventory.write`.

### A3. Actualizar producto

- **Método / ruta:** `PATCH /businesses/{businessId}/products/{id}`
- **Propósito:** 09 lo lista; **ninguna pantalla lo usa**.
- **Body:** `Partial<Product>` en el repo — demasiado amplio para el back.
- **Enmienda obligatoria antes de implementar (no silenciosa):** enumerar campos mutables de catálogo (`name`, `category`, `brand`, `reference`, `unit`, `minStock`, `status`, precio/costo si D-PERM-PRECIO). **Prohibir `stock` y `businessId` e `id`.**
- **Errores:** 404 otro tenant/id; 409 SKU.
- **Permiso:** `inventory.write` (+ permiso de precio si existe).

### A4. Listar movimientos

- **Método / ruta:** `GET /businesses/{businessId}/inventory-movements`
- **Query:** `productId` (09).
- **Response mock:** array, no paginado. HTTP: paginar (00) es enmienda recomendada.
- **Permiso:** `nav.inventory`.

### A5. Registrar movimiento

- **Método / ruta:** `POST /businesses/{businessId}/inventory-movements`
- **Body (UI ENTRY):**

```json
{
  "productId": "...",
  "type": "ENTRY",
  "quantity": 10,
  "reason": "Compra / ingreso"
}
```

- **Tipos 09:** ENTRY, EXIT, ADJUSTMENT, RETURN, TRANSFER.
- **Reglas 09:** stock ≥ 0; ADJUSTMENT absoluto, solo INVENTORY/ADMIN; órdenes usan `relatedEntityType=SERVICE_ORDER` (eso lo dispara el caso de uso complete, **no** el cliente HTTP de inventario).
- **EXIT/ADJUSTMENT/TRANSFER/RETURN manuales:** sin UI. Exponerlos en API solo a `inventory.write` (ajuste restringido). No permitir que el front de órdenes invente un EXIT suelto.
- **Errores:** 404 producto; 409/422 stock; 403 tipo no autorizado.
- **Idempotencia:** el modelo tiene `operationKey`; 09 no. **Enmienda:** campo opcional en el POST.

**No hay en 09:** `GET /products/{id}`. El repo Angular sí tiene `getProduct`. Enmienda si el HTTP quiere paridad.

---

## B. Endpoints que NO son de este módulo (pero mueven stock)

No duplicar. El complete y el confirm llaman al servicio de inventario en proceso.

| Operación | Contrato | Efecto inventario |
| --- | --- | --- |
| Completar orden | `POST .../service-orders/{id}/complete` (06) | EXIT × consumos |
| Confirmar venta | `SaleRepository.confirm` (17, HTTP pendiente) | EXIT × líneas |
| Cancelar venta con retorno | 17 | RETURN |

---

## C. Enmiendas que requieren aprobación (no implementar de oficio)

1. `GET .../products/{id}`
2. Query `status`, `lowStock=true`
3. Unicidad SKU → 409 `CONFLICT`
4. Alta con `stock > 0` crea ENTRY en la misma transacción
5. PATCH: whitelist; stock inmutable
6. `operationKey` en POST movimientos
7. Prohibir `TRANSFER` o exigirle destino
8. Paginación de movimientos
9. Campos `cost`/`price` (o `*Minor`) documentados en 09
10. `GET` filtrando inactivos por defecto en operación (no en inventario)

Hasta enmendar 09, el implementador cumple A1–A5 con las validaciones de reglas confirmadas (stock ≥ 0, tenant) sin inventar recursos nuevos.

---

## D. Forma de `Product` JSON

Alineada al TypeScript actual para no romper `HttpRepository`:

```json
{
  "id": "uuid",
  "businessId": "uuid",
  "sku": "OIL-5W30",
  "name": "Aceite 5W30",
  "category": "ACEITES",
  "brand": "Mobil",
  "reference": null,
  "unit": "L",
  "stock": 80,
  "minStock": 20,
  "cost": 18000,
  "price": 28000,
  "status": "ACTIVE",
  "createdAt": "ISO",
  "updatedAt": "ISO"
}
```

Si se pasa a `*Minor`, hay que versionar o mapear en el `HttpRepository` — decisión D-DINERO, no un cambio callado del contrato.
