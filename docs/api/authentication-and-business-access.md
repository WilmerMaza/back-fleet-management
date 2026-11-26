# API — Autenticación y acceso a negocios

Base: `/api/v1`

## Auth

| Método | Ruta | Auth | Notas |
| --- | --- | --- | --- |
| POST | `/auth/login` | Público | `{ email, password, businessId? }` |
| POST | `/auth/google` | Público | `{ idToken, businessId? }` |
| POST | `/auth/refresh` | Público | `{ refreshToken }` |
| POST | `/auth/logout` | Público | `{ refreshToken }` → 204 |
| POST | `/auth/switch-business` | Bearer | `{ businessId }` |
| GET | `/auth/me` | Bearer | Perfil + negocio + permisos |
| POST | `/auth/link/google` | Bearer | `{ idToken }` — vincula `sub` a la cuenta |
| POST | `/auth/set-password` | Bearer | `{ password, currentPassword? }` |

### Códigos relevantes

| Código | HTTP | Cuándo |
| --- | --- | --- |
| `SELECT_BUSINESS` | 409 | Varias membresías ACTIVE sin `businessId` |
| `ACCOUNT_EXISTS` | 409 | Google email ya tiene cuenta password sin identity |
| `EMAIL_NOT_VERIFIED` | 403 | Google sin `email_verified` |
| `GOOGLE_NOT_CONFIGURED` | 503 | Falta `GOOGLE_CLIENT_ID` |
| `TENANT_ACCESS_DENIED` | 403 | Sin membresía / negocio inválido |

## Roles (negocio)

| Método | Ruta | Permiso |
| --- | --- | --- |
| GET | `/businesses/:businessId/roles` | `roles.read` |
| POST | `/businesses/:businessId/roles` | `roles.write` |

## Seed superadmin

- Email: `wilmermaza10@gmail.com`
- Password: `demo123`
- `platform_role`: `SUPER_ADMIN`
- Membresía ADMIN en Taller Demo Fleet
- Vincular Google: login password → `POST /auth/link/google` (o UI futura)

## Pendiente

Ver [`../authentication/PENDING.md`](../authentication/PENDING.md).
