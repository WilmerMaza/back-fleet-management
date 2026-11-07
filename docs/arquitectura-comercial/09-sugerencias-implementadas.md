# Sugerencias implementadas

Corte del 2026-11-02 sobre el mock. Ventas, facturación electrónica, reservas y bodegas siguen fuera.

## Decisiones

1. Las sugerencias viven en `ServiceSuggestionRepository`, no dentro del catálogo de tipos ni de la orden. Cambiar una sugerencia no recorre órdenes existentes.
2. La orden guarda una copia de cantidad y precio al agregar la línea. El catálogo puede cambiar después.
3. Dos servicios que recomiendan el mismo producto generan dos líneas. No se fusionan.
4. No hay reserva. `reservedQuantity` queda en 0. Cargar sugerencias o crear la orden no escribe movimientos.
5. El único escritor de stock del mock es `mockDb.applyInventoryMovement`. El cierre valida el consumo antes de tocar kilometraje o stock.
6. Un servicio agregado durante la ejecución nace pendiente de autorización. No se puede marcar realizado sin una autorización aprobada, registrada por un usuario con permiso, no por un portal del cliente.
7. La versión del vehículo es opcional. Una regla que exige versión no aplica a un vehículo que no la tiene.
8. El precio de mano de obra del tipo de servicio sigue sin decidirse (DT-04). Esta entrega solo copia el precio del producto.

## Auditoría de interfaz

Pantallas de trabajo, no una landing. Se mantienen los tokens KONTI, la tabla del catálogo y la ficha de orden. No se abrió un modal para configurar reglas: la regla se escribe en la misma página del servicio.

| Pantalla             | Pregunta que responde                                                       | Decisión                                                                                                              |
| -------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Catálogo → Productos | Qué repuestos propone este servicio y cuándo el vehículo cambia la cantidad | Lista por sugerencia, regla en línea, producto inactivo visible como advertencia                                      |
| Paso 2 de la orden   | Qué repuestos entran al alcance inicial                                     | Tarjetas con origen general o del vehículo, cantidad, precio copiado y stock. Se puede quitar, cambiar o sumar a mano |
| Ficha en ejecución   | Qué se usó y qué servicio nuevo sigue sin autorización                      | Mismas tarjetas, más usado / sin usar, y acciones de autorización                                                     |

Estados: sin sugerencias se puede seguir y agregar a mano. Error de carga de sugerencias no bloquea el alta manual. El estimado es de repuestos, no una factura.

Movimiento: las tarjetas entran con opacidad y 8px, 180ms, con la curva ya definida en `$easing-standard`. `prefers-reduced-motion` deja el contenido quieto. El hover de presión solo aplica con puntero fino. No se anima el teclado ni el guardado.

En teléfono las acciones de la ficha siguen en el muelle inferior existente. Los controles nuevos tienen al menos 44px de alto.

No se ejecutó el inspector de páginas estáticas: estas vistas viven dentro del shell Angular. La comprobación visual es con el navegador sobre el servidor de desarrollo.

## Riesgos que siguen

- El mock no es una transacción de base de datos. Si un movimiento fallara después de escribir el kilometraje, el estado quedaría a medias. La validación previa hace que el caso de stock insuficiente no llegue a escribir.
- `TRANSFER` sigue restando sin destino. Un ajuste negativo se rechaza.
- La auditoría de sugerencias usa el actor de demo `user-admin`, no la sesión.
- Los permisos los oculta la interfaz. El mock acepta la operación igual.
- COP es solo formato. No hay moneda en el modelo.
- `complete` de órdenes antiguas sin `consumedQuantity` descuenta `quantity`, como antes.
- No hay `HttpRepository`. El contrato está en `docs/api-contracts/16-service-suggestions.md`.
