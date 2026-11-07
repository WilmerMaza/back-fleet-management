# KONTI API

API NestJS de Gestión y Trazabilidad Vehicular. PostgreSQL + Prisma.  
Multi-tenant: el tenant es `Business` (empresa que contrata KONTI). `Customer` es el cliente del taller.

## Documentación (local)

| Doc | Uso |
| --- | --- |
| [`docs/INDEX.md`](docs/INDEX.md) | Índice para humanos y agentes IA |
| [`docs/PLAN.md`](docs/PLAN.md) | Stack, arquitectura, orden de cortes |
| [`docs/api-contracts/`](docs/api-contracts/) | Contratos HTTP (espejo del front) |
| [`docs/domain-model.md`](docs/domain-model.md) | Modelo de dominio |
| [`docs/PRODUCTS_INVENTORY_SPEC.md`](docs/PRODUCTS_INVENTORY_SPEC.md) | Spec de inventario |
| [`AGENTS.md`](AGENTS.md) | Contexto operativo para agentes |

Frontend hermano: [`WilmerMaza/fleet-management`](https://github.com/WilmerMaza/fleet-management). Ver [`docs/SOURCE.md`](docs/SOURCE.md) para el origen de las copias.

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
npm run db:verify-constraints  # CHECK e índices parciales SQL (H-03)
```

Tras `prisma migrate deploy`, conviene verificar las restricciones documentadas en [`docs/db-constraints.md`](docs/db-constraints.md).

## Qué hay

Listo: login JWT, productos, inventario, clientes, vehículos, flotas, auditoría, tenancy.

Pendiente: órdenes HTTP, ventas HTTP, usuarios/roles HTTP.
