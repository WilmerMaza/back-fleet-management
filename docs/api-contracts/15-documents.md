# 15 — Documents / SOAT / RTM / Seguros (MVP3 stub)

## Principio

Usar `vehicle_documents` genérico. No columnas `soat_*` en `vehicles`.

## Endpoints (futuros)

- `GET /businesses/{businessId}/vehicles/{id}/documents`
- `POST /businesses/{businessId}/vehicles/{id}/documents`
- `PATCH /businesses/{businessId}/documents/{id}`

## Campos

`type: SOAT|TECNOMECANICA|SEGURO|IMPUESTO|OTHER`, `number`, `issuer`, `issuedAt`, `expiresAt`, `status`, `attachmentIds`.

## Backend debe

1. Calcular status VALID/EXPIRING/EXPIRED.
2. Job diario de vencimientos → notificaciones.
3. Historial de renovaciones (nuevos registros, no overwrite ciego).
