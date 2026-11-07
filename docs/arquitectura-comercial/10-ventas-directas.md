# Ventas directas

Corte implementado en el mock. Sigue vigente DT-07: la venta no contiene una orden y la orden no crea una venta. El cierre de taller y esta confirmación no descuentan el mismo producto dos veces porque son operaciones distintas.

## Qué se hizo

- Agregado `Sale` con borrador, confirmada y cancelada.
- Pago aparte: pendiente, parcial o pagada. Confirmar no paga.
- Facturación en `NOT_REQUESTED`. Sin CUFE y sin simular la DIAN.
- Moneda persistida en la venta. La demo usa COP con escala 0, copiada al crear. El modelo acepta otro código.
- Importes enteros. Cantidades en milésimas. Sin tarifas de impuesto inventadas.
- Fotografía de cliente, SKU, nombre, precio de catálogo y precio aplicado.
- Salida de inventario solo al confirmar. Cancelar devuelve stock únicamente si se declara que la mercancía volvió.
- Permisos resueltos con el usuario de la sesión de demo. El técnico no vende. El operador no cambia precios ni ve el costo.

## Qué no se tocó

- Precio de mano de obra (DT-04 sigue bloqueado).
- `HttpRepository`.
- Bodegas (DT-06). El movimiento no tiene ubicación.
- Documentos de vehículo. Siguen siendo SOAT, RTM y seguros.

## Limitación del mock

Validar antes de escribir y compensar si una salida falla no equivale a una transacción. Dos confirmaciones en el mismo hilo no se pisan porque el estado cambia antes de responder, pero no hay `SELECT … FOR UPDATE`. El detalle está en `docs/api-contracts/17-sales.md`.
