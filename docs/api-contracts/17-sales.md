# 17 — Ventas directas

Contrato del mock. No hay `HttpRepository`. No es una orden de servicio ni una factura electrónica.

Una venta no tiene vehículo ni orden. Puede usar un cliente registrado o consumidor final. El precio, el nombre, el SKU y la moneda se copian al agregar la línea. Cambiar el catálogo o el cliente después no reescribe la venta.

## Estados

- Venta: `DRAFT`, `CONFIRMED`, `CANCELLED`. Un borrador se edita. Una confirmada no vuelve a borrador.
- Pago: `PENDING`, `PARTIAL`, `PAID`. Confirmar no crea un pago.
- Facturación: `NOT_REQUESTED`. No hay CUFE, ni validación DIAN, ni un comprobante presentado como factura.

## Operaciones

El cliente llama a `SaleRepository`. Confirmar y cancelar escriben inventario dentro de esa operación.

- Crear borrador. No mueve stock.
- Agregar, cambiar cantidad o quitar línea. El mismo producto se consolida en una línea y conserva el precio ya copiado.
- Confirmar. Exige stock de todas las líneas. Si falta, no hay salida parcial y la venta sigue en borrador. La misma `operationId` no descuenta dos veces. Otra llamada sobre una venta ya confirmada se rechaza.
- Registrar uno o varios pagos, sin pasarela. No pueden superar el total.
- Cancelar. Si `returnToStock` es verdadero, se escribe un `RETURN` que apunta al `EXIT` original. El movimiento original no se edita ni se borra. Si es falso, la mercancía no vuelve al disponible. Repetir la misma `operationId` no duplica la entrada.

## Dinero e impuestos

Los importes son enteros en unidades menores (`amountMinor`) con `currencyCode` y `currencyScale`. La cantidad de producto va en milésimas. No se multiplica con flotantes.

La demo copia `COP` y escala 0 desde la configuración de la empresa en el momento del alta. No es la única moneda del modelo.

No hay tarifas de impuesto. `taxAmountMinor` queda en 0 y `taxConfigured` en falso hasta que exista una configuración por producto. No se inventa un porcentaje.

El costo de catálogo, si existe, se copia y solo se devuelve a quien tiene `sales.sensitive.read`.

Cambiar el precio de una línea exige `sales.price.override` y deja `PRICE_OVERRIDDEN` con el usuario. El precio de la mano de obra no forma parte de esta venta.

## Permisos

`nav.sales`, `sales.create`, `sales.draft.write`, `sales.confirm`, `sales.price.override`, `sales.discount`, `sales.payment.write`, `sales.cancel`, `sales.sensitive.read`.

El mock los resuelve con el rol del `actorUserId` en los usuarios de demo. El navegador no puede concederse un permiso que el rol no tiene. El backend deberá tomar el permiso del token, no de un campo enviado por la página.

## Inventario y atomicidad

La salida usa `relatedEntityType = SALE`. No hay bodega: la ubicación sigue pendiente (DT-06).

El mock valida el stock, escribe y, si una escritura falla después de haber movido algo, compensa con entradas. Eso evita una venta confirmada con salidas incompletas en este proceso. No es una transacción ACID: otro caso de uso puede mover el mismo producto y el proceso no tiene bloqueo de fila. El backend debe confirmar la venta y las salidas en una sola transacción, con bloqueo o versión del saldo.

## Perfil de la empresa

`sellerProfile` responde `null`. Razón social, identificación tributaria, dirección fiscal y proveedor tecnológico pueden existir después. No se piden para vender.

## Lo que el backend todavía debe garantizar

- Transacción real de confirmación y de cancelación con devolución.
- Permisos desde la sesión, no desde el cuerpo.
- Idempotencia persistida de `operationId` entre procesos.
- Moneda de la empresa configurable, no solo el valor de demo.
- Tarifas de impuesto cuando el negocio las defina.
- Documento tributario en otro agregado, leyendo esta venta sin convertirse en ella.
