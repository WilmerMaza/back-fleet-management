# Plan de ejecución completo — Plataforma de Gestión y Trazabilidad Vehicular

Documento de ejecución técnica y funcional para completar **todo el sistema**.

- **Producto:** Fleet Management
- **Repo frontend:** `/home/renlt367/wilmer/fleet-management`
- **Fuente funcional:** `plataforma_gestion_trazabilidad_vehicular.md`
- **Contratos API por dominio:** `docs/api-contracts/`
- **Modelo de dominio:** `docs/domain-model.md`
- **Enfoque actual:** frontend Angular con mocks; backend por implementar según este plan

---

## 0. Cómo usar este documento

Este archivo es la **guía de ejecución** para llegar de cero a plataforma completa.

Para cada fase encontrarás:

1. Objetivo y resultado esperado
2. Qué ya está hecho en el frontend (mocks)
3. Qué falta en frontend
4. Qué debe hacer el backend (detalle)
5. Entidades / datos
6. Reglas de negocio
7. Criterios de aceptación
8. Dependencias

**Orden obligatorio:** no saltar fases del núcleo (0–11) antes de estabilizar MVP 1.

---

## 1. Visión (no negociable)

No construir un sistema exclusivo de cambios de aceite.

Construir una **Plataforma de Gestión y Trazabilidad Vehicular** cuya hoja de vida digital del vehículo concentre:

- servicios y órdenes
- productos/inventario
- evidencias
- mantenimientos
- documentos (SOAT, RTM, seguros, impuestos)
- alertas/notificaciones
- flotas y portales

El cambio de aceite es el **primer caso de uso**, no el núcleo de datos.

### Cadena conceptual

```text
Cliente → Vehículo/Flota → Orden/Servicio → Evidencias → Historial → Alertas
```

### Principios de arquitectura

| #   | Principio                     | Implicación                                  |
| --- | ----------------------------- | -------------------------------------------- |
| 1   | Modularidad                   | Cada dominio es módulo independiente         |
| 2   | Núcleo genérico de servicios  | No existe tabla `oil_changes`                |
| 3   | Multiempresa desde el inicio  | Todo operativo lleva `business_id`           |
| 4   | Evidencias transversales      | Polymórficas por entidad                     |
| 5   | Mantenimiento por reglas      | km / tiempo / lo que ocurra primero / custom |
| 6   | Auditoría                     | Quién hizo qué, cuándo                       |
| 7   | Crecimiento sin romper núcleo | SOAT/llantas/baterías reutilizan componentes |

---

## 2. Estado actual del proyecto (baseline)

> **Snapshot:** 2026-10-27 · Fuente: código en `src/app` + `design-system/screens` + `docs/api-contracts`.  
> Mock ≠ HTTP. Stub ≠ implementado. Ver también `/app/plan` en la app.

### Dashboard de avance

| Ámbito                               |   Avance | Lectura                                     |
| ------------------------------------ | -------: | ------------------------------------------- |
| **Frontend MVP 1** (fases 0–11)      | **~70%** | Núcleo operativo con mocks; demo E2E viable |
| **Frontend MVP 2** (fases 12–14)     |  **~6%** | Solo stubs + dashboard admin básico         |
| **Frontend MVP 3** (fases 15–18)     |  **~2%** | Stub documentos                             |
| **Frontend expansión** (fases 19–24) |  **~1%** | Stub reportes + página plan                 |
| **Frontend transversal** (0–24)      | **~34%** | Ponderado por fases                         |
| **Contratos API** (docs)             | **~95%** | Núcleo + stubs documentados                 |
| **Backend implementado**             |  **~0%** | Sin proyecto API en el repo                 |
| **Plataforma completa** (FE+BE)      | **~19%** | ~50% FE / ~50% BE sobre roadmap 0–24        |

```text
FE MVP1     ████████████████████░░░░░░░░  70%
FE MVP2     ██░░░░░░░░░░░░░░░░░░░░░░░░░░   6%
FE MVP3     █░░░░░░░░░░░░░░░░░░░░░░░░░░░   2%
FE Expans.  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░   1%
Backend     ░░░░░░░░░░░░░░░░░░░░░░░░░░░░   0%
Plataforma  █████░░░░░░░░░░░░░░░░░░░░░░░  19%
```

