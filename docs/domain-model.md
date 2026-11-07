# Domain model — Fleet Management

Fuente funcional: plataforma de gestión y trazabilidad vehicular.

## Principios

1. **Multitenancy:** KONTI sirve a varias empresas cliente. El tenant es `Business` (`businesses`). `Customer` es el cliente del taller, dentro de un tenant. Contrato: `docs/api-contracts/00-multitenancy.md`. Toda entidad operativa tiene `businessId`.
2. Núcleo genérico de servicios (`service_types`, `service_orders`, `service_order_items`). No existe `oil_changes`.
3. Evidencias polimórficas (`attachments.entityType` + `entityId`).
4. Mantenimiento por reglas (km / tiempo / lo que ocurra primero).
5. Auditoría de acciones críticas (`audit_logs`).
6. La placa no es PK; el vehículo usa UUID interno.

## Entidades MVP 1

| Entidad             | Tabla sugerida             | Notas                                 |
| ------------------- | -------------------------- | ------------------------------------- |
| Business            | `businesses`               | Tenant                                |
| User                | `users`                    | Identidad global; roles en `user_business_roles` |
| Role / Permission   | `roles`, `permissions`     | RBAC                                  |
| Customer            | `customers`                | `PERSON` \| `COMPANY`                 |
| Vehicle             | `vehicles`                 | + `vehicle_mileage_logs`              |
| Fleet               | `fleets`, `fleet_vehicles` | N:M histórica                         |
| ServiceType         | `service_types`            | código configurable                   |
| ServiceOrder        | `service_orders`           | estados con máquina de transiciones   |
| ServiceOrderItem    | `service_order_items`      | + product usages                      |
| Product             | `products`                 | stock actual                          |
| InventoryMovement   | `inventory_movements`      | ENTRY/EXIT/ADJUSTMENT/RETURN/TRANSFER |
| Attachment          | `attachments`              | storage externo + metadata            |
| MaintenanceSchedule | `maintenance_schedules`    | reglas + estado evaluado              |
| AuditLog            | `audit_logs`               | append-only                           |

## Relación conceptual

```text
businesses
 ├── users  ←── created_by / operator / technician / closed_by / uploaded_by / actor_user_id
 ├── customers
 │    └── vehicles
 │         └── vehicle_mileage_logs (recorded_by → users)
 ├── fleets
 │    └── fleet_vehicles → vehicles
 ├── service_types
 ├── service_orders
 │    ├── service_order_items
 │    └── attachments (entity_type + entity_id; uploaded_by → users)
 ├── products
 │    └── inventory_movements
 ├── maintenance_schedules
 └── audit_logs (append-only; actor_user_id → users; entity_type + entity_id)
```

Contrato de auditoría y metadata: `docs/api-contracts/07-audit.md`.

## Efectos al completar una orden (CAMBIO_ACEITE u otros)

1. Transicionar orden a `COMPLETED` y fijar `closedAt`.
2. Actualizar `vehicle.currentMileage` y crear `vehicle_mileage_logs`.
3. Crear movimientos `EXIT` por cada producto usado (transacción atómica).
4. Upsert `maintenance_schedules` según regla.
5. Escribir `audit_logs` (`SERVICE_ORDER_COMPLETED`, y los de km / inventario / mantenimiento si aplican). Fijar `closed_by_user_id`.
6. (MVP2) Encolar notificación `MAINTENANCE_SCHEDULED` / `SERVICE_COMPLETED`.

## Evolución comercial

Catálogo con precios, inventario, ventas y facturación se auditan en [`docs/arquitectura-comercial/README.md`](./arquitectura-comercial/README.md). El mock ya tiene venta directa (`Sale`, sin orden ni vehículo), sugerencias de producto por tipo de servicio y líneas de orden con precio copiado. La facturación electrónica sigue pendiente. `VehicleDocument` sigue siendo SOAT/RTM/seguro, no una factura.

## Ambientes

| Env     | Frontend                         | Backend            |
| ------- | -------------------------------- | ------------------ |
| DEV     | `useMocks: true` (actual)        | opcional           |
| QA/PROD | `useMocks: false` + `apiBaseUrl` | JWT + storage + DB |
