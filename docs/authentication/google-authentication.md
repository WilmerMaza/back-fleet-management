# Autenticación con Google (OIDC)

| | |
| --- | --- |
| Estado | Implementado (MVP) |
| Decisiones | [`DECISIONS.md`](./DECISIONS.md) |
| Pendiente | [`PENDING.md`](./PENDING.md) |

## Flujo

1. Angular obtiene un **ID token** de Google Identity Services (`GOOGLE_CLIENT_ID`).
2. `POST /api/v1/auth/google` `{ "idToken": "..." }`.
3. Backend valida con JWKS oficial (`google-auth-library`): firma, `aud`, `iss`, exp, `email_verified`.
4. Identidad estable: claim **`sub`** → tabla `auth_identities`.
5. Emisión de sesión KONTI vía `SessionIssuer` (access 15m + refresh rotativo).

## Reglas

- No auto-vincular por email si ya existe cuenta password → `409 ACCOUNT_EXISTS`.
- Vincular: usuario autenticado → `POST /auth/link/google`.
- Email no verificado → `403 EMAIL_NOT_VERIFIED`.
- Sin `GOOGLE_CLIENT_ID` → `503 GOOGLE_NOT_CONFIGURED`.

## Variables

```bash
GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
```

Google Cloud Console: OAuth client tipo Web, orígenes `http://localhost:4200`, sin redirect URI obligatorio si solo usas ID token (GIS One Tap / botón).

## Endpoints relacionados

| Método | Ruta | Auth |
| --- | --- | --- |
| POST | `/auth/google` | Público |
| POST | `/auth/link/google` | Bearer |
| POST | `/auth/set-password` | Bearer |
| GET | `/auth/me` | Bearer |
