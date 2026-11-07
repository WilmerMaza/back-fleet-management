# 12 — Notifications (MVP2 stub)

## Objetivo

Motor central: eventos de dominio → cola → canales.

## Endpoints (futuros)

- `GET /businesses/{businessId}/notifications`
- `POST /businesses/{businessId}/notifications/{id}/read`
- `GET/PATCH /businesses/{businessId}/notification-settings`

## Canales

`IN_APP` (primero), luego `EMAIL`, `WHATSAPP`, `SMS`, `PUSH`.

## Eventos iniciales

- MAINTENANCE_UPCOMING / OVERDUE
- DOCUMENT_EXPIRING / EXPIRED
- STOCK_LOW
- SERVICE_COMPLETED
- ORDER_READY

## Backend debe

1. Publicar evento al completar órdenes / evaluate mantenimientos.
2. Resolver destinatarios (cliente, fleet manager, operadores).
3. Persistir `notifications` + intentos de envío.
4. Idempotencia por `eventType + relatedEntityId + channel + window`.
