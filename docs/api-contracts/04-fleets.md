# 04 — Fleets

## Endpoints

- `GET /businesses/{businessId}/fleets`
- `POST /businesses/{businessId}/fleets`
- `PATCH /businesses/{businessId}/fleets/{id}`
- `POST /businesses/{businessId}/fleets/{id}/vehicles/{vehicleId}/assign`
- `POST /businesses/{businessId}/fleets/{id}/vehicles/{vehicleId}/unassign`
- `GET /businesses/{businessId}/fleets/{id}/summary`

## Listado — query (pendiente HTTP)

El frontend ya envía estos parámetros en `FleetRepository.list`. El mock los aplica sobre el conjunto completo. **El backend HTTP aún no existe** (`useMocks: true`); al añadir `HttpFleetRepository` hay que respetar el mismo contrato. No simular paginación en el cliente si el API devolviera el array entero.

```http
GET /businesses/{businessId}/fleets?search=&status=&page=1&pageSize=25&sortBy=name&sortDir=asc
```

| Param      | Default | Notas                                                                        |
| ---------- | ------- | ---------------------------------------------------------------------------- |
| `search`   | —       | Nombre de flota, descripción y nombre del cliente (razón / nombre comercial) |
| `status`   | —       | `ACTIVE` \| `INACTIVE`                                                       |
| `page`     | `1`     | Base 1                                                                       |
| `pageSize` | `25`    | Permitidos en UI: 10, 25, 50, 100                                            |
| `sortBy`   | `name`  | `name` \| `customerName` \| `vehicleCount` \| `status`                       |
| `sortDir`  | `asc`   | `asc` \| `desc`                                                              |

Respuesta: `{ items, total, page, pageSize }`. Cada ítem incluye `customerName` y `vehicleCount` **calculados en servidor** (no hace falta un GET de vehículos por fila). Búsqueda y orden se aplican **antes** de recortar la página.

## Reglas

- Una flota pertenece a un `customerId` tipo COMPANY.
- Una flota puede tener varios vehículos. Un vehículo tiene como máximo una asignación abierta (`unassignedAt` nulo).
- Asignar cierra la asignación previa activa y actualiza `vehicle.fleetId`.
- Summary: `onTrack` / `upcoming` / `overdue` cuentan **vehículos** según `maintenance_schedules` (OVERDUE > UPCOMING > al día). No mezclar con documentos ni órdenes.
- La UI de asignados pagina con `GET vehicles?fleetId=` ([03-vehicles.md](./03-vehicles.md)). `summary.vehicles` sigue siendo un recorte para el resumen, no el listado operativo.

## Summary

```json
{
  "fleet": {},
  "vehicleCount": 10,
  "onTrack": 7,
  "upcoming": 2,
  "overdue": 1,
  "vehicles": [
    { "id": "...", "plate": "XYZ456", "brand": "Chevrolet", "line": "N300", "status": "ACTIVE" }
  ]
}
```

`onTrack + upcoming + overdue === vehicleCount`. Un selector de asignación con miles de unidades del cliente queda como mejora (búsqueda paginada); el mock lista por `customerId` con `pageSize` 100 y excluye `fleetId` de la flota actual.

## Qué cubre cada capa

| Capa         | Estado                                                                                           |
| ------------ | ------------------------------------------------------------------------------------------------ |
| UI           | Listado independiente + detalle `/fleets/:id`; query params; asignación/desasignación en detalle |
| Mock         | Filtro + sort + slice; proyección; summary por vehículo; assign cierra previa                    |
| Backend HTTP | Pendiente: mismos query params, proyección, summary por vehículo, `vehicles?fleetId=`            |
