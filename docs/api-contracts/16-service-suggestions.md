# 16 — Sugerencias de producto y ejecución de líneas

Contrato que el mock ya cumple y que un `HttpRepository` futuro debe respetar sin cambiar las pantallas. No hay rutas HTTP publicadas: el cliente habla con `ServiceSuggestionRepository` y con los métodos nuevos de `ServiceOrderRepository`.

No incluye facturación. La venta directa está en [17-sales.md](./17-sales.md) y no llena `deliveredQuantity` de la orden.

## Catálogo de sugerencias

Una sugerencia pertenece a una empresa y a un tipo de servicio. Un producto puede aparecer en varios servicios. No puede haber dos sugerencias activas del mismo producto en el mismo servicio.

```text
GET    sugerencias?serviceTypeId=
POST   sugerencias
PATCH  sugerencias/{id}
GET    sugerencias/{id}/reglas
POST   sugerencias/{id}/reglas
PATCH  reglas/{id}
POST   sugerencias/resolve
```

`resolve` recibe el tipo de servicio y, si existe, el perfil del vehículo: marca, línea, año, motorización y versión. Devuelve productos activos con cantidad, unidad, precio de catálogo en el momento de la consulta, stock informativo y origen `GENERAL` o `VEHICLE`.

Reglas:

- Sin criterios, la sugerencia general aplica.
- Una regla solo coincide si cada criterio informado coincide. Un criterio vacío es comodín.
- Gana la regla compatible más específica. Pesos: versión 16, motorización 8, año 4, línea 2, marca 1. Empate: la más reciente.
- `ADJUST_QUANTITY` cambia la cantidad. `SUBSTITUTE` cambia el producto si el sustituto está activo.
- Un producto inactivo no se recomienda. Si el sustituto está inactivo, se prueba la siguiente regla y luego la sugerencia general.
- Resolver no escribe órdenes ni inventario.

## Línea de orden

Al agregar un producto se copian nombre, unidad y `unitPrice`. Cambiar el precio del catálogo o la sugerencia no reescribe líneas ya guardadas.

| Campo                          | Significado                                 |
| ------------------------------ | ------------------------------------------- |
| `quantity` / `plannedQuantity` | Previsto en la orden. Se mantienen iguales. |
| `suggestedQuantity`            | Lo que propuso el catálogo. Informativo.    |
| `reservedQuantity`             | Siempre 0. No hay reserva.                  |
| `consumedQuantity`             | Lo que el técnico registra como usado.      |
| `unusedQuantity`               | Lo que no se usó. No devuelve stock.        |
| `deliveredQuantity`            | Sin uso hasta que exista una venta.         |

`source`: `SUGGESTED_GENERAL`, `SUGGESTED_VEHICLE` o `MANUAL`.

El alta y el registro de uso no crean movimientos. El cierre crea un `EXIT` por la cantidad a consumir (`consumedQuantity`, o `plannedQuantity` / `quantity` en órdenes viejas) y omite ítems `NOT_PERFORMED`. Si el stock no alcanza, el mock no cambia kilometraje ni stock.

## Servicios adicionales

Un ítem creado con la orden es `INITIAL` y `PLANNED`. Un ítem agregado con la orden abierta o en progreso es `ADDITIONAL` y `PENDING_AUTHORIZATION`.

`DONE` en un adicional exige una autorización `APPROVED` de ese ítem. `NOT_PERFORMED` no exige autorización y no descuenta. Rechazar deja el ítem pendiente: no lo ejecuta.

Permiso de pantalla `orders.authorize`: administrador y operador. El técnico puede pedir la autorización. El mock no aplica el permiso; lo oculta la interfaz.

## Auditoría

`SUGGESTION_CHANGED`, `ORDER_ITEM_ADDED`, `ORDER_PRODUCT_CHANGED`, `CONSUMPTION_RECORDED`, `SERVICE_ITEM_RESULT`, `SERVICE_AUTHORIZATION_REQUESTED`, `SERVICE_AUTHORIZATION_DECIDED`.

La moneda mostrada como COP es solo presentación. El modelo no tiene campo de divisa.
