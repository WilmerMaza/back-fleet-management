# 08 — Attachments (evidencias)

## Endpoints

- `GET /businesses/{businessId}/attachments?entityType=&entityId=`
- `POST /businesses/{businessId}/attachments/upload-url` → URL firmada
- `POST /businesses/{businessId}/attachments` → confirma metadata tras upload
- `DELETE /businesses/{businessId}/attachments/{id}`

## Entidad

```json
{
  "id": "uuid",
  "entityType": "SERVICE_ORDER|VEHICLE|VEHICLE_DOCUMENT|MAINTENANCE|INSPECTION",
  "entityId": "uuid",
  "fileName": "kilometraje.jpg",
  "mimeType": "image/jpeg",
  "sizeBytes": 12345,
  "url": "https://...",
  "label": "kilometraje",
  "uploadedAt": "ISO",
  "uploadedBy": "user-uuid",
  "uploadedByName": "Carlos Pérez"
}
```

`uploadedBy` es obligatorio al confirmar el alta. `uploadedByName` es snapshot de `users.fullName` (la UI de hoja de vida no lista usuarios). Relación: `attachments.entity_id` → PK del padre; `audit_logs.entity_id` del upload → PK del adjunto. Detalle: [07-audit.md](./07-audit.md).

## Reglas

- Módulo transversal: no acoplar solo a aceite.
- Permisos de visualización por rol (CUSTOMER solo evidencias autorizadas).
- Borrado lógico preferible; físico opcional. Ambos escriben `ATTACHMENT_DELETED`.
- Confirmación de metadata escribe `ATTACHMENT_UPLOADED` (`actor_user_id` = `uploaded_by`).
- Validar mime/size server-side.