### Por fase (frontend mocks)

|  Fase | Módulo                            |  FE | Estado                                                                           |
| ----: | --------------------------------- | --: | -------------------------------------------------------------------------------- |
|     0 | Arquitectura base                 | 78% | Parcial — falta interceptor HTTP, errores API, feature flags                     |
|     1 | Identidad y acceso                | 78% | Parcial — login + CRUD users/roles mock + selector de negocio; sin forgot/HTTP   |
|     2 | Clientes                          | 88% | Casi listo — CRUD, detalle, validaciones, inactivar; falta bloqueo en órdenes    |
|     3 | Vehículos                         | 76% | Parcial — CRUD + km; ficha técnica incompleta; sin historial propietarios        |
|     4 | Flotas                            | 90% | Casi listo — crear/asignar/**desasignar**/summary; falta dashboard rico          |
|     5 | Catálogo servicios                | 52% | Parcial — listar/crear; sin editar params ni activar/desactivar UI               |
|     6 | Órdenes                           | 72% | Parcial — listado/detalle/wizard/estados; edición limitada; sin selector técnico |
|     7 | Cambio de aceite                  | 82% | Casi listo — wizard E2E mock; sin PDF; upload = dataUrl mock                     |
|     8 | Evidencias                        | 68% | Parcial — galería + selector/preview; sin eliminar/reordenar UI                  |
|     9 | Inventario                        | 68% | Parcial — productos/ENTRY/movimientos/alerta; sin ajuste/transfer/return         |
|    10 | Hoja de vida                      | 78% | Parcial — timeline rediseñado + filtro tipo; docs/alertas/año pendientes         |
|    11 | Mantenimiento                     | 58% | Parcial — listado + evaluar; sin editor reglas ni marcar DONE                    |
|    12 | Notificaciones                    |  3% | Stub                                                                             |
|    13 | Portal particular                 |  3% | Stub                                                                             |
|    14 | Portal empresa                    |  5% | Stub (+ KPIs admin aparte)                                                       |
| 15–18 | Documentos / SOAT / RTM / seguros |  2% | Stub                                                                             |
| 19–24 | Expansión                         |  1% | Planificado                                                                      |

### Hecho en frontend (mocks) — actualizado

- Scaffold Angular 22 + shell admin KONTI + breadcrumbs + permisos en rutas
- Auth mock + login rediseñado (componentes modulares) + roles/guards
- **Clientes** CRUD completo (listado, alta/edición, detalle, inactivar, unsaved-changes)
- **Vehículos** CRUD + inactivar + **hoja de vida** rediseñada (timeline/KPIs/evidencias)
- **Flotas** listado/form/detalle con asignar y **desasignar** + summary
- Catálogo de servicios (listar/crear)
- Órdenes + wizard cambio de aceite + transiciones de estado + actividad/auditoría
- Evidencias mock (completar + selector archivo → preview)
- Inventario + descuento al completar
- Mantenimiento programado (listado + evaluación)
- Design system: specs por módulo + auditorías visuales (clientes, flotas, vehículos, shell, login…)
- Mapa de código (`docs/codebase/`) + skill codebase-mapping
- Contrato `07-audit.md` + modelo `audit.model.ts` en mocks
- Stubs de notificaciones, documentos, reportes, portales
- Contratos API documentados en `docs/api-contracts/`

### No hecho (pendiente global)

- Backend real (API, DB, storage, cola)
- Persistencia real (los mocks se pierden al recargar)
- `XxxHttpRepository` + interceptor Bearer / `X-Business-Id`
- Notificaciones reales
- Portales particular/empresa productivos
- Documentos SOAT/RTM/seguros
- Cierre de huecos MVP1 (catálogo edit, ficha vehículo completa, DONE mantenimiento, etc.)
- Llantas, baterías, marketplace
- Reportes avanzados

---

## 3. Arquitectura técnica objetivo

```text
Frontend Angular
   ↓
API Backend (/api/v1)
   ↓
Servicios de dominio
   ↓
Base de datos
   ↓
Storage de archivos
   ↓
Cola de eventos / notificaciones
```

