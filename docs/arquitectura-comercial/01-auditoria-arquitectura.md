# 01 — Auditoría de arquitectura actual

Fecha: 2026-11-02. Alcance: repositorio `fleet-management`. No se modificó código de producto.

## 1. Qué es el sistema hoy

Angular 22 standalone, Signals y RxJS. La UI usa Angular Material como infraestructura y tokens KONTI como identidad. El acceso a datos sigue el patrón `Repository` abstracto → token DI → `*MockRepository` → `MockDb` en memoria.

`environment.ts` tiene `useMocks: true` y `apiBaseUrl: http://localhost:3000/api/v1`. `environment.prod.ts` pone `useMocks: false`, pero `provideDataAccess()` deja vacío el bloque “sin mocks” y **sigue registrando mocks**. No existe ninguna clase `HttpRepository`.

No hay carpeta de backend, ni Prisma, ni SQL, ni migraciones. `docs/PLAN_EJECUCION_COMPLETO.md` marca el backend en 0 %. Los mocks se pierden al recargar la página.

`design-system/MASTER.md` y `DESIGN.md` definen identidad visual. `design-system/screens/DECISIONS.md` registra decisiones de UI (D1–D13), no reglas comerciales de precio, inventario o facturación.

## 2. Capas

```text
features / shared (UI)
        ↓  inject(XXX_REPOSITORY)
core (shell, guards, permisos de menú, navegación)
        ↓
data-access
  models/          contrato TypeScript
  repositories/    clases abstractas
  tokens/          InjectionToken
  mocks/           única implementación
```

La UI de features no llama `HttpClient` para el dominio. El índice de código (`docs/codebase/DATA-FLOW.md`) reporta **0** relaciones `consumes_endpoint`.

## 3. Persistencia y contratos HTTP

| Capa                        | Estado                                                                                                |
| --------------------------- | ----------------------------------------------------------------------------------------------------- |
| Modelo TypeScript           | Sí, en `src/app/data-access/models/`                                                                  |
| Repository abstracto + mock | Sí, para auth, clientes, vehículos, flotas, catálogo, órdenes, inventario, evidencias y mantenimiento |
| HTTP                        | No implementado. Los markdown de `docs/api-contracts/` son el contrato previsto, no un servidor       |
| Base de datos               | No existe en el repositorio                                                                           |
| Permisos en servidor        | No existen. El mapa rol → permiso está en el frontend (`role-permissions.map.ts`)                     |

## 4. Módulos

Leyenda de operaciones: lo que la **pantalla** hace, no solo lo que el repositorio expone. “Mock” significa comportamiento en memoria.

### 4.1 Identidad y usuarios

|            |                                                                                                                                                                             |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rutas      | `/auth/login`; `/app/users`                                                                                                                                                 |
| Pantallas  | `LoginPage`, `UsersPage` (solo lectura)                                                                                                                                     |
| Modelo     | `User`, `Role`, `Permission`, `Business`, `AuthSession`                                                                                                                     |
| Repository | `AuthRepository`: `login`, `refresh`, `listUsers`                                                                                                                           |
| Mock       | `AuthMockRepository`                                                                                                                                                        |
| CRUD       | Login y listado. No hay alta, edición ni baja de usuarios en UI. El contrato `01-auth.md` describe `POST/PATCH` de usuarios y `forgot-password`; no están en el repositorio |
| Permisos   | `NavUsers` en la ruta. Roles: `ADMIN`, `OPERATOR`, `TECHNICIAN`, `INVENTORY`, `FLEET_MANAGER`, `CUSTOMER`                                                                   |
| Pruebas    | `login.page.spec.ts`, `login-form.spec.ts`, `users.page.spec.ts`, `permission.guard.spec.ts`                                                                                |

`Permission` y `Role` están modelados. La sesión mock no entrega `permissionCodes`; `PermissionService` expande `ROLE_PERMISSIONS`.

### 4.2 Clientes

|            |                                                          |
| ---------- | -------------------------------------------------------- |
| Rutas      | `/app/customers`, `/new`, `/:id`, `/:id/edit`            |
| Pantallas  | listado, formulario, detalle                             |
| Modelo     | `Customer` (`PERSON` \| `COMPANY`) con `businessId`      |
| Repository | list, getById, create, update                            |
| Mock       | `CustomerMockRepository`                                 |
| CRUD       | Alta, edición, inactivar. Sin borrado físico             |
| Relaciones | Un cliente tiene vehículos. La orden guarda `customerId` |
| Permisos   | `NavCustomers`, `CustomersWrite`                         |
| Pruebas    | página, formulario, detalle y mock                       |

