# 05 — Service catalog

## Endpoints

- `GET /businesses/{businessId}/service-types`
- `POST /businesses/{businessId}/service-types`
- `PATCH /businesses/{businessId}/service-types/{id}`

## Entidad

```json
{
  "code": "CAMBIO_ACEITE",
  "name": "Cambio de aceite",
  "category": "MANTENIMIENTO",
  "status": "ACTIVE",
  "parameters": { "defaultEveryKm": 10000, "defaultEveryMonths": 6 }
}
```

## Reglas

- `code` unique por negocio, uppercase.
- Desactivar (`INACTIVE`) no elimina historial.
- Nuevos tipos (SOAT, LLANTAS, etc.) no requieren migración de esquema del núcleo.