### Capas

```text
UI → Application → Domain → Infrastructure
```

### Convención API

```text
/api/v1/businesses/{businessId}/...
Authorization: Bearer <token>
X-Business-Id: <uuid>
```

### Ambientes

| Ambiente | Frontend                           | Backend    |
| -------- | ---------------------------------- | ---------- |
| DEV      | `useMocks: true` (hoy) o API local | local      |
| QA       | `useMocks: false`                  | staging    |
| PROD     | `useMocks: false`                  | producción |

### Patrón de datos en Angular (ya definido)

1. Interfaces TypeScript = contrato de dominio
2. `XxxRepository` abstracto
3. `XxxMockRepository` ahora
4. `XxxHttpRepository` después (sin reescribir UI)

---

## 4. Modelo de datos núcleo (entidades a construir en backend)

```text
businesses
users
roles
permissions
user_business_roles
customers
vehicles
vehicle_mileage_logs
fleets
fleet_vehicles
service_types
service_orders
service_order_items
service_order_item_products
products
inventory_movements
attachments
maintenance_schedules
maintenance_records
notifications
notification_settings
vehicle_documents
audit_logs
providers            (expansión)
```

### Anti-patrón prohibido

No agregar a `vehicles` columnas como:

```text
soat_number, soat_expiration, tire_brand, battery_brand, oil_type...
```

Usar entidades independientes.

---

## 5. Roles y permisos iniciales

| Rol           | Alcance                                   |
| ------------- | ----------------------------------------- |
| ADMIN         | Acceso completo al negocio                |
| OPERATOR      | Clientes, vehículos, órdenes, historial   |
| TECHNICIAN    | Órdenes asignadas, trabajos, evidencias   |
| INVENTORY     | Productos y movimientos                   |
| FLEET_MANAGER | Flotas, mantenimientos, alertas, reportes |
| CUSTOMER      | Solo sus vehículos/historial (portal)     |

---

## 6. Priorización por MVP

### MVP 1 — Operación demostrable

```text
Negocio → Usuarios → Clientes → Vehículos → Flotas
→ Órdenes → Cambio de aceite → Evidencias
→ Inventario → Historial → Próximo mantenimiento
```

### MVP 2

```text
Notificaciones → Portal particular → Portal empresa → Dashboard → Reportes básicos
```

### MVP 3

```text
Documentos → SOAT → Técnico-mecánica → Seguros
```

### Expansión

```text
Llantas → Baterías → Planes de mantenimiento
→ Reportes avanzados → Proveedores → Marketplace
```

---

# ROADMAP DE EJECUCIÓN DETALLADO

---

## FASE 0 — Arquitectura base

### Objetivo

Preparar terreno FE/BE sin rehacer después.

### Frontend — estado

- [x] Estructura modular `core/shared/data-access/features`
- [x] Environments + switch mocks
- [x] Layout admin (shell KONTI, breadcrumbs, title strategy)
- [x] Mapa de código / convenciones (`docs/codebase/`)
- [ ] Interceptor HTTP real (Bearer + X-Business-Id)
- [ ] Manejo global de errores API
- [ ] Feature flags por ambiente
- [ ] `XxxHttpRepository` cableado cuando `useMocks: false`

### Backend — construir

- [ ] Proyecto API (NestJS u equivalente)
- [ ] Migraciones versionadas
- [ ] Multitenancy middleware
- [ ] Auth JWT + refresh
- [ ] RBAC
- [ ] Storage (S3/GCS/Firebase) + URLs firmadas
- [ ] `audit_logs`
- [ ] Healthchecks DEV/QA/PROD
- [ ] Logging estructurado

### Criterios de aceptación

- Un request sin `businessId` válido → 403
- Un usuario de negocio A no lee datos de B
- Storage acepta JPG/PNG/PDF con límite de tamaño

### Contrato

`docs/api-contracts/00-architecture.md`

---

## FASE 1 — Identidad y acceso

### Objetivo

Cada usuario entra al contexto correcto de su negocio.

### Frontend — estado / faltante

