# 04 — Reglas de negocio: Producto e inventario

Fecha: 2026-11-02.

Clasificación: **Confirmada** | **Inferida** | **Pendiente**.

---

## Confirmadas

**Identificador:** PROD-RULE-001  
**Nombre:** Aislamiento por negocio.  
**Descripción:** Un producto y sus movimientos pertenecen a un `businessId`. Las consultas filtran siempre ese tenant.  
**Condición:** Toda lectura/escritura.  
**Resultado esperado:** Cross-tenant → 404/403, nunca el recurso.  
**Validación:** `WHERE business_id = ctx`; tests de Norte vs Demo.  
**Fuente:** `00-multitenancy.md`; `inventory-mock.repository.ts` L10, L32, L53; `tenant-seed.ts` `norteProducts`.

**Identificador:** PROD-RULE-002  
**Nombre:** SKU, nombre y unidad obligatorios en el alta.  
**Descripción:** El formulario no persiste sin esos campos. Stock y mínimo también son required en el FormGroup (default 0).  
**Condición:** `createProduct` desde UI.  
**Resultado esperado:** Mensaje «SKU, nombre y unidad son obligatorios.» si inválido.  
**Validación:** Angular Validators; el back debe repetir (la UI no es control).  
**Fuente:** `inventory.page.ts` L177–185, L255–260; `INVENTORY_SPEC.md`.

**Identificador:** PROD-RULE-003  
**Nombre:** Alta nace ACTIVE.  
**Descripción:** `status: 'ACTIVE'` fijo, no visible en el formulario.  
**Condición:** Crear producto.  
**Resultado esperado:** Catálogo operable.  
**Validación:** Payload de `saveProduct`.  
**Fuente:** `inventory.page.ts` L184, L271; spec L26.

**Identificador:** PROD-RULE-004  
**Nombre:** Stock nunca negativo.  
**Descripción:** ENTRY/RETURN suman; EXIT/TRANSFER restan solo si hay saldo; ADJUSTMENT no puede dejar negativo.  
**Condición:** Cualquier movimiento.  
**Resultado esperado:** Error `Stock insuficiente` o `El ajuste no puede dejar stock negativo`.  
**Validación:** `stockAfterMovement` (`inventory-stock.ts` L9–29); contrato 09.  
**Fuente:** `09-inventory.md` L17; `inventory-stock.ts`.

**Identificador:** PROD-RULE-005  
**Nombre:** Un solo escritor de stock.  
**Descripción:** Órdenes y ventas no mutan `product.stock` salvo vía `applyInventoryMovement`.  
**Condición:** Complete, confirm venta, cancel con devolución, ingreso UI.  
**Resultado esperado:** Un ledger por cambio.  
**Validación:** Grep de asignaciones a `.stock`; hoy solo `applyInventoryMovement` y el spread de `createProduct`.  
**Fuente:** `mock-db.ts` L855–888; DT-02.

**Identificador:** PROD-RULE-006  
**Nombre:** Completar orden descuenta solo lo consumible.  
**Descripción:** `quantityToConsume` = `consumedQuantity` o previsto. Ítems `NOT_PERFORMED` omitidos. Cantidad ≤ 0 no genera EXIT.  
**Condición:** `POST complete` / `ServiceOrderMockRepository.complete`.  
**Resultado esperado:** EXIT `relatedEntityType=SERVICE_ORDER`. Fallo de stock: no completar (contrato); mock valida demanda antes de EXIT.  
**Validación:** `planConsumption` L637–668; `06-service-orders.md`; `16-service-suggestions.md`.  
**Fuente:** esos archivos.

**Identificador:** PROD-RULE-007  
**Nombre:** Planear no reserva ni descuenta.  
**Descripción:** Crear/editar orden y `reservedQuantity = 0`.  
**Condición:** Alta y `sealUsage`.  
**Resultado esperado:** Stock igual hasta complete.  
**Validación:** `sealUsage` L687–694; contrato 16.  
**Fuente:** `service-order.model.ts` L68–73; 16 L40.

**Identificador:** PROD-RULE-008  
**Nombre:** No usado no reingresa.  
**Descripción:** `unusedQuantity` es informativo.  
**Condición:** `recordConsumption`.  
**Resultado esperado:** Sin movimiento RETURN.  
**Validación:** `recordConsumption` solo escribe campos; 16 L42.  
**Fuente:** `service-order-mock.repository.ts` L455–477.

