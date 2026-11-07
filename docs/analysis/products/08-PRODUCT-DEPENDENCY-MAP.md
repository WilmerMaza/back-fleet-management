# 08 — Mapa de dependencias: Producto

Fecha: 2026-11-02.

## 1. Inventario de archivos (frontend)

### Dominio y persistencia mock

| Archivo | Rol | ¿Escribe Product/stock? |
| --- | --- | --- |
| `src/app/data-access/models/inventory.model.ts` | `Product`, `InventoryMovement` | — |
| `src/app/data-access/models/common.model.ts` | `Auditable`, `EntityStatus` | — |
| `src/app/data-access/models/service-order.model.ts` | `ServiceOrderProductUsage` | no (copia) |
| `src/app/data-access/models/sale.model.ts` | `SaleLine` | no (copia) |
| `src/app/data-access/models/service-suggestion.model.ts` | sugerencias | no |
| `src/app/data-access/repositories/inventory.repository.ts` | contrato FE | sí, vía impl |
| `src/app/data-access/tokens/repositories.tokens.ts` | `INVENTORY_REPOSITORY` | — |
| `src/app/data-access/mocks/inventory-mock.repository.ts` | CRUD + movimientos | create/update/apply |
| `src/app/data-access/mocks/mock-db.ts` | semillas + `applyInventoryMovement` | **único stock writer** |
| `src/app/data-access/mocks/tenant-seed.ts` | `norteProducts` | semilla |
| `src/app/data-access/suggestions/inventory-stock.ts` | regla pura de saldo | no persiste |
| `src/app/data-access/suggestions/resolve-suggestions.ts` | recomienda productos ACTIVE | no |
| `src/app/data-access/mocks/service-order-mock.repository.ts` | complete → apply EXIT | sí, vía apply |
| `src/app/data-access/mocks/sale-mock.repository.ts` | confirm/cancel → apply | sí, vía apply |
| `src/app/data-access/mocks/provide-data-access.ts` | DI mock | — |

No hay `HttpRepository` de inventario.

### UI que consume productos

| Superficie | Path | Lectura | Escritura catálogo | Escritura stock |
| --- | --- | --- | --- | --- |
| Inventario | `/app/inventory` | list + movements | `createProduct` | ENTRY |
| Dashboard | `/app/dashboard` | list → KPI low stock | no | no |
| Wizard orden | `/app/orders/new` | list ACTIVE | no | no |
| Ficha orden | `/app/orders/:id` | list ACTIVE | no | no (consumo no mueve) |
| Líneas | `order-product-lines` | stock informativo | no | no |
| Sugerencias | catálogo de servicios | list + resolve | no (liga productId) | no |
| Venta alta | `/app/sales/new` | list | no | no hasta confirm |
| Venta ficha | `/app/sales/:id` | list (nombres) | no | confirm/cancel en sale repo |
| Roles UI | matriz inventario | permisos | no | no |

### Permisos y rutas

- Ruta: `src/app/app.routes.ts` L342–349 · `FleetPermission.NavInventory`
- Nav: `navigation.config.ts` id `inventory`
- Permisos: `permissions.ts` `nav.inventory`, `inventory.write`, `inventory.delete`
- Mapa roles: `role-permissions.map.ts` ADMIN write+delete; INVENTORY write; TECHNICIAN nav sin write; OPERATOR **sin** inventario
- Matriz admin roles: `role-modules.ts` L94–101

### Shared

- `fleet-status-labels.ts` `INVENTORY_MOVEMENT_LABEL`, `inventoryMovementTone`
- Tablas/filtros: `FleetTable`, `FleetFilters` usados por `InventoryPage`

### Specs

- `inventory.page.spec.ts` (UI spec)
- `service-order-execution.spec.ts` (consumo + complete + stock)
- `sale-mock.repository.spec.ts` (EXIT/RETURN)
- `resolve-suggestions.spec.ts`
- `inventory-stock` cubierto vía esos tests

### Contratos y docs

- Vigentes: `09-inventory.md`, `06-service-orders.md` (complete), `07-audit.md`, `16-service-suggestions.md`, `17-sales.md`, `00-multitenancy.md`
- UI: `design-system/screens/inventory/INVENTORY_SPEC.md`
- Plan: `docs/PLAN.md`, `PLAN_EJECUCION_COMPLETO.md` tablas `products` / `inventory_movements`
- Comercial: DT-01..07, 09-sugerencias, 10-ventas — útiles; **02-mapa-entidades parcialmente obsoleto**

## 2. Grafo de dependencias (quién usa a quién)

