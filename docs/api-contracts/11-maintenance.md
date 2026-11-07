# 11 — Maintenance schedules

## Endpoints

- `GET /businesses/{businessId}/maintenance-schedules?vehicleId=&status=`
- `POST /businesses/{businessId}/maintenance-schedules`
- `PATCH /businesses/{businessId}/maintenance-schedules/{id}`
- `POST /businesses/{businessId}/maintenance-schedules/evaluate`

## Reglas de evaluación

- `MILEAGE`: overdue si `vehicle.currentMileage >= nextDueMileage`
- `TIME`: overdue si `today >= nextDueDate`
- `WHICHEVER_FIRST`: overdue si cualquiera se cumple
- `UPCOMING`: umbral configurable (ej. 1000 km o 15 días)

## Job

Cron periódico llama evaluate por negocio (o global) y dispara notificaciones.

## Campos

```json
{
  "vehicleId": "...",
  "serviceTypeId": "...",
  "serviceTypeCode": "CAMBIO_ACEITE",
  "ruleType": "WHICHEVER_FIRST",
  "everyKm": 10000,
  "everyMonths": 6,
  "nextDueMileage": 95430,
  "nextDueDate": "2027-01-02",
  "lastServiceMileage": 85430,
  "lastServiceDate": "2026-10-02",
  "status": "SCHEDULED|UPCOMING|OVERDUE|DONE|CANCELLED",
  "sourceOrderId": "..."
}
```
