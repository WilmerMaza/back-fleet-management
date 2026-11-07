# 01 — Análisis funcional: Producto en KONTI

Fecha: 2026-11-02. Solo investigación. No hay implementación de backend.

Leyenda de certeza:

| Marca | Significado |
| --- | --- |
| **C** | Confirmado en modelo, contrato o UI vigente |
| **M** | Solo mock / pantalla; el contrato HTTP es más pobre o no existe |
| **P** | Propuesta comercial o DT, no es contrato vigente |
| **∅** | No existe en el proyecto; no se inventa |

## 1. Qué es un producto

Un producto es un **ítem de catálogo con existencia**, propio de un negocio (`businessId`). No es un tipo de servicio (`ServiceType`: trabajo del taller). No es una línea de orden ni una línea de venta: esas copian datos del producto en el momento de usarlo.

En el front vive en el módulo **Inventario**, no hay feature `products/` ni ruta `/app/products`. La pantalla es `/app/inventory` (`NavInventory`).

Fuentes: `src/app/data-access/models/inventory.model.ts`, `docs/api-contracts/09-inventory.md`, `design-system/screens/inventory/INVENTORY_SPEC.md`.

## 2. Identidad — atributos reales

Modelo `Product` (`inventory.model.ts` L3–17) + `Auditable` (`common.model.ts` L7–16).

| Atributo | Tipo | Obligatorio | Dónde se usa | Certeza |
| --- | --- | --- | --- | --- |
| `id` | string (UUID en back) | sí | PK | **C** |
| `businessId` | string | sí | tenant | **C** |
| `sku` | string | sí (form + modelo) | búsqueda, copiado a líneas | **C** |
| `name` | string | sí | listados, copiado a líneas | **C** |
| `category` | string opcional | no | filtro/búsqueda; texto libre | **C** |
| `brand` | string opcional | no | semilla Mobil/Toyota; **no** hay campo en el alta | **C** (dato) / **M** (no UI) |
| `reference` | string opcional | no | ventas copian a `SaleLine.description`; **no** UI de inventario | **C** |
| `unit` | string | sí | default UI `UND`; semilla `L`/`UND`; texto libre | **C** |
| `stock` | number | sí en alta | existencia actual | **C** |
| `minStock` | number | sí en alta | alerta `stock <= minStock` | **C** |
| `cost` | number opcional | no | semilla; venta copia a `costMinor` si es entero seguro; **no** se muestra en inventario | **C** |
| `price` | number opcional | no | semilla; sugerencias y órdenes copian `unitPrice`; venta **exige** entero seguro | **C** (campo) / **M** vs contrato 09 (09 no habla de precio) |
| `status` | `ACTIVE` \| `INACTIVE` | sí | alta fuerza `ACTIVE`; semilla `prod-004` INACTIVE | **C** |
| `createdAt` / `updatedAt` | ISO | sí | auditoría de fila | **C** |
| `createdBy` / `updatedBy` | user id opcional | no | Auditable; el alta de inventario **no** los envía | **M** |

**No existen** (buscados en modelos, mocks, contratos 09/16/17): código de barras, descripción larga, subcategoría, presentación, imagen, SKU interno distinto de `sku`, stock máximo, stock reservado/disponible como campos, listas de precios, impuestos en el producto, margen, historial de precio, almacén, proveedor.

## 3. Clasificación

- **Plana.** `category` es un string (`ACEITES`, `FILTROS` en semilla). No hay tabla ni selector de categorías. **C**
- `brand` es string en el producto, independiente de `Vehicle.brand`. No hay catálogo de marcas. **C**
- `unit` es string. Default de formulario `UND`. No hay unidades predefinidas. **C**
- No hay atributos por categoría. **C**
- Tipos de producto: el modelo es único. Un aceite (litros) y un filtro (unidades) son la misma entidad. **C**
- Sugerencias por `ServiceType` (`ServiceProductSuggestion`) son otra entidad: relacionan producto ↔ tipo de servicio, no clasifican el producto. **C** (`16-service-suggestions.md`)

