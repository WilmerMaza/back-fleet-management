# KONTI API

API NestJS de Gestión y Trazabilidad Vehicular. PostgreSQL + Prisma.  
Multi-tenant: el tenant es `Business` (empresa que contrata KONTI). `Customer` es el cliente del taller.

Contratos de producto: repositorio frontend [`WilmerMaza/fleet-management`](https://github.com/WilmerMaza/fleet-management) (`docs/api-contracts/`). Spec de inventario: [`docs/PRODUCTS_INVENTORY_SPEC.md`](docs/PRODUCTS_INVENTORY_SPEC.md).

## Arranque

```bash
cp .env.example .env
npm install
npm run db:up
npx prisma generate
npx prisma migrate deploy
npx tsx prisma/seed.ts
npm run start:dev
```

API: `http://localhost:3000/api/v1`  
Health: `GET /api/v1/health`  
CORS por defecto: `http://localhost:4200`

## Demo

| Usuario | Password | Negocio |
| --- | --- | --- |
| `admin@fleet.local` | `demo123` | Taller Demo Fleet |
| `inventario@fleet.local` | `demo123` | Taller Demo Fleet |
| `admin@norte.local` | `demo123` | Lubricantes del Norte |
| `operador@fleet.local` | `demo123` | ambos (enviar `businessId`) |

IDs de negocio:

- Demo `11111111-1111-4111-8111-111111111111`
- Norte `22222222-2222-4222-8222-222222222222`

```bash
TOKEN=$(curl -s http://localhost:3000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@fleet.local","password":"demo123"}' | jq -r .accessToken)

curl http://localhost:3000/api/v1/businesses/11111111-1111-4111-8111-111111111111/customers \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Business-Id: 11111111-1111-4111-8111-111111111111"
```

## Logs

`LOG_PROVIDER`: `console` | `better_stack` | `both`

## Pruebas

```bash
npm test          # unitarias
npm run test:int  # PostgreSQL real (Testcontainers)
```

## Qué hay

Listo: login JWT, productos, inventario, clientes, vehículos, flotas, auditoría, tenancy.

Pendiente: órdenes HTTP, ventas HTTP, usuarios/roles HTTP.