```text
InventoryPage ──► InventoryRepository
DashboardPage ──► InventoryRepository
OrderWizard / OrderDetail ──► InventoryRepository (lectura)
                           ──► ServiceOrderRepository (líneas; complete)
SaleForm / SaleDetail ──► InventoryRepository (lectura)
                      ──► SaleRepository (confirm/cancel)
ServiceSuggestionsPage ──► InventoryRepository + ServiceSuggestionRepository

ServiceOrderMock.complete ──► mockDb.applyInventoryMovement
SaleMock.confirm/cancel   ──► mockDb.applyInventoryMovement
InventoryMock.register    ──► mockDb.applyInventoryMovement

applyInventoryMovement ──► stockAfterMovement
                       ──► products.stock
                       ──► inventoryMovements
                       ──► audit_logs
```

Ningún feature escribe `HttpClient` directo (regla de arquitectura).

## 3. Lógica de negocio en componentes (sí, limitada)

| Componente | Lógica | ¿Debe vivir en back? |
| --- | --- | --- |
| `InventoryPage.filteredProducts` | search + low stock en memoria | search/lowStock en API |
| `InventoryPage.saveProduct` | required + status ACTIVE | validación servidor |
| `InventoryPage.registerEntry` | arma ENTRY | sí, ya es caso de uso |
| `order-product-lines.lineTotal` | `qty * unitPrice` presentación | cobro no está en 06 |
| `sale-form` | busca por nombre/sku, consolida líneas | SaleRepository ya consolida |
| `DashboardPage` | `stock <= minStock` | opcional endpoint KPI |

El descuento real **no** está en componentes: está en mocks de orden/venta.

## 4. Consumidores vs modificadores

**Solo lectura de Product:** dashboard, wizard, detail, sale form (hasta confirmar), resolve.

**Modifican catálogo:** solo `InventoryPage.createProduct` (+ `updateProduct` muerto en repo).

**Modifican stock:** `registerEntry` (página), `complete` (órdenes), `confirm`/`cancel` (ventas), `ADJUSTMENT` (API futura, sin UI).

## 5. Independencia del módulo en el monolito

```text
InventoryModule
  controllers: products, inventory-movements
  application: ProductsService, ApplyMovementService
  domain: stockAfterMovement (portar la función pura)
  infra: Prisma

OrdersModule  ──inject──► ApplyMovementService
SalesModule   ──inject──► ApplyMovementService
CatalogModule (sugerencias) ──inject──► ProductsService.findActive
```

Prohibido: `OrdersModule` importando Prisma `products`. Permitido: interfaz `InventoryMovementPort`.

Extracción futura a microservicio: el puerto pasa a HTTP interno; las transacciones de complete **dejan de ser un solo COMMIT** — por eso el plan actual descarta microservicios (DT-01, `docs/PLAN.md`).

## 6. Respuestas cortas (criterio de la investigación)

1. **¿Qué es un producto?** SKU de un negocio con nombre, unidad, saldo, mínimo, estado, y opcionalmente categoría, marca, referencia, costo y precio.
2. **¿Qué almacenar?** Tabla `products` + ledger `inventory_movements`. No categorías/proveedores/bodegas en MVP.
3. **¿Reglas?** Stock ≥ 0; un escritor; planear no reserva; complete/venta descuentan; copias de precio en líneas; tenant; ACTIVE para operar.
4. **¿Inventario?** Saldo denormalizado = `products.stock`, actualizado solo con movimientos.
5. **¿Órdenes/ventas?** Usos y líneas son snapshots; EXIT al complete / al confirm; RETURN opcional al cancelar venta. No se duplican descuentos (DT-07).
6. **¿Tablas?** Dos.
7. **¿Endpoints?** Los de 09, más orquestaciones 06/17; enmiendas listadas en 05.
8. **¿Transacciones?** applyMovement; complete; confirm; cancel-with-return; create+ENTRY inicial.
9. **¿Permisos?** `nav.inventory`, `inventory.write`; ajuste más estrecho; complete usa `orders.complete`; ventas los de 17. Precio de catálogo sin permiso propio (decisión).
10. **¿Primero?** applyMovement + list/create/ENTRY + complete atómico.
11. **¿Decisiones?** D-SKU, D-STOCK-ALTA, D-PATCH-STOCK, D-DINERO, D-PERM-PRECIO, D-TRANSFER (doc 07).
12. **¿Arquitectura?** Módulo Inventario dueño del saldo; órdenes/ventas por puerto; monolito modular, una transacción de proceso.