## 4. Precios y costos

| Concepto | ¿Existe? | Comportamiento |
| --- | --- | --- |
| Precio de venta vigente | `Product.price` | Catálogo. Copiado a `ServiceOrderProductUsage.unitPrice` y a `SaleLine.unitPriceMinor` |
| Costo | `Product.cost` | Copiado a venta (`costMinor`) si es entero; **no** a la línea de orden |
| Precio copiado en orden | **C** mock 16 | Al agregar línea; no se reescribe si cambia el catálogo (`sealUsage` no toca precio; `updateProductUsage` sí puede sustituir producto y `unitPrice`) |
| Precio copiado en venta | **C** contrato 17 | Enteros `*Minor`; consolidar líneas conserva el precio ya copiado |
| Override de precio | Solo ventas (`sales.price.override`) | Órdenes: no hay permiso de override; el wizard copia `product.price` |
| Impuesto | Venta: `taxAmountMinor = 0`, `taxConfigured: false` | Producto no tiene tarifa |
| Descuento | Solo línea de venta (`sales.discount`) | Producto no tiene descuento |
| Moneda | Venta: `currencyCode`/`scale` copiados del negocio | Producto y orden **no** tienen moneda (16: «COP es solo presentación») |
| Listas / historial / margen / IVA | **∅** | |
| UI inventario precio/costo | **∅** | El alta no envía `cost`/`price` (`inventory.page.ts` `saveProduct`) |

Fuente de verdad del precio **cobrable**: la línea (orden o venta), no el catálogo, una vez copiado. DT-04 lo formula como propuesta; el mock de órdenes y el contrato 17 ya lo hacen.

## 5. Inventario y existencias

**Saldo actual = `Product.stock`.** Se muta solo en `mockDb.applyInventoryMovement` (`mock-db.ts` L855–904). El cierre de orden y la confirmación/cancelación de venta pasan por ahí. Función pura: `stockAfterMovement` (`inventory-stock.ts`).

Tipos de movimiento (`09-inventory.md` y modelo): `ENTRY | EXIT | ADJUSTMENT | RETURN | TRANSFER`.

| Tipo | Efecto en mock (`stockAfterMovement`) | UI |
| --- | --- | --- |
| `ENTRY`, `RETURN` | suma | Solo `ENTRY` (ingreso rápido). Motivo oculto, default «Compra / ingreso» |
| `EXIT`, `TRANSFER` | resta; falla si `stock < quantity` | `EXIT` por complete de orden y confirm de venta. `TRANSFER` **sin UI y sin destino** |
| `ADJUSTMENT` | reemplaza stock por `quantity`; **no** admite negativo | Sin UI. Contrato 09: solo INVENTORY/ADMIN |

Otros:

- **Stock mínimo:** `minStock`. Dashboard cuenta `stock <= minStock`. Filtro «En o bajo mínimo». Alerta por notificaciones = MVP2 (09).
- **Stock máximo, reserva, disponible vs físico, bodegas, lotes, seriales:** **∅**. `reservedQuantity` en usos de orden **siempre 0** (16, `sealUsage`).
- **Historial:** `inventory_movements` con `balanceAfter`, `reason`, `relatedEntityType/Id`, `operationKey?`, `reversesMovementId?`, `createdBy?`.
- **Alta de producto:** fija `stock` inicial **sin** movimiento (`createProduct`). El ledger no explica esa existencia. **C** mock; contradice la idea «única vía de cambiar stock» de DT-02.
- Semilla: movimientos empiezan `[]`; el stock 80/25/40 no tiene ledger. **C**

## 6. Proveedores

**∅** en modelos y mocks. Stub de expansión: `docs/api-contracts/24-expansion.md` punto 4. Tabla `providers` en el plan de ejecución, fase posterior. No diseñar `product_suppliers` para el MVP.

