# 03 — Diagramas de proceso

Fecha: 2026-11-02.

## 1. Alta y cierre de orden (comportamiento actual del mock)

```mermaid
flowchart TD
  wizard["Wizard /app/orders/new"] --> create["ServiceOrderMockRepository.create"]
  create --> open["Orden OPEN con items y productUsages"]
  open --> stock0["Stock sin cambios"]
  open --> ficha["Ficha /app/orders/:id"]
  ficha --> start["changeStatus IN_PROGRESS"]
  ficha --> evidence["AttachmentMockRepository.upload"]
  ficha --> notes["update observations"]
  start --> stock1["Stock sin cambios"]
  ficha --> dialog["Diálogo: km de cierre"]
  dialog --> patch["update mileage"]
  patch --> complete["complete"]
  complete --> km["Actualiza vehículo y mileage log"]
  km --> exit["Por cada productUsage: EXIT y resta stock en MockDb"]
  exit --> maint["Upsert mantenimiento y notificación en memoria"]
  maint --> closed["Orden COMPLETED"]
  exit -->|"stock insuficiente a mitad"| parcial["Km y salidas previas ya quedaron escritos. La orden no cierra"]
```

La ficha no tiene paso para agregar un servicio ni para marcar un ítem como no realizado. Cancelar una orden abierta no revierte inventario, porque todavía no hubo salida. No se puede cancelar una orden completada, así que las salidas del cierre no tienen reversa en la UI.

## 2. Inventario manual (pantalla actual)

```mermaid
flowchart LR
  alta["Nuevo producto con stock inicial"] --> prod["Product.stock sin movimiento"]
  ingreso["Ingreso rápido"] --> entry["registerMovement ENTRY"]
  entry --> mov["InventoryMovement + stock"]
  orden["complete de una orden"] --> direct["Escritura directa en mockDb.products y inventoryMovements"]
```

Ajuste, devolución y transferencia existen en `registerMovement` y no tienen pantalla.

## 3. Flujo objetivo (propuesta)

Sigue siendo un solo backend y una sola base, cuando existan. Las cajas son módulos de aplicación, no microservicios.

```mermaid
flowchart TD
  subgraph catalogo [Catálogo]
    st["ServiceType"]
    pr["Product con price y cost"]
  end
  subgraph ordenes [Órdenes]
    so["ServiceOrder"]
    item["Ítem: previsto, autorizado, ejecutado o no realizado"]
  end
  subgraph authz [Autorizaciones]
    az["Autorización del adicional"]
  end
  subgraph inv [Inventario]
    mov["InventoryMovement"]
  end
  subgraph ventas [Ventas]
    sale["Sale sin orden"]
  end
  subgraph docs [Documentos comerciales]
    doc["CommercialDocument"]
  end

  st --> item
  pr --> item
  item -->|"adicional durante la ejecución"| az
  az -->|"APPROVED antes de ejecutar"| item
  item -->|"consumedQuantity al confirmar consumo"| mov
  pr --> sale
  sale -->|"entrega"| mov
  item -->|"solo ejecutado y consumido"| doc
  sale -->|"líneas entregadas"| doc
```

## 4. Confirmar trabajos (objetivo)

Un caso de uso coordina los módulos dentro de **una** transacción de base de datos para el trabajo y el stock. El documento comercial va en un segundo paso idempotente: si falla el armado de la factura, el taller no se deshace y el paso se puede reintentar. Así se cumple la independencia de responsabilidades sin un bus de eventos.

```mermaid
sequenceDiagram
  participant UI
  participant Caso as Confirmar trabajos
  participant Orden
  participant Inv as Inventario
  participant Doc as Documento comercial

  UI->>Caso: confirmar orden
  Caso->>Orden: ítems DONE o NOT_PERFORMED, consumos
  Caso->>Inv: EXIT por cantidad consumida, clave de idempotencia
  Note over Caso,Inv: Una transacción. Si falla el stock, no hay km ni cierre a medias
  Caso-->>UI: orden cerrada, facturación pendiente
  UI->>Doc: preparar documento
  Doc->>Orden: lee líneas hechas y precios ya copiados
  Doc-->>UI: documento en borrador
```

## 5. Venta directa (objetivo)

No crea `ServiceOrder`. Al confirmar la entrega, inventario registra `EXIT` con `relatedEntityType=SALE`. El documento comercial sale de la venta, no de una orden.

## 6. Qué no cambia

- Cliente, vehículo y flota siguen siendo el contexto de la orden.
- El alta de la orden sigue sin descontar stock.
- Las evidencias siguen siendo `Attachment` sobre la orden.
- SOAT y RTM siguen en `VehicleDocument`, fuera de la facturación.
