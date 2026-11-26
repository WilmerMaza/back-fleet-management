# KONTI — Especificación técnica definitiva

## Módulos de Productos e Inventario

**Versión:** 1.0  
**Fecha:** 2 de noviembre de 2026  
**Estado:** Aprobada para implementación  
**Código:** `backend/` (NestJS)

El texto normativo completo está en el repositorio de implementación. Este archivo apunta al código y resume lo que el API cumple.

Implementación: `backend/src/modules/products`, `backend/src/modules/inventory`.  
Decisiones: SKU único normalizado (trim + mayúsculas), stock inicial → `ENTRY`, PATCH no toca stock, `TRANSFER` no se expone, precio opcional, inactivo no bloquea complete de orden ya abierta.

**Lote 3 (operaciones):** `InventoryStockService` único escritor (`FOR UPDATE`, `operationKey`, TX). Endpoints: entrada/salida (`inventory-movements` / `inventory-exits`), ajuste (`inventory-adjustments`, motivo obligatorio), recepción multi-línea (`purchase-receipts`). Consumo de órdenes: `consumeForServiceOrder` (idempotente por `order:{id}:exit:{productId}`; sin módulo Nest de órdenes aún).
