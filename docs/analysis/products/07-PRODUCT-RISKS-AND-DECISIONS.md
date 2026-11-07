# 07 — Riesgos, contradicciones y decisiones

Fecha: 2026-11-02.

Prioridad: **P0** bloquea un back correcto · **P1** integridad o contrato · **P2** hueco de producto · **P3** evolución.

## 1. Hallazgos

### P0 — Complete de orden no es atómico en el mock

`complete` actualiza kilometraje y escribe audit de km **antes** del bucle de EXIT (`service-order-mock.repository.ts` L196–244). Si `applyInventoryMovement` lanza, el observable falla pero el km **ya mutó**. El contrato 06 exige rollback total.

El back **debe** invertir el orden o usar una sola transacción: validar stock con lock → todos los efectos o ninguno.

### P0 — Complete de orden sin idempotencia

A diferencia de ventas, los EXIT de orden no llevan `operationKey`. Un retry de `POST complete` sobre una orden ya `COMPLETED` el mock lo rechaza por estado (L185–187), lo que salva el caso feliz. Un retry cuando el HTTP respondió timeout **después** de persistir COMPLETED es seguro; si se cae **entre** EXIT y el update de estado, hay stock descontado y orden abierta. Eso solo se cierra con transacción + clave `order:{id}:exit:{productId}` o complete idempotente.

### P1 — `createProduct` escribe stock sin ledger

Contradice «única vía de cambiar stock» (DT-02, comentario de `applyInventoryMovement`). El historial no cuadra con `products.stock`. Semilla igual (`inventoryMovements = []`).

### P1 — PATCH `Partial<Product>` puede pisar stock

El repositorio abstracto permite mandar `stock` en un update de catálogo. Un `HttpRepository` ingenuo abre un agujero: cambiar nombre y resetear existencias sin movimiento.

### P1 — Contrato 09 vs mock 16/17 vs doc comercial 02

- `09-inventory.md` no menciona precio, costo, `operationKey`, `reversesMovementId`, ni GET by id.
- `16` y `17` ya copian precio y mueven stock.
- `docs/arquitectura-comercial/02-mapa-entidades.md` §4 dice que no hay venta ni precio histórico: **obsoleto** respecto a 09-sugerencias / 10-ventas / código actual. No usarlo como fuente.

### P1 — Dos aritméticas de cantidad y dinero

| Superficie | Cantidad | Precio |
| --- | --- | --- |
| Product / orden | `number` | `number` |
| Venta | milésimas `quantityMillis` | `bigint` minor |

Confirm de venta hace `Number(millisToDecimal(...))` hacia `applyInventoryMovement`. Riesgo de float. El PG debe unificar (doc 03).

### P1 — Venta exige `price` entero; orden no

Una orden puede copiar `unitPrice: undefined` si el alta de inventario no mandó precio (el formulario no tiene precio). La venta de ese mismo SKU falla. Comportamiento real del alta actual.

### P1 — OPERATOR completa órdenes (descuenta stock) sin `nav.inventory` ni `inventory.write`

Correcto como rol de taller; el back no debe exigir permiso de inventario al complete, sino `orders.complete`. El puerto interno de EXIT no revalida `inventory.write`. Documentar para no «corregirlo» por error.

### P2 — SKU no único

Dos «OIL-5W30» en el mismo taller. Búsquedas y copias de sku a líneas se vuelven ambiguas para humanos (el id sigue siendo PK).

### P2 — TRANSFER = EXIT disfrazado

Sin destino. Exponer el tipo en API pública invita a usarlo mal.

### P2 — ADJUSTMENT y DELETE solo en papel

09 pide ajuste con rol; UI no. `inventory.delete` no borra. Falso sentido de cobertura de permisos.

### P2 — Inactivo en complete

Se puede completar una orden con `prod-004` si la línea quedó de antes. Inferido, no escrito.

### P2 — Lógica de negocio en páginas

`InventoryPage.saveProduct` arma el payload y valida mensajes. `filteredProducts` filtra en cliente (la recarga no manda `search` al repo). `DashboardPage` recalcula low stock. Aceptable en mock; el API debe soportar search/paginación para no clonar reglas.

### P2 — `02-mapa-entidades` afirma que ADJUSTMENT puede dejar negativo

`stockAfterMovement` ya lo impide. Doc comercial desactualizado.

### P3 — Sin proveedores, bodegas, códigos de barras, impuestos en producto, imagen

Alineado al alcance. No son deudas del MVP de aceite.

### P3 — Acoplamiento Inventario ← Órdenes/Ventas/Sugerencias/Dashboard

Esperado. El riesgo es que complete vuelva a mutar `products` a mano. Mitigación: un solo servicio `applyMovement`.

### P3 — Listado de movimientos sin paginar

Con el tiempo el GET se vuelve pesado. Índice + paginación (enmienda 09).

## 2. Decisiones pendientes (el equipo debe cerrar)

| ID | Pregunta | Recomendación de arquitectura | Si no se decide |
| --- | --- | --- | --- |
| D-SKU | ¿`UNIQUE (business_id, sku)`? | Sí | SKUs duplicados en prod |
| D-STOCK-ALTA | ¿Stock inicial = ENTRY? | Sí, misma transacción | Ledger mentiroso |
| D-PATCH-STOCK | ¿PATCH puede mandar stock? | No | Agujero de integridad |
| D-DINERO | ¿`price_minor`/`numeric(12,3)` vs `number`? | minor + numeric; mapear en HTTP hasta versionar JSON | Redondeos |
| D-PERM-PRECIO | ¿Quién edita precio/costo? | Permiso aparte o solo ADMIN | OPERATOR con write futuro pisa precios |
| D-TRANSFER | ¿Exponer TRANSFER? | 404/400 hasta sedes | Movimientos sin destino |
| D-GET-ID | ¿Documentar GET producto en 09? | Sí, paridad con repo | HttpRepository incompleto |
| D-INACTIVE-COMPLETE | ¿Bloquear cierre si el producto está INACTIVE? | Advertir, no bloquear líneas históricas | — |
| D-PRECIO-ALTA | ¿El alta de inventario pide precio? | Sí, al menos para vender; opcional para solo-consumo | Venta rota en SKUs nuevos |

## 3. Preguntas concretas al negocio

1. ¿Un SKU repetido en el mismo taller es error o se permite?
2. ¿El técnico debe poder ver inventario (hoy sí) sin poder ingresar mercancía (hoy sí: sin write)?
3. ¿El costo debe copiarse en la orden como en la venta?
4. ¿Cancelar una orden **completada** debe existir? Hoy no; no hay RETURN de taller.
5. ¿`inventory.delete` significa inactivar o se retira el permiso de la matriz?

## 4. Qué implementar primero (cuando se escriba código)

Cerrar D-SKU, D-STOCK-ALTA, D-PATCH-STOCK en una nota de una página. Luego UC-INV-01/02/06/07/09. No empezar por proveedores ni balances.

No enmendar 09 en silencio: ticket de contrato con la lista C del doc 05.