- [x] Login mock rediseñado KONTI (componentes + specs + `LOGIN_SPEC`)
- [x] Guards (`auth`, `guest`, `permission`) + unsaved-changes en formularios
- [x] Listado usuarios (lectura + filtros; sin CRUD)
- [x] CRUD usuarios/roles en mock + selector de negocio si hay varias membresías
- [ ] Forgot password UI (hoy mensaje “pendiente”)
- [ ] CRUD usuarios/roles real contra API

### Backend — construir

Endpoints:

- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/forgot-password`
- `CRUD /businesses`
- `CRUD /businesses/{id}/users`
- asignación roles

### Reglas

- Password hasheado
- Refresh rotativo
- Usuario `INACTIVE` no autentica
- CUSTOMER no entra al panel operación

### Criterios

- Login inválido → 401
- Token expirado → refresh o 401
- Aislamiento total por negocio

### Contrato

`docs/api-contracts/01-auth.md`

---

## FASE 2 — Clientes

### Objetivo

Identificar propietario/responsable del vehículo (persona o empresa).

### Frontend — estado / faltante

- [x] CRUD PERSON/COMPANY + búsqueda (listado, alta, edición)
- [x] Pantalla detalle + vehículos asociados
- [x] Validaciones de formulario + inactivar/activar con confirmación
- [x] Specs + auditoría visual (`CUSTOMERS_SPEC`, `CUSTOMERS_CRUD_AUDIT`)
- [ ] Bloqueo/warning de cliente inactivo al crear órdenes
- [ ] Historial de órdenes del cliente en detalle

### Backend — construir

- `GET/POST/PATCH /businesses/{id}/customers`
- Unique por negocio: PERSON(`documentType+documentNumber`), COMPANY(`nit`)
- Soft status ACTIVE/INACTIVE

### Campos mínimos

**PERSON:** tipo/número doc, nombres, apellidos, teléfono, correo, dirección, estado  
**COMPANY:** NIT, razón social, nombre comercial, contacto, teléfono, correo, dirección, estado

### Criterios

- No duplicar documento/NIT en el mismo negocio
- Cliente inactivo no se usa en nuevas órdenes (warning o bloqueo)

### Contrato

`docs/api-contracts/02-customers.md`

---

## FASE 3 — Vehículos

### Objetivo

Cada vehículo tiene identidad propia (hoja de vida base).

### Frontend — estado / faltante

- [x] CRUD + búsqueda + km + inactivar/activar
- [x] Relación con cliente + enlace a hoja de vida
- [x] Specs + auditoría visual hoja de vida (`VEHICLES_SPEC`)
- [ ] Edición completa de ficha técnica (VIN, tipo, capacidad motor en form)
- [ ] Historial de propietarios (si se requiere)

### Backend — construir

- UUID interno (placa **no** es PK)
- Placa indexada para búsqueda (unique por negocio recomendado)
- `vehicle_mileage_logs` en cada cambio de km
- Relación `customer_id`, `fleet_id` opcional

### Campos mínimos

placa, VIN, marca, línea, modelo, año, tipo, color, combustible, capacidad motor, kilometraje actual, estado, fecha registro

### Reglas

- Km no puede bajar salvo ajuste ADMIN auditado
- Toda actualización de km genera log

### Criterios

- Buscar por placa funciona
- Dos negocios pueden tener la misma placa sin colisión global

### Contrato

`docs/api-contracts/03-vehicles.md`

---

## FASE 4 — Flotas

### Objetivo

Empresa puede agrupar vehículos y consultar individual/grupal.

### Frontend — estado / faltante

- [x] Crear/editar flota, listado con filtros
- [x] Asignar + desasignar UI + resumen `getSummary`
- [x] Specs + auditoría visual (`FLEETS_SPEC`)
- [ ] Dashboard consolidado rico (costos, docs, etc. en fases posteriores)

### Backend — construir

- `fleets`, `fleet_vehicles` (histórico con `assigned_at` / `unassigned_at`)
- Al asignar: cerrar asignación previa activa
- `GET .../fleets/{id}/summary` → al día / próximos / vencidos

### Criterios

- Un vehículo activo en una sola flota a la vez
- Summary coherente con mantenimientos

### Contrato

`docs/api-contracts/04-fleets.md`

---

## FASE 5 — Catálogo de servicios

### Objetivo

La app no depende de una sola clase de mantenimiento.

### Frontend — estado / faltante

- [x] Listar/crear tipos + filtro por estado
- [x] Spec (`SERVICE_CATALOG_SPEC`)
- [ ] Editar parámetros (everyKm, everyMonths) en UI
- [ ] Activar/desactivar post-alta en UI

### Backend — construir

- `service_types` por negocio
- `code` unique uppercase
- `parameters` JSON

Códigos iniciales:

```text
CAMBIO_ACEITE, CAMBIO_FILTRO, REVISION_FRENOS, CAMBIO_LLANTAS,
CAMBIO_BATERIA, ALINEACION, BALANCEO, REVISION_GENERAL, OTRO
```

Futuros: `SOAT`, `TECNOMECANICA`, `SEGURO`, `IMPUESTO`

### Criterios

- Crear nuevo tipo sin migración de esquema
- Desactivar no borra historial

### Contrato

`docs/api-contracts/05-service-catalog.md`

---

## FASE 6 — Órdenes de servicio

### Objetivo

Proceso operativo formal de atención.

### Frontend — estado / faltante

- [x] Listado, detalle, creación vía wizard
- [x] Cambio de estado manual UI (transiciones validadas en mock)
- [x] Actividad / auditoría en detalle de orden
- [~] Edición de orden abierta (solo observaciones; no ítems/cliente/vehículo)
- [ ] Asignación de técnico desde catálogo de usuarios

### Backend — construir

Estados y transiciones:

```text
DRAFT → OPEN | CANCELLED
OPEN → IN_PROGRESS | CANCELLED
IN_PROGRESS → COMPLETED | CANCELLED
COMPLETED / CANCELLED → terminal
```

Tablas: `service_orders`, `service_order_items`, productos por ítem

### Campos mínimos de orden

número, negocio, cliente, vehículo, apertura/cierre, km, técnico, operador, estado, observaciones, totales (futuro)

### Criterios

- Transición inválida → 409/422
- No editar COMPLETED/CANCELLED

### Contrato

`docs/api-contracts/06-service-orders.md`

---

## FASE 7 — Cambio de aceite (primer caso de uso real)

### Objetivo

MVP operacional demostrable.

### Flujo a cumplir end-to-end

```text
Registrar/buscar cliente
 → Registrar/buscar vehículo
 → Crear orden
 → Seleccionar CAMBIO_ACEITE
 → Registrar kilometraje
 → Seleccionar productos y cantidades
 → Observaciones
 → Subir evidencias
 → Finalizar
 → Descontar inventario
 → Registrar historial
 → Crear próximo mantenimiento
 → (luego) Programar alerta / notificar
