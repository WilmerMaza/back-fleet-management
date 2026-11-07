# 08 — Riesgos y migraciones

Fecha: 2026-11-02.

## 1. Riesgos actuales (ya están en el mock)

| ID  | Riesgo                                       | Evidencia                                                                                                                  | Efecto                                                                                                                                |
| --- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | El cierre no es atómico                      | `complete()` actualiza km y luego descuenta producto a producto. Si el segundo falla, lanza error y la orden sigue abierta | Km y stock quedan adelantados respecto de la orden. Un reintento puede volver a fallar o descontar de nuevo según lo que haya quedado |
| R2  | Dos escritores de stock                      | `InventoryMockRepository.registerMovement` y el bucle de `complete()`                                                      | Una futura HTTP de inventario no vería las salidas de la orden si el otro camino no la llama                                          |
| R3  | Completar dos veces                          | El segundo `complete()` falla por estado                                                                                   | Protege el caso feliz. No protege el fallo a medias de R1                                                                             |
| R4  | Stock “que aparece” sin movimiento           | `createProduct` asigna `stock`                                                                                             | El historial no cuadra con la existencia                                                                                              |
| R5  | Ajuste negativo                              | `ADJUSTMENT` asigna `quantity` al stock                                                                                    | Rompe la regla “stock nunca negativo” de `09-inventory.md`                                                                            |
| R6  | Transferencia ficticia                       | `TRANSFER` solo resta                                                                                                      | Quien lo use pierde unidades sin destino                                                                                              |
| R7  | Precio de catálogo invisible                 | UI no lee `price`                                                                                                          | No se puede cumplir la decisión 1 en pantalla, aunque el dato esté en la semilla                                                      |
| R8  | Cierre cobra operativamente todo el previsto | Un solo `quantity`, sin estado de ítem                                                                                     | Cuando exista factura, heredar esta regla violaría la decisión 8                                                                      |
| R9  | Permisos solo en el cliente                  | `ROLE_PERMISSIONS`                                                                                                         | Cualquier cliente HTTP futuro podría ajustar stock si el servidor no repite la regla                                                  |
| R10 | `useMocks: false` sigue en mock              | `provide-data-access.ts`                                                                                                   | Un build de producción no habla con el API; parecería “conectado” y seguiría en memoria                                               |
| R11 | Auditoría incompleta del cierre              | No hay log de movimiento ni de mantenimiento                                                                               | La ficha no muestra el descuento como actividad, aunque el stock sí cambió                                                            |
| R12 | Sin persistencia                             | `MockDb`                                                                                                                   | Recargar el navegador borra órdenes, stock y evidencias de la sesión                                                                  |

## 2. Riesgos de la evolución

| ID  | Riesgo                                                    | Mitigación                                                                                                                                                                        |
| --- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1  | Romper el wizard al separar previsto y consumido          | Mientras `consumedQuantity` sea nulo, el cierre demo consume `quantity`. Cuando la ficha guarde consumos, el cierre usa solo esos                                                 |
| E2  | Descuento doble (orden + venta)                           | DT-07: la orden no crea una venta. El documento comercial no genera otro `EXIT`                                                                                                   |
| E3  | Agregar servicios sin autorización                        | No habilitar el alta en ficha hasta la Fase D, o nacer el ítem en `PENDING_AUTHORIZATION` y bloquear `DONE`                                                                       |
| E4  | Tratar el comprobante como factura legal                  | Copy de UI y nombre `CommercialDocument`. Sin DIAN en el modelo                                                                                                                   |
| E5  | Precio de servicio supuesto                               | No añadir campo ni línea de mano de obra hasta cerrar DT-04                                                                                                                       |
| E6  | `PATCH` de la orden pisa ítems                            | Operaciones de línea propias. El `update` de observaciones no debe aceptar `items` desde la ficha                                                                                 |
| E7  | Contrato `06` y la UI divergen sobre `OPEN` → `COMPLETED` | Decidir una regla y actualizar el markdown **o** el mock en el mismo cambio. No dejarlos distintos                                                                                |
| E8  | Semilla de movimientos vacía                              | Al enseñar historial, las órdenes demo cerradas no tienen `EXIT`. Documentarlo en la demo o generar los movimientos al construir la semilla, una sola vez, sin volver a descontar |

## 3. Migración de datos

No hay base que migrar. La “migración” es de **formas del mock** y, después, el primer esquema SQL.

### Mock, sin romper el demo

1. Campos nuevos opcionales. Los objetos viejos siguen siendo válidos.
2. `quantity` se lee como prevista.
3. Lectura de consumo: `consumedQuantity ?? quantity` solo en el modo legado del cierre. El modo nuevo (ítem con `executionStatus`) no usa ese comodín: `NOT_PERFORMED` aporta 0.
4. Precios de la semilla se muestran; no hace falta reescribir ids `prod-001` y `prod-002`.
5. No borrar `complete()`, `changeStatus()` ni los tokens actuales.
6. Repositorios nuevos: token nuevo en `repositories.tokens.ts` y clase mock. `provideDataAccess()` los registra junto a los demás.

### Primer esquema (cuando exista backend)

Orden sugerido de tablas, todas con `business_id`:

1. Las que `docs/domain-model.md` ya nombra y el frontend ya usa: negocios, usuarios, clientes, vehículos, flotas, tipos de servicio, productos, movimientos, órdenes, ítems, usos, adjuntos, mantenimiento, auditoría.
2. Columnas nuevas sobre ítem y uso (estado, cantidades, precio copiado), nulas para filas viejas.
3. `sales`, `sale_lines`, `service_authorizations`, `commercial_documents`, `commercial_document_lines`.
4. Índice único de idempotencia de movimientos.
5. Restricción de stock ≥ 0 en la misma transacción que el movimiento.

No hace falta script de datos productivos: no hay productivos en el repo.

### Compatibilidad de `HttpRepository`

Cada método abstracto actual debe tener un equivalente HTTP antes de apagar el mock de ese módulo. Apagar todos a la vez deja el prod en el estado de R10 si el `if (!useMocks)` sigue vacío.

Los métodos nuevos no se simulan con `HttpClient` dentro de la página. Van al repository, igual que el resto.

## 4. Pruebas que la evolución tiene que añadir

Hoy no existen y cubren los riesgos R1–R5:

- Cierre con dos productos y fallo del segundo: stock y km iguales al inicio.
- Segundo cierre de la misma orden: un solo `EXIT` por producto.
- Alta de producto: existe un movimiento que explica el stock.
- `ADJUSTMENT` por debajo de cero: error.
- Ítem `NOT_PERFORMED`: ningún movimiento y ninguna línea de documento.
- Venta entregada: `EXIT` con `relatedEntityType=SALE` y sin fila en `serviceOrders`.
- Repetir la preparación del documento: un solo documento por origen.

## 5. Qué queda fuera de la migración

Reservas, bodegas, impuestos, factura electrónica, portal de firma y listas de precios por cliente. Entran solo con una decisión nueva y un contrato propio, no como columnas “por si acaso” en `Product` o `ServiceOrder`.