### 4.3 Vehículos

|            |                                                                                              |
| ---------- | -------------------------------------------------------------------------------------------- |
| Rutas      | `/app/vehicles`, `/new`, `/:id` (hoja de vida), `/:id/edit`                                  |
| Modelo     | `Vehicle`, `VehicleMileageLog`, `VehicleLifeHistory`                                         |
| Repository | list, getById, create, update, getLifeHistory, listMileageLogs                               |
| Mock       | `VehicleMockRepository`                                                                      |
| CRUD       | Alta, edición, inactivar, hoja de vida                                                       |
| Relaciones | `customerId`, `fleetId` opcional. El km sube al completar una orden (`source=SERVICE_ORDER`) |
| Permisos   | `NavVehicles`, `VehiclesWrite`                                                               |
| Pruebas    | listado, formulario, hoja de vida, acciones y mock                                           |

### 4.4 Flotas

|            |                                                                                        |
| ---------- | -------------------------------------------------------------------------------------- |
| Rutas      | `/app/fleets`, `/new`, `/:id`, `/:id/edit`                                             |
| Modelo     | `Fleet`, `FleetVehicle` (asignación con `assignedAt` / `unassignedAt`), `FleetSummary` |
| Repository | list, getById, create, update, assignVehicle, unassignVehicle, getSummary              |
| Mock       | `FleetMockRepository`                                                                  |
| CRUD       | Alta, edición, asignar y desasignar vehículos                                          |
| Permisos   | `NavFleets`, `FleetsWrite`                                                             |
| Pruebas    | listado, formulario, detalle, query y mock                                             |

### 4.5 Catálogo de servicios

No es un catálogo de productos ni de precios.

|            |                                                                                                                                      |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Ruta       | `/app/service-catalog`                                                                                                               |
| Pantalla   | `ServiceCatalogPage`: listar y crear                                                                                                 |
| Modelo     | `ServiceType`: `code`, `name`, `category`, `description`, `status`, `parameters`                                                     |
| Repository | list, create, update                                                                                                                 |
| Mock       | `ServiceCatalogMockRepository`. Pasa `code` a mayúsculas. No comprueba unicidad, aunque `05-service-catalog.md` la exige por negocio |
| CRUD en UI | Crear. No hay edición ni activar/desactivar en la pantalla, aunque `update` existe en el repositorio                                 |
| Precio     | No hay campo de precio ni de impuesto                                                                                                |
| Permisos   | `NavServiceCatalog`, `ServiceCatalogWrite`                                                                                           |
| Pruebas    | `service-catalog.page.spec.ts`. Sin spec del mock                                                                                    |

### 4.6 Órdenes de servicio

|                        |                                                                                                                                           |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Rutas                  | `/app/orders`, `/app/orders/new`, `/app/orders/:id`                                                                                       |
| Pantallas              | `OrdersPage`, `OrderWizardPage`, `OrderDetailPage`, `OrderCompleteDialogComponent`                                                        |
| Servicio de aplicación | `OrderListStateService` (estado de listado en cliente). No hay un servicio de dominio aparte del repositorio                              |
| Modelo                 | `ServiceOrder`, `ServiceOrderItem`, `ServiceOrderProductUsage`                                                                            |
| Repository             | list, getById, create, update, changeStatus, complete, listActivity                                                                       |
| Mock                   | `ServiceOrderMockRepository`                                                                                                              |
| Permisos               | Ruta: `NavOrders`. Escritura: `OrdersWrite`. Cierre: `OrdersComplete`                                                                     |
| Pruebas                | listado, wizard, ficha, diálogo de cierre, mock de listado/transición. El spec del mock **no** cubre el descuento de stock ni el rollback |

