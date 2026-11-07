# 01 — Auth / Users / Business

## Endpoints

### POST `/auth/login`

Body:

```json
{ "email": "admin@fleet.local", "password": "***", "businessId": "opcional si la identidad tiene un solo negocio" }
```

Response 200:

```json
{
  "accessToken": "...",
  "refreshToken": "...",
  "user": { "id": "...", "email": "...", "fullName": "...", "roleCodes": ["ADMIN"], "businessId": "..." },
  "business": { "id": "...", "name": "..." },
  "availableBusinesses": [{ "id": "...", "name": "..." }]
}
```

### POST `/auth/refresh`

Body: `{ "refreshToken": "..." }` → nueva sesión.

### POST `/auth/forgot-password`

Body: `{ "email": "..." }` → 202 Accepted (no revela existencia).

### GET `/businesses/{businessId}/users`

Lista usuarios del negocio. Roles: ADMIN.

### GET `/businesses/{businessId}/users/{userId}`

Detalle del usuario (sin contraseña). Roles: `users.admin`.

### POST `/businesses/{businessId}/users`

Crear usuario y asignar `roleCodes`.

```json
{ "email": "ana@fleet.local", "fullName": "Ana Pérez", "phone": "3001112233", "roleCodes": ["OPERATOR"], "password": "***" }
```

La respuesta no incluye la contraseña. Mock: mínimo 8 caracteres; correo único por negocio.

### PATCH `/businesses/{businessId}/users/{userId}`

Actualizar estado, roles, datos y, si viene, contraseña. No se puede dejar el negocio sin un `ADMIN` activo.

## Roles iniciales

`ADMIN | OPERATOR | TECHNICIAN | INVENTORY | FLEET_MANAGER | CUSTOMER`

## Reglas

- KONTI es multi-tenant: ver [00-multitenancy.md](./00-multitenancy.md).
- Un usuario puede pertenecer a uno o más negocios (`user_business_roles`). MVP1: un negocio activo por sesión.
- Varios negocios y login sin `businessId` → 409 `SELECT_BUSINESS`.
- CUSTOMER no accede al panel operación.
- `INACTIVE` en la identidad bloquea login. `INACTIVE` en la membresía oculta ese negocio.
- Soft-delete / status `INACTIVE` de membresía no borra al usuario en otros talleres.

## Criterios de aceptación

- Login inválido → 401.
- Token sin negocio → 403 en rutas tenant.
- ADMIN puede listar usuarios de su negocio solamente.