**Identificador:** PROD-RULE-009  
**Nombre:** Producto inactivo no se recomienda ni se vende ni se elige.  
**Descripción:** Resolve salta inactivos; venta `activeProduct`; UI órdenes filtra `ACTIVE`.  
**Condición:** Sugerir, agregar línea de venta, selects de orden.  
**Resultado esperado:** `prod-004` no aparece en operación.  
**Validación:** `resolve-suggestions.ts` L40–73; `sale-mock.repository.ts` L501–507; templates wizard/detail.  
**Fuente:** esos archivos.  
**Nota:** el listado de inventario **sí** muestra inactivos. Complete de una línea ya guardada no revalida ACTIVE.

**Identificador:** PROD-RULE-010  
**Nombre:** Precio de línea de orden es copia.  
**Descripción:** Al agregar se copia `product.price` → `unitPrice`. Cambiar catálogo no reescribe.  
**Condición:** `addProductUsage` / wizard.  
**Resultado esperado:** Histórico de cobro estable (cuando se cobre).  
**Validación:** contrato 16 L34; tests `service-order-execution.spec.ts`.  
**Fuente:** 16; modelo L88–90.

**Identificador:** PROD-RULE-011  
**Nombre:** Venta exige precio entero de catálogo y producto activo.  
**Descripción:** Sin `Number.isSafeInteger(product.price)` no se agrega línea.  
**Condición:** merge de línea / confirm.  
**Resultado esperado:** Error nominando el producto.  
**Validación:** `activeProduct` L501–511.  
**Fuente:** `17-sales.md`; sale-mock.

**Identificador:** PROD-RULE-012  
**Nombre:** Confirmar venta es todo o nada respecto a stock.  
**Descripción:** Valida todas las líneas; EXIT con `operationKey`; si falla a medias, RETURN de compensación.  
**Condición:** `confirm`.  
**Resultado esperado:** No venta CONFIRMED con salidas incompletas en ese proceso.  
**Validación:** sale-mock L242–288; 17 L19–20, L41–45.  
**Fuente:** esos archivos.

**Identificador:** PROD-RULE-013  
**Nombre:** Cancelar venta puede devolver stock sin editar el EXIT.  
**Descripción:** `returnToStock` → RETURN + `reversesMovementId` + operationKey.  
**Condición:** `cancel` sobre CONFIRMED.  
**Resultado esperado:** Saldo restaurado; ledger append-only.  
**Validación:** sale-mock L364–384; 17 L21.  
**Fuente:** esos archivos.

**Identificador:** PROD-RULE-014  
**Nombre:** Alerta de stock bajo es `stock <= minStock`.  
**Descripción:** Badge, filtro, KPI dashboard. Notificación push = MVP2.  
**Condición:** Lectura.  
**Resultado esperado:** Conteo de productos bajo mínimo.  
**Validación:** `inventory.page.ts` L101–105; `dashboard.page.ts` L74; 09 L20.  
**Fuente:** esos archivos.

**Identificador:** PROD-RULE-015  
**Nombre:** ADJUSTMENT fija stock absoluto.  
**Descripción:** `stockAfterMovement` retorna `quantity` (objetivo). Solo roles inventario/admin en contrato.  
**Condición:** POST movimiento tipo ADJUSTMENT.  
**Resultado esperado:** Saldo = cantidad informada, ≥ 0.  
**Validación:** `inventory-stock.ts` L26–29; 09 L18.  
**Fuente:** 09. **UI: no expuesto.**

**Identificador:** PROD-RULE-016  
**Nombre:** Escritura de catálogo/movimientos en UI exige `inventory.write`.  
**Descripción:** Alta e ingreso ocultos sin permiso. Ver listado: `nav.inventory`.  
**Condición:** `/app/inventory`.  
**Resultado esperado:** OPERATOR no ve Inventario; TECHNICIAN ve y no escribe; rol INVENTORY escribe.  
**Validación:** `inventory.page.ts` L75; `role-permissions.map.ts`; guard de ruta.  
**Fuente:** `permissions.ts` L16, L46–47.