## 7. Relación con órdenes de servicio

Contrato vigente de cierre: `06-service-orders.md`. Extensión mock: `16-service-suggestions.md` + `ServiceOrderProductUsage`.

Flujo:

1. Wizard / ficha: se eligen productos **ACTIVE**. Sugerencias (`resolve`) o alta manual.
2. Al agregar se copian `productId`, `name`, `sku`, `unit`, `unitPrice` (precio de catálogo), cantidades previstas. `reservedQuantity = 0`. **No descuenta.**
3. Durante ejecución: cambiar previsto, sustituir producto, quitar, registrar `consumedQuantity` / `unusedQuantity`. `unusedQuantity` **no** devuelve stock.
4. Completar (`OPEN`/`IN_PROGRESS` → `COMPLETED`):
   - Ítems `NOT_PERFORMED` no descuentan.
   - Adicionales sin autorización `APPROVED` bloquean el cierre.
   - Demanda = `consumedQuantity` o, si falta, previsto (`quantityToConsume`).
   - Valida stock agregado por producto; luego `EXIT` por cada uso, `relatedEntityType=SERVICE_ORDER`.
   - Stock insuficiente → error; el mock **ya pudo haber escrito km** antes de los EXIT (ver riesgos).
5. Cancelar orden: transición de estado; **no** hay movimiento (el stock no se había movido).
6. Editar orden cerrada: prohibido.

Snapshot histórico en la línea: nombre, sku, unidad, `unitPrice`. **No** se copia `cost`. Completar **no** relee el precio.

El contrato HTTP 06 de create solo documenta `{ productId, quantity }`. Nombre/precio copiados son comportamiento mock 16, sin rutas HTTP publicadas.

## 8. Relación con ventas

Implementado en mock + contrato **17** (no HTTP). Agregado distinto de la orden (DT-07). No llena `deliveredQuantity`.

- Borrador: líneas con snapshot (sku, nombre, unidad, precios minor, costo opcional). No mueve stock.
- Producto debe estar `ACTIVE` y tener `price` entero seguro.
- Confirmar: valida stock de todas las líneas; `EXIT` `relatedEntityType=SALE` con `operationKey`; compensación `RETURN` si falla a medias (no es ACID).
- Cancelar con `returnToStock`: `RETURN` que apunta al `EXIT` (`reversesMovementId`). El EXIT no se edita.
- Impuesto 0. Descuento y override con permisos de venta.

## 9. Lo que la pantalla de inventario hace y no hace

Hace: listar, filtrar (cliente), alta, ingreso `ENTRY`, ver movimientos.

No hace: editar, desactivar, borrar, ajustar, devolver, transferir, ver/editar precio-costo-marca-referencia, ficha de producto, click de fila (`INVENTORY_SPEC.md` L54–59).

`InventoryRepository.updateProduct` / `getProduct` existen y **ninguna página los llama**.

## 10. Contratos vs mock (resumen)

| Tema | Contrato 09 | Mock / otras fuentes |
| --- | --- | --- |
| CRUD producto | GET lista, POST, PATCH | POST sí; PATCH en repo sin UI; GET by id en repo |
| Movimientos | GET, POST todos los tipos | UI solo ENTRY; órdenes/ventas escriben EXIT/RETURN |
| Precio/costo | no mencionados | campos + copias en 16/17 |
| Unicidad SKU | no | no se valida |
| Stock inicial | no | create sin movimiento |
| Idempotencia | no | ventas sí; complete de orden **no** usa `operationKey` |
| Ajuste negativo | «stock nunca negativo» | `stockAfterMovement` ahora lo impide; 02-mapa-entidades está desactualizado |

Documento hermano: [07-PRODUCT-RISKS-AND-DECISIONS.md](./07-PRODUCT-RISKS-AND-DECISIONS.md).