```

### Frontend — estado / faltante

- [x] Wizard completo con mocks (E2E demo)
- [~] Upload de archivos (selector + preview → dataUrl mock; sin storage firmado)
- [ ] Impresión/PDF de orden (opcional)

### Backend — `POST .../service-orders/{id}/complete` (transacción atómica)

1. Validar estado
2. Validar km ≥ actual
3. Actualizar vehículo + mileage log
4. EXIT de inventario por productos
5. Upsert `maintenance_schedules`
6. Cerrar orden
7. `audit_logs`
8. Encolar eventos de notificación (Fase 12)

### Criterios

- Stock insuficiente → rollback total
- Tras completar, hoja de vida muestra el evento
- Próximo mantenimiento visible (km y/o fecha)

---

## FASE 8 — Evidencias

### Objetivo

Cada servicio/documento puede auditarse visualmente.

### Frontend — estado / faltante

- [x] Evidencia mock al completar orden
- [x] Galería en detalle/hoja de vida
- [x] Selector de archivo + preview (persistencia mock)
- [ ] Eliminar/reordenar evidencias en UI
- [ ] Upload a storage real (URLs firmadas)

### Backend — construir

- `attachments` con `entity_type` + `entity_id`
- Tipos: SERVICE_ORDER, VEHICLE, VEHICLE_DOCUMENT, MAINTENANCE, INSPECTION
- Upload URL firmada o multipart
- Mime: jpg/png/pdf

### Criterios

- Evidencia asociada a la entidad correcta
- CUSTOMER solo ve evidencias autorizadas

### Contrato

`docs/api-contracts/08-attachments.md`

---

## FASE 9 — Inventario

### Objetivo

Consumo real de productos trazado y reutilizable por cualquier servicio.

### Frontend — estado / faltante

- [x] Productos, entradas (`ENTRY`), movimientos, alerta min stock
- [x] Spec (`INVENTORY_SPEC`)
- [ ] Ajustes/transferencias UI
- [ ] Devoluciones

### Backend — construir

Movimientos: `ENTRY | EXIT | ADJUSTMENT | RETURN | TRANSFER`

Reglas:

- Stock nunca negativo
- Cierre de orden genera EXIT relacionados
- ADJUSTMENT solo INVENTORY/ADMIN

### Criterios

- Completar orden descuenta exactamente una vez
- Stock bajo detectable para notificaciones

### Contrato

`docs/api-contracts/09-inventory.md`

---

## FASE 10 — Hoja de vida del vehículo

### Objetivo

Timeline unificado del ciclo de vida.

### Secciones requeridas

- Información general
- Propietario / flota
- Historial de servicios
- Mantenimientos
- Documentos
- Evidencias
- Inventario utilizado
- Alertas
- Próximas actividades

### Frontend — estado / faltante

- [x] Timeline rediseñado (servicios, mantenimiento, km, evidencias) + KPIs
- [x] Filtro por tipo de evento
- [x] Specs + auditoría visual before/after
- [ ] Documentos/alertas cuando existan módulos
- [ ] Filtro por año

### Backend

- `GET /vehicles/{id}/life-history` agregado ordenado desc

### Criterios

- Tras una orden completada, el evento aparece sin recargar datos “a mano”
- Incluye mileage logs con fuente

### Contrato

`docs/api-contracts/03-vehicles.md`

---

## FASE 11 — Mantenimiento programado

### Objetivo

Anticipar próximos servicios por reglas.

### Reglas

- Cada X km
- Cada Y meses
- Combinada: lo que ocurra primero
- Custom

### Frontend — estado / faltante

- [x] Listado + evaluación básica (`evaluate`)
- [x] Spec (`MAINTENANCE_SPEC`)
- [ ] Editor de reglas por vehículo
- [ ] Marcar DONE manualmente

### Backend — construir

- `maintenance_schedules`
- Endpoint `evaluate` + **job/cron** periódico
- Estados: SCHEDULED | UPCOMING | OVERDUE | DONE | CANCELLED
- Umbrales UPCOMING configurables (ej. 1000 km / 15 días)

### Criterios

- Evaluate marca OVERDUE correctamente
- Completar CAMBIO_ACEITE crea/actualiza schedule

### Contrato

`docs/api-contracts/11-maintenance.md`

---

## FASE 12 — Notificaciones (MVP 2)

### Objetivo

Motor central de alertas (no lógica distinta por módulo).

### Canales

```text
IN_APP → EMAIL → WHATSAPP → SMS → PUSH
```

### Eventos iniciales

- Próximo mantenimiento / vencido
- SOAT / RTM / seguro por vencer
- Stock bajo
- Servicio completado
- Orden lista

### Frontend — construir

- [ ] Bandeja in-app
- [ ] Marcar leído
- [ ] Configuración de canales por negocio/usuario

### Backend — construir

```text
Evento de dominio → cola → worker por canal → notifications + intentos
```

Idempotencia por `eventType + relatedEntityId + channel + window`

### Criterios

- Completar orden puede generar notificación pendiente
- Evaluate de mantenimiento genera UPCOMING/OVERDUE

### Contrato

`docs/api-contracts/12-notifications.md`

---

## FASE 13 — Portal cliente particular (MVP 2)

### Objetivo

Cliente final consulta su trazabilidad sin panel operación.

### Navegación

```text
Inicio · Mis vehículos · Historial · Mantenimientos · Documentos · Notificaciones · Perfil
```

### Frontend — construir

- [ ] App/ruta separada `/portal/...`
- [ ] Login customer
- [ ] Consulta placa+documento solo como bootstrap (no seguridad final)

### Backend — construir

- Scopes: solo vehículos del `customerId` vinculado
- Endpoints portal read-only

### Criterios

- Un customer no ve vehículos de otro
- Evidencias filtradas por permiso

### Contrato

`docs/api-contracts/13-portal-customer.md`

---

## FASE 14 — Portal empresarial (MVP 2)

### Objetivo

Gestión de flotas para empresa cliente / fleet manager.

### Dashboard

```text
Total vehículos · Al día · Próximos · Vencidos · Docs por vencer
```

### Navegación

```text
Dashboard · Flotas · Vehículos · Mantenimientos · Documentos
· Servicios · Costos · Reportes · Usuarios · Configuración
```

### Frontend / Backend

- [ ] Rutas `/portal/fleet/...`
- [ ] Aggregations por flota
- [ ] Scope por customer empresa

### Contrato

`docs/api-contracts/14-portal-fleet.md`

---

## FASE 15 — Documentación genérica (MVP 3)

### Objetivo

Base para SOAT/RTM/seguros/impuestos sin ensuciar `vehicles`.

### Entidad

`vehicle_documents`:

- type, number, issuer, issuedAt, expiresAt, status, notes, attachmentIds

Status: VALID | EXPIRING | EXPIRED | UNKNOWN

### Frontend / Backend

- [ ] CRUD documentos por vehículo
- [ ] Job de vencimientos → notificaciones
- [ ] Historial de renovaciones (nuevo registro, no overwrite ciego)

### Contrato

`docs/api-contracts/15-documents.md`

---

## FASE 16 — SOAT

### Construir sobre Fase 15

- Registro número/póliza
- Vigencia
- Evidencia PDF
- Alertas de vencimiento
- Historial de renovaciones

### Criterios

- Vehículo con SOAT vencido aparece en alertas de flota/portal

---

## FASE 17 — Técnico-mecánica

### Construir

- Registro
- Vigencia
- Resultado (aprobado/rechazado/condicional)
- Evidencia
- Alertas

---

## FASE 18 — Seguros

### Construir

- Pólizas
- Aseguradora
- Vigencias
- Coberturas
- Documentos
- Alertas

---

## FASE 19 — Llantas (expansión)

### Construir

- Inventario de llantas por vehículo
- Posición
- Instalación / retiro
- Kilometraje al montar/desmontar
- Historial

Reutilizar: órdenes, evidencias, inventario, hoja de vida.

---

## FASE 20 — Baterías (expansión)

### Construir

- Registro / serial
- Instalación
- Garantía
- Historial

---

## FASE 21 — Planes de mantenimiento (expansión)

### Construir

- Plantillas
- Planes por tipo de vehículo
- Servicios asociados
- Reglas km/tiempo masivas

---

## FASE 22 — Reportes avanzados

### Construir

- Costos por vehículo/flota/periodo
- Consumo de inventario
- Servicios por tipo
- Mantenimiento por estado
- Documentos por vencer
- KPIs dashboard

Preferir consultas/vistas read-only, no mezclar reporting pesado en el path de escritura.

### Contrato

`docs/api-contracts/22-reports.md`

---

## FASE 23 — Proveedores

### Construir

- Proveedores
- Categorías
- Contactos
- Servicios/productos ofrecidos

---

## FASE 24 — Marketplace / ecosistema

### Solo cuando el núcleo esté estable

- Catálogo de servicios aliados
- Cotizaciones
- Solicitudes de servicio
- Integraciones externas
- Comisiones posibles

### Contrato stub

`docs/api-contracts/24-expansion.md`

---

## 7. Reglas de negocio globales (checklist permanente)

1. La placa no es la única identidad del vehículo.
2. El kilometraje tiene historial.
3. Los documentos tienen vigencia (archivo + fechas + estado).
4. Los servicios generan historial (no solo update del vehículo).
5. Inventario y servicios están relacionados.
6. Las notificaciones derivan de eventos/reglas.
7. Todo módulo crece sin romper el núcleo.

---

## 8. Auditoría obligatoria

Registrar al menos:

- Quién creó/modificó vehículo y kilometraje
- Quién creó/cerró orden
- Quién registró servicio
- Quién modificó inventario
- Quién subió evidencia
- Quién cambió vencimientos documentales

---

## 9. Orden de trabajo recomendado para el equipo

### Sprint focus sugerido

| Bloque | Fases | Meta                                              |
| ------ | ----- | ------------------------------------------------- |
| A      | 0–1   | API auth + tenancy real                           |
| B      | 2–5   | Maestros persistentes                             |
| C      | 6–9   | Órdenes + aceite + inventario + evidencias reales |
| D      | 10–11 | Hoja de vida + mantenimiento + cron               |
| E      | 12–14 | Notificaciones + portales                         |
| F      | 15–18 | Documentos legales                                |
| G      | 19–24 | Expansión                                         |

### Definition of Done por fase

- [ ] FE conectado a HTTP repository (sin mock)
- [ ] Endpoints documentados y cumplidos
- [ ] Reglas de negocio testeadas
- [ ] Auditoría escrita
- [ ] Criterios de aceptación verificados en QA
- [ ] Datos aislados por `businessId`

---

## 10. Próximo paso técnico inmediato (prioridad)

### Situación (2026-10-27)

- **MVP 1 FE+mocks ~70%:** demo operable (login → clientes/vehículos/flotas → wizard aceite → hoja de vida).
- **Backend ~0%:** el cuello de botella ya no es “pantallas vacías”, sino **persistencia real**.
- Huecos FE MVP1 restantes: catálogo (edit/estado), ficha vehículo completa, técnico en órdenes, DONE mantenimiento, interceptor HTTP.

### Prioridad recomendada

**A — Cerrar MVP 1 FE (opcional, paralelo):** catálogo edit/activar, ficha vehículo, selector técnico, marcar DONE.  
**Plan de tecnología, patrones y arquitectura del API:** [`docs/PLAN.md`](./PLAN.md).

**B — Arrancar backend (crítico):**

1. Modelo entidad-relación definitivo (contratos ya en `docs/api-contracts/`)
2. Proyecto API + migraciones + multitenancy
3. Fases 0–1: auth JWT + RBAC + `audit_logs`
4. `XxxHttpRepository` + interceptor Bearer / `X-Business-Id`
5. Persistencia clientes → vehículos → órdenes → completar aceite
6. Congelar MVP 1 y abrir MVP 2 (notificaciones + portales)

---

## 11. Meta final

```text
Un vehículo
  → hoja de vida digital completa
  → servicios, productos, mantenimientos, documentos, evidencias, alertas
  → consultable por particulares, empresas y administradores de flota