**Identificador:** PROD-RULE-017  
**Nombre:** Idempotencia de movimiento por `operationKey`.  
**Descripción:** Segunda escritura con la misma clave devuelve el movimiento existente y no mueve stock.  
**Condición:** Payload con `operationKey`.  
**Resultado esperado:** Un solo delta.  
**Validación:** `applyInventoryMovement` L863–869.  
**Fuente:** modelo L33–34. Órdenes complete **no** envían clave.

**Identificador:** PROD-RULE-018  
**Nombre:** Auditoría de movimiento.  
**Descripción:** Cada apply escribe `INVENTORY_MOVEMENT_CREATED`.  
**Condición:** Tras insertar movimiento.  
**Resultado esperado:** Fila append-only en `audit_logs`.  
**Validación:** `mock-db.ts` L889–902; `07-audit.md`.  
**Fuente:** 07 L70.

---

## Inferidas (el producto se comporta así; no hay frase de negocio firmada)

**Identificador:** PROD-RULE-019  
**Nombre:** Categoría y unidad son texto libre.  
**Descripción:** No hay catálogo ni normalización.  
**Fuente:** formulario input libre; semillas `ACEITES`/`L`.  
**Clase:** Inferida.

**Identificador:** PROD-RULE-020  
**Nombre:** Completar orden no exige producto ACTIVE.  
**Descripción:** `planConsumption` busca el producto y el stock, no `status`.  
**Fuente:** `service-order-mock.repository.ts` L650–666.  
**Clase:** Inferida — puede ser hueco.

**Identificador:** PROD-RULE-021  
**Nombre:** `inventory.delete` no tiene efecto de producto.  
**Descripción:** El permiso existe en matriz de roles; no hay DELETE en repo ni UI.  
**Fuente:** `permissions.ts`; `InventoryRepository`; `INVENTORY_SPEC.md` L56.  
**Clase:** Inferida: la baja es INACTIVE vía PATCH, no implementada.

**Identificador:** PROD-RULE-022  
**Nombre:** Costo no viaja en la orden.  
**Descripción:** Solo la venta copia `costMinor` y lo oculta sin `sales.sensitive.read`.  
**Fuente:** `sale.model.ts` L65–66; usage de orden sin `cost`.  
**Clase:** Inferida para márgenes de taller.

---

## Pendientes de decisión

**Identificador:** PROD-RULE-023  
**Nombre:** Unicidad de SKU por negocio.  
**Descripción:** El mock acepta SKUs duplicados.  
**Fuente:** `createProduct` sin chequeo.  
**Clase:** Pendiente (D-SKU).

**Identificador:** PROD-RULE-024  
**Nombre:** Stock inicial genera ENTRY.  
**Descripción:** Hoy `createProduct` escribe `stock` sin movimiento.  
**Fuente:** `inventory-mock.repository.ts` L36–49 vs DT-02.  
**Clase:** Pendiente (D-STOCK-ALTA).

**Identificador:** PROD-RULE-025  
**Nombre:** PATCH de producto no altera stock.  
**Descripción:** El repo acepta `Partial<Product>` incluyendo `stock`.  
**Fuente:** `inventory.repository.ts` L7; 09 PATCH sin reglas.  
**Clase:** Pendiente (D-PATCH-STOCK).

**Identificador:** PROD-RULE-026  
**Nombre:** Permiso para cambiar precio/costo de catálogo.  
**Descripción:** DT-04 propone `catalog.price.write`; no está en `FleetPermission`. Inventario write hoy cubre todo lo que hay en UI (que no incluye precio).  
**Fuente:** DT-04; `permissions.ts`.  
**Clase:** Pendiente (D-PERM-PRECIO).

**Identificador:** PROD-RULE-027  
**Nombre:** Representación monetaria del catálogo.  
**Descripción:** Producto usa `number`; venta usa minor integers.  
**Fuente:** `inventory.model.ts` vs `sale.model.ts`.  
**Clase:** Pendiente (D-DINERO).

**Identificador:** PROD-RULE-028  
**Nombre:** TRANSFER sin destino.  
**Descripción:** Resta como EXIT. Contrato lista el tipo.  
**Fuente:** `stockAfterMovement` L20–24; DT-06.  
**Clase:** Pendiente: no exponer hasta sedes (D-TRANSFER).
