# Membresías empresariales

## Hoy

- Tabla `user_business_roles` (`UserBusinessMembership`): PK `(user_id, business_id)`, `role_codes[]`, `status` ACTIVE|INACTIVE.
- Un access token lleva **un** `activeBusinessId`.
- Cambio de taller: `POST /auth/switch-business`.

## Ampliaciones diferidas

Ver [`../authentication/PENDING.md`](../authentication/PENDING.md):

- Estados `PENDING` / `REVOKED`.
- Tabla puente `membership_roles` (roles custom por id).
- Invitaciones y join requests.

## Plataforma

`users.platform_role = SUPER_ADMIN` no sustituye la membresía de taller; permite sesión sin tenant activo en rutas de plataforma (futuro `/admin`).
