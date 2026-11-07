# API contracts — índice

Cómo construir el API (stack, capas, tenancy, orden de cortes): [`docs/PLAN.md`](../PLAN.md). Índice IA: [`docs/INDEX.md`](../INDEX.md).

Base URL: `/api/v1`

Headers comunes:

```http
Authorization: Bearer <access_token>
X-Business-Id: <business_uuid>
Content-Type: application/json
```

## MVP 1 (implementar backend)

| Archivo                                                  | Dominio                                                               |
| -------------------------------------------------------- | --------------------------------------------------------------------- |
| [00-architecture.md](./00-architecture.md)               | Arquitectura, errores, paginación                                     |
| [00-multitenancy.md](./00-multitenancy.md)               | **Tenant = Business.** Aislamiento, JWT, login, QA                    |
| [01-auth.md](./01-auth.md)                               | Login, refresh, usuarios, roles                                       |
| [18-roles.md](./18-roles.md)                             | Roles y matriz ver/editar/eliminar (mock)                             |
| [02-customers.md](./02-customers.md)                     | Clientes PERSON/COMPANY                                               |
| [03-vehicles.md](./03-vehicles.md)                       | Vehículos, kilometraje, hoja de vida                                  |
| [04-fleets.md](./04-fleets.md)                           | Flotas y asignación                                                   |
| [05-service-catalog.md](./05-service-catalog.md)         | Catálogo de tipos de servicio                                         |
| [06-service-orders.md](./06-service-orders.md)           | Órdenes + completar con efectos                                       |
| [16-service-suggestions.md](./16-service-suggestions.md) | Sugerencias por servicio y ejecución de líneas (mock; HTTP pendiente) |
| [17-sales.md](./17-sales.md)                             | Ventas directas, pagos e inventario (mock; HTTP pendiente)            |
| [07-audit.md](./07-audit.md)                             | `audit_logs`, actores de orden y evidencias                           |
| [08-attachments.md](./08-attachments.md)                 | Evidencias / storage                                                  |
| [09-inventory.md](./09-inventory.md)                     | Productos y movimientos                                               |
| [11-maintenance.md](./11-maintenance.md)                 | Mantenimiento programado                                              |

## MVP 2 / 3 / expansión (stubs)

| Archivo                                          | Dominio                                     |
| ------------------------------------------------ | ------------------------------------------- |
| [12-notifications.md](./12-notifications.md)     | Motor de notificaciones                     |
| [13-portal-customer.md](./13-portal-customer.md) | Portal particular                           |
| [14-portal-fleet.md](./14-portal-fleet.md)       | Portal empresa                              |
| [15-documents.md](./15-documents.md)             | Documentos / SOAT / RTM / seguros           |
| [22-reports.md](./22-reports.md)                 | Reportes avanzados                          |
| [24-expansion.md](./24-expansion.md)             | Llantas, baterías, proveedores, marketplace |

## Evolución comercial (no es contrato vigente)

La auditoría de precios, inventario, ventas, órdenes, autorizaciones y documentos de cobro está en [`docs/arquitectura-comercial/`](../arquitectura-comercial/README.md). Los endpoints propuestos allí no sustituyen los archivos de esta carpeta hasta que se aprueben e implementen. `15-documents.md` sigue siendo documentos del vehículo, no facturas.
