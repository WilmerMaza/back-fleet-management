# Orden global de bloqueos (fila) — KONTI API

Convención para operaciones concurrentes sobre PostgreSQL (`SELECT … FOR UPDATE`).
Objetivo: serializar invariantes sin deadlocks entre flotas, vehículos e inventario.

## Orden canónico

```text
1. service_orders(id)     — futuro (complete); aún no implementado
2. fleets(id)             — si el flujo toca flota (assign/unassign/create+fleet/update fleet)
3. vehicles(id)           — assign/unassign/update vehicle (km, dueño)
4. products(id) ASC       — inventario; siempre ordenados por id
5. satélites              — maintenance_schedules, etc. (futuro)
```

**Regla:** adquirir locks en ese orden ascendente de recurso; nunca `vehicle → fleet` ni `product → vehicle` si otro camino usa el orden inverso.

## Flujos actuales (OC-01 … OC-04)

| Operación | Locks |
| --- | --- |
| `AssignVehicleUseCase` | `fleets` → `vehicles` |
| `UnassignVehicleUseCase` | `fleets` → `vehicles` |
| `UpdateFleetUseCase` | `fleets` |
| `CreateVehicleUseCase` (+ `fleetId`) | `fleets` (luego insert vehículo/asignación) |
| `UpdateVehicleUseCase` | `vehicles` |
| `InventoryStockService.apply` | `products` |

## Notas

- Aislamiento por defecto de Prisma `$transaction`: **READ COMMITTED**. La serialización efectiva es el `FOR UPDATE`.
- Ledger de asignación abierta (`fleet_vehicles.unassigned_at IS NULL`) es fuente de verdad; `vehicles.fleet_id` es proyección y se escribe bajo el mismo lock de vehículo.
- Inventario no participa en el grafo flota↔vehículo hoy; Complete Order deberá respetar este documento (ver auditoría operativa OC-11).
