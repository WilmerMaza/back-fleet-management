# 13 — Portal cliente particular (MVP2 stub)

## Scope

Usuario rol `CUSTOMER` solo ve vehículos donde `customerId` = su cliente vinculado.

## Endpoints (futuros)

- `GET /portal/me/vehicles`
- `GET /portal/me/vehicles/{id}/life-history`
- `GET /portal/me/vehicles/{id}/maintenance`
- `GET /portal/me/vehicles/{id}/documents`
- `GET /portal/me/notifications`

## Auth

Login propio o vinculación invitación. Consulta placa+documento solo como bootstrap, no como seguridad permanente.