Estados en código: `DRAFT`, `OPEN`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`.

El wizard crea la orden ya en `OPEN` con uno o más ítems. Cada ítem es un tipo de servicio. Los productos cuelgan del ítem (`productUsages`), no de la cabecera. La ficha muestra ítems y productos en solo lectura: no agrega servicios ni productos después del alta. Sí permite observaciones, cambio de estado, evidencias e historial mientras la orden no está cerrada.

`update` rechaza órdenes `COMPLETED` y `CANCELLED`. Un `PATCH` genérico podría reemplazar `items` si alguien lo envía; la ficha solo manda `observations` y, al cerrar, `mileage`.

Transiciones del mapa `SERVICE_ORDER_TRANSITIONS`:

- `DRAFT` → `OPEN` \| `CANCELLED`
- `OPEN` → `IN_PROGRESS` \| `CANCELLED`
- `IN_PROGRESS` → `CANCELLED`
- `COMPLETED` y `CANCELLED` no salen

`changeStatus('COMPLETED')` no usa ese mapa: delega en `complete()`. `complete()` acepta `OPEN` e `IN_PROGRESS`. La UI ofrece “Completar” en ambos. El diagrama de `06-service-orders.md` dibuja `COMPLETED` solo desde `IN_PROGRESS`. El mock y la UI permiten saltarse “en progreso”.

Efectos de `complete()` en el mock, en este orden y **sin rollback**:

1. Exige estado `OPEN` o `IN_PROGRESS`.
2. Si el km de la orden es menor que el del vehículo, falla antes de mutar.
3. Actualiza `vehicle.currentMileage`, inserta `mileageLogs` y audita `MILEAGE_UPDATED`.
4. Por cada `productUsages` de cada ítem: si no hay stock, lanza error **después** de haber descontado los productos anteriores y de haber movido el km. Escribe `EXIT` directo en `mockDb`, sin pasar por `InventoryRepository`.
5. Upsert de `maintenanceSchedules` para el primer ítem si hay próxima fecha o km. Escribe una fila en `notifications` del `MockDb`. No audita `MAINTENANCE_SCHEDULE_UPSERTED`.
6. Pasa la orden a `COMPLETED`, fija `closedAt` y `closedByUserId` (operador o creador, no necesariamente el usuario de la sesión) y audita `SERVICE_ORDER_COMPLETED`.

No escribe `INVENTORY_MOVEMENT_CREATED`, aunque `07-audit.md` lo pide por cada salida.

No hay estado por ítem, ni cantidad prevista distinta de la consumida, ni precio, ni autorización, ni resultado de la tarea. `quantity` se interpreta como consumo al cerrar.

### 4.7 Inventario y productos

|            |                                                                                         |
| ---------- | --------------------------------------------------------------------------------------- |
| Ruta       | `/app/inventory`                                                                        |
| Pantalla   | `InventoryPage`                                                                         |
| Modelo     | `Product`, `InventoryMovement`                                                          |
| Repository | listProducts, getProduct, createProduct, updateProduct, listMovements, registerMovement |
| Mock       | `InventoryMockRepository`                                                               |
| Permisos   | Ruta: `NavInventory`. Escritura: `InventoryWrite`                                       |
| Pruebas    | `inventory.page.spec.ts` (UI). No hay spec del mock                                     |

Detalle en [02-mapa-entidades.md](./02-mapa-entidades.md) y en la sección de inventario de la matriz.

La pantalla lista productos (SKU, nombre, stock, mínimo) y movimientos. Permite crear producto y registrar un `ENTRY`. El filtro de stock bajo es en cliente. No muestra precio ni costo. No hay ficha de producto, ni ajuste, ni devolución, ni transferencia, ni edición, aunque `updateProduct` existe.

`OPERATOR` no tiene `NavInventory`. `TECHNICIAN` ve inventario y no tiene `InventoryWrite`. `INVENTORY` escribe inventario y ve órdenes, sin `OrdersWrite`.

### 4.8 Evidencias

|             |                                                                                                                 |
| ----------- | --------------------------------------------------------------------------------------------------------------- |
| Ruta propia | No. Se usan desde la ficha de orden y la hoja de vida                                                           |
| Modelo      | `Attachment` polimórfico: `entityType` + `entityId`                                                             |
| Tipos       | `SERVICE_ORDER`, `VEHICLE`, `VEHICLE_DOCUMENT`, `MAINTENANCE`, `INSPECTION`                                     |
| Repository  | list, upload, remove                                                                                            |
| Mock        | Guarda data URL o un placeholder y audita `ATTACHMENT_UPLOADED` / `ATTACHMENT_DELETED`                          |
| UI de orden | Alta con archivo o cámara (`capture="environment"`). No hay botón de borrar en la ficha, aunque `remove` existe |
| Contrato    | `08-attachments.md` pide URL firmada. El mock no la implementa                                                  |
| Pruebas     | Cubiertas en parte por `order-detail.page.spec.ts`. Sin spec del mock                                           |

Las evidencias cuelgan de la orden, no de cada servicio.

### 4.9 Mantenimiento

|            |                                                                                               |
| ---------- | --------------------------------------------------------------------------------------------- |
| Ruta       | `/app/maintenance`                                                                            |
| Modelo     | `MaintenanceSchedule`                                                                         |
| Repository | list, upsert, evaluate                                                                        |
| Mock       | `MaintenanceMockRepository`. El cierre de orden también escribe schedules directo en `MockDb` |
| UI         | Listado y evaluar. Sin editor de reglas                                                       |
| Permisos   | `NavMaintenance`                                                                              |
| Pruebas    | `maintenance.page.spec.ts`                                                                    |

### 4.10 Documentos

Hay dos significados. Solo uno existe como modelo, y ninguno es una factura.

| Qué                                                                                | Estado                                                                                                                               |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Documentos del vehículo (`VehicleDocument`: SOAT, tecnomecánica, seguro, impuesto) | Modelo en `document.model.ts`. Sin repository, sin mock, sin token. Ruta `/app/documents` es placeholder (`15-documents.md`, MVP2/3) |
| Factura, remisión comercial, cotización                                            | No hay modelo, ruta ni contrato                                                                                                      |

### 4.11 Placeholders y restos

| Ruta                                        | Estado                                                                                                                                  |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `/app/notifications`                        | Placeholder. El modelo `AppNotification` existe. El mock de órdenes inserta filas en `mockDb.notifications`. No hay repository ni token |
| `/app/reports`                              | Placeholder                                                                                                                             |
| `/app/portal-customer`, `/app/portal-fleet` | Placeholder                                                                                                                             |
| `/app/plan`                                 | Página informativa del plan de producto                                                                                                 |
| `/app/dashboard`                            | Lee conteos reales de los repositorios mock (clientes, vehículos, órdenes, inventario, mantenimiento)                                   |
| `features/settings/`                        | Solo `settings-sections.ts`. Sin ruta. `DECISIONS.md` deja Configuración fuera del menú hasta que haya función real                     |

### 4.12 Auditoría

Modelo `AuditLog` append-only en el mock. Acciones declaradas: clientes, vehículos, km, orden creada / estado / completada, movimiento de inventario, adjunto subido o borrado, mantenimiento upsert.

Escrituras reales observadas:

| Acción                            | ¿El mock la escribe?                    |
| --------------------------------- | --------------------------------------- |
| `SERVICE_ORDER_CREATED`           | Sí, en create                           |
| `SERVICE_ORDER_STATUS_CHANGED`    | Sí, en changeStatus                     |
| `SERVICE_ORDER_COMPLETED`         | Sí                                      |
| `MILEAGE_UPDATED`                 | Sí, dentro de complete                  |
| `ATTACHMENT_UPLOADED` / `DELETED` | Sí, en el mock de evidencias            |
| `INVENTORY_MOVEMENT_CREATED`      | No. Ni `registerMovement` ni `complete` |
| `MAINTENANCE_SCHEDULE_UPSERTED`   | No, en el cierre de orden               |

No hay `GET /audit-logs`. La ficha usa `listActivity`, que filtra logs de la orden y de adjuntos cuyo padre es la orden.

## 5. Cobertura de pruebas (dominio comercial)

| Área                             | Spec de UI                      | Spec de mock                                       | Qué no está probado                                        |
| -------------------------------- | ------------------------------- | -------------------------------------------------- | ---------------------------------------------------------- |
| Órdenes                          | listado, wizard, ficha, diálogo | filtro, paginación, actividad, transición inválida | stock, doble cierre, fallo a mitad de productos, precio    |
| Inventario                       | página                          | no                                                 | stock negativo, ajuste, idempotencia, vínculo con la orden |
| Catálogo de servicios            | página                          | no                                                 | unicidad de código, precio                                 |
| Ventas, autorizaciones, facturas | no                              | no                                                 | todo el dominio                                            |

## 6. Móvil para el técnico

No hay app nativa ni módulo móvil distinto. El técnico entra a la misma web con rol `TECHNICIAN` (`OrdersWrite`, `OrdersComplete`, ver inventario). El listado de órdenes tiene layout bajo 767 px y la ficha bajo 900 px y 767 px. La evidencia acepta cámara trasera. Desde la ficha no puede agregar servicios ni productos ni registrar un consumo parcial.
