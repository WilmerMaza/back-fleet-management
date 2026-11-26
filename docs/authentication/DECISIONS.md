# Auth multiempresa — Decisiones cerradas

| | |
| --- | --- |
| Fecha | 2026-11-07 |

## Producto

| ID | Decisión |
| --- | --- |
| D1 | Login **password + Google** (dual). Demos seed se mantienen hasta retiro explícito. |
| D2 | `password_hash` **nullable**. Usuario Google-only puede **establecer contraseña** después. |
| D3 | **No** auto-vincular Google por coincidencia de email. Vincular: sesión autenticada + `POST /auth/link/google`, o (futuro) invitación con email verificado. Identidad estable = Google `sub`. Requiere `email_verified`. |
| D4 | Refresh en cookie HttpOnly + CSRF double-submit (`XSRF-TOKEN` / `X-XSRF-TOKEN`). Access sigue en body + Bearer. |
| D5 | Front: **no** guardar refresh en `localStorage`. Access en memoria; restore vía `POST /auth/refresh` + cookie. CSRF en `sessionStorage`. |
| D6 | Tablas `roles` / `permissions`. `SUPER_ADMIN` = plataforma. `ADMIN` = empresa. Empresas crean roles propios. |
| D7 | RBAC persistido en BD (con fallback temporal al mapa código). |
| D8 | Seed `wilmermaza10@gmail.com` = `SUPER_ADMIN`, password inicial `demo123`, también podrá vincular Google. |
| D9 | Ampliar `businesses` con datos legales/contacto/`status`. |
| D10 | **No** implementar aún invitaciones, join/register requests, onboarding avanzado, panel aprobación. Ver `PENDING.md`. |
| D11 | UI con **ambas** opciones de login. |

## Técnicas

- Validar ID token Google en backend (JWKS / `google-auth-library`).
- `provider_user_id` = claim `sub`.
- Conservar refresh rotativo y `SessionIssuer` existente.
- Migraciones incrementales; sin reset destructivo.
- Autorización siempre en backend.