```

Empezar pequeño (cambio de aceite) y crecer hasta plataforma integral **sin reescribir el núcleo**.

---

## 12. Índice de contratos backend

Stack y arquitectura del API: `docs/PLAN.md`.

| Fase  | Documento                                  |
| ----- | ------------------------------------------ |
| 0     | `docs/api-contracts/00-architecture.md`    |
| 0     | `docs/api-contracts/00-multitenancy.md`    |
| 1     | `docs/api-contracts/01-auth.md`            |
| 2     | `docs/api-contracts/02-customers.md`       |
| 3     | `docs/api-contracts/03-vehicles.md`        |
| 4     | `docs/api-contracts/04-fleets.md`          |
| 5     | `docs/api-contracts/05-service-catalog.md` |
| 6–7   | `docs/api-contracts/06-service-orders.md`  |
| 8     | `docs/api-contracts/08-attachments.md`     |
| 9     | `docs/api-contracts/09-inventory.md`       |
| 11    | `docs/api-contracts/11-maintenance.md`     |
| 12    | `docs/api-contracts/12-notifications.md`   |
| 13    | `docs/api-contracts/13-portal-customer.md` |
| 14    | `docs/api-contracts/14-portal-fleet.md`    |
| 15–18 | `docs/api-contracts/15-documents.md`       |
| 22    | `docs/api-contracts/22-reports.md`         |
| 19–24 | `docs/api-contracts/24-expansion.md`       |

Índice general: `docs/api-contracts/README.md`
