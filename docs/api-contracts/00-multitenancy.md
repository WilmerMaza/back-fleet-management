# 00 — Multitenancy KONTI

Contrato de partida para el backend. KONTI **es multi-tenant**: cada empresa cliente de la plataforma es un negocio aislado, no un “cliente” del módulo de clientes.

## Vocabulario (no mezclar)

| Término | Tabla / tipo | Qué es |
| --- | --- | --- |
| **Tenant / negocio** | `businesses` | Empresa que contrata KONTI y usa **toda** la plataforma. |
| **Usuario** | `users` + `user_business_roles` | Persona. Puede operar en **uno o más** negocios. |
| **Cliente del taller** | `customers` (`PERSON` \| `COMPANY`) | Dueño de vehículos **dentro** de un tenant. Nunca es el tenant. |

Un `Customer` tipo `COMPANY` (“Transportes Magdalena”) vive **dentro** de un `Business` (“Taller Demo Fleet”). No comparte datos con otro taller.

## Modelo de aislamiento

- Base de datos compartida, columna `business_id` (UUID, `NOT NULL`, índice) en **toda** tabla operativa.
- No hay base por cliente en MVP. El aislamiento es de fila + middleware, no de schema.
- `users` es identidad global (correo único en la plataforma).
- `user_business_roles` (`user_id`, `business_id`, `role_codes[]`, `status`) es la membresía. Los roles y el alta/baja en un taller no borran al usuario en otro.
- La sesión lleva **un** negocio activo. Cambiar de taller es cambiar el contexto, no mezclar catálogos.

```text
businesses
 ├── user_business_roles → users
 ├── roles / permissions
 ├── customers → vehicles → …
 ├── fleets, service_types, products, service_orders, sales, …
 └── audit_logs
```

## Request autenticado

```http
Authorization: Bearer <jwt>
X-Business-Id: <uuid del negocio activo>
```

JWT (mínimo):

```json
{
  "sub": "<userId>",
  "activeBusinessId": "<uuid>",
  "businessIds": ["<uuid>", "<uuid>"],
  "roles": ["OPERATOR"]
}
```

Reglas:

1. El middleware resuelve el tenant de `X-Business-Id` **o**, si falta, de `activeBusinessId`.
2. Si el header no está en `businessIds` del token → **403** (cross-tenant).
3. Toda query/comando filtra por ese `business_id`. Un `GET` de otro taller con un id adivinado → **404** o **403**, nunca el recurso.
4. Usuario `INACTIVE` en la identidad no autentica. Membresía `INACTIVE` oculta ese negocio.
5. `CUSTOMER` (rol) no entra al panel de operación.

## Login

`POST /auth/login`

```json
{ "email": "operador@fleet.local", "password": "***", "businessId": "opcional" }
```

- Un solo negocio activo → sesión directa.
- Varios negocios y **sin** `businessId` → **409** `SELECT_BUSINESS` con la lista `{ id, name }` (sin filtrar datos operativos).
- `businessId` que no pertenece al usuario → **403**.
- Respuesta 200: tokens + `user` proyectado al negocio (`businessId` + `roleCodes` de esa membresía) + `business` + `availableBusinesses`.

`POST /auth/switch-business` `{ "businessId" }` con sesión válida emite nuevo access token (mismos `businessIds`, otro `activeBusinessId` y `roles`).

## Lo que el backend no hace en este contrato

- No hay consola “superadmin KONTI” todavía (el alta del primer `businesses` es operación de plataforma, no del taller).
- No hay sede / sucursal distinta del tenant (el shell lo deja como capacidad futura).
- Facturación entre KONTI y el taller queda fuera de MVP 1.

## Criterios de aceptación (QA tenancy)

- Dos negocios semilla no listan los clientes, vehículos ni órdenes del otro.
- El mismo usuario en dos negocios ve roles y menú del **negocio activo**.
- Un request con `X-Business-Id` ajeno al token no lee ni escribe.
- Inactivar la membresía en A no impide entrar a B.
- No queda el negocio sin un `ADMIN` activo en esa membresía.

Demo mock: `admin@fleet.local` → Taller Demo Fleet; `admin@norte.local` → Lubricantes del Norte; `operador@fleet.local` / `demo123` → selector de negocio.
