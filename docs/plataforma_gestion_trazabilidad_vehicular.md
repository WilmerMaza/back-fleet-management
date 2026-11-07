# Plataforma de Gestión y Trazabilidad Vehicular

## Documento maestro de producto y roadmap

---

## 1. Visión del proyecto

La plataforma no debe construirse como un sistema exclusivo para cambios de aceite. El objetivo es crear una **Plataforma de Gestión y Trazabilidad Vehicular** capaz de administrar la vida operativa de un vehículo y, posteriormente, la operación completa de flotas.

El cambio de aceite será el primer caso de uso y el primer módulo operativo, pero la arquitectura debe permitir incorporar progresivamente:

- Mantenimientos preventivos y correctivos.
- Cambios de aceite y filtros.
- Llantas.
- Baterías.
- Frenos.
- Alineación y balanceo.
- SOAT.
- Revisión técnico-mecánica.
- Seguros.
- Impuestos y documentación.
- Inventario.
- Notificaciones.
- Reportes.
- Gestión de flotas.
- Portal para clientes particulares.
- Portal empresarial.
- Proveedores y aliados.
- Eventualmente un marketplace de servicios vehiculares.

### Objetivo principal

Centralizar toda la información relacionada con un vehículo en una **hoja de vida digital**, manteniendo trazabilidad de cada servicio, producto utilizado, documento, evidencia, mantenimiento y alerta.

---

# 2. Concepto general

La estructura conceptual de la plataforma será:

```text
Cliente → Vehículo/Flota → Orden/Servicio → Evidencias → Historial → Alertas
```

Para un cliente particular:

```text
Persona
   │
   ├── Vehículo 1
   ├── Vehículo 2
   └── Vehículo 3
```

Para una empresa:

```text
Empresa
   │
   └── Flota
        ├── Vehículo 1
        ├── Vehículo 2
        ├── Vehículo 3
        └── Vehículo N
```

Cada vehículo debe poder tener su propia trazabilidad, mientras que una empresa debe poder consultar la información individual y consolidada de toda su flota.

---

# 3. Principios de arquitectura

Desde el comienzo deben mantenerse las siguientes reglas.

## 3.1. Modularidad

Cada funcionalidad debe ser un módulo independiente y desacoplado.

Ejemplo:

```text
Plataforma
├── Clientes
├── Vehículos
├── Flotas
├── Servicios
├── Órdenes
├── Inventario
├── Evidencias
├── Mantenimiento
├── Notificaciones
├── Documentos
├── Reportes
└── Administración
```

## 3.2. El cambio de aceite no debe ser el núcleo de datos

No construir una arquitectura alrededor de una entidad rígida como:

```text
oil_changes
```

El núcleo debe ser un sistema genérico de servicios y órdenes:

```text
service_types
services
service_orders
service_order_items
```

De esta forma, `CAMBIO_ACEITE` es simplemente un tipo de servicio.

## 3.3. Multiempresa desde el inicio

La plataforma debe poder soportar múltiples negocios o clientes empresariales sin mezclar información.

```text
Plataforma
│
├── Negocio A
│   ├── Usuarios
│   ├── Clientes
│   ├── Vehículos
│   ├── Flotas
│   ├── Inventario
│   └── Servicios
│
├── Negocio B
│   ├── Usuarios
│   ├── Clientes
│   ├── Vehículos
│   ├── Flotas
│   ├── Inventario
│   └── Servicios
│
└── Negocio C
```

Cada entidad operativa importante debe quedar asociada al negocio correspondiente.

Ejemplo conceptual:

```text
vehicle.business_id
customer.business_id
fleet.business_id
service_order.business_id
product.business_id
```

## 3.4. Evidencias como módulo transversal

Las evidencias no deben existir únicamente para cambios de aceite.

Deben poder asociarse a:

- Vehículos.
- Órdenes de servicio.
- Mantenimientos.
- Documentos.
- SOAT.
- Técnico-mecánica.
- Seguros.
- Inspecciones.

## 3.5. Mantenimiento basado en reglas

El sistema debe poder generar mantenimientos por:

- Kilometraje.
- Tiempo.
- Una combinación de ambos.
- Lo que ocurra primero.
- Una regla personalizada.

Ejemplo:

```text
Cada 10.000 km
O cada 6 meses
Lo que ocurra primero
```

---

# 4. Arquitectura funcional general

```text
                         PLATAFORMA VEHICULAR
                                  │
              ┌───────────────────┴───────────────────┐
              │                                       │
          OPERACIÓN                             PORTAL CLIENTE
              │                                       │
       ┌──────┼────────┐                      ┌───────┴────────┐
       │      │        │                      │                │
   Clientes Vehículos Flotas              Particular       Empresa
       │      │        │
       └──────┼────────┘
              │
       Órdenes de servicio
              │
       ┌──────┼───────────────┐
       │      │               │
   Servicios Inventario    Evidencias
       │
       ├── Cambio de aceite
       ├── Filtros
       ├── Frenos
       ├── Llantas
       ├── Batería
       ├── Alineación
       ├── Balanceo
       └── Otros

              │
              └── Documentación
                  ├── SOAT
                  ├── Técnico-mecánica
                  ├── Seguro
                  ├── Impuestos
                  └── Otros

              │
              ↓
        Mantenimiento programado
              ↓
        Notificaciones y alertas
              ↓
        Historial / trazabilidad
              ↓
             Reportes
```

---

# 5. Módulos principales

## 5.1. Administración y configuración

Responsable de la configuración general del negocio.

Incluye:

- Negocio.
- Datos de la empresa.
- Logo y branding.
- Sedes.
- Usuarios.
- Roles.
- Permisos.
- Configuración de notificaciones.
- Catálogos.
- Tipos de servicio.
- Parámetros operativos.

---

# 6. Módulo de usuarios y acceso

## Roles iniciales

```text
ADMIN
OPERATOR
TECHNICIAN
INVENTORY
FLEET_MANAGER
CUSTOMER
```

### Administrador

Acceso completo al negocio.

### Operador

Puede:

- Registrar clientes.
- Registrar vehículos.
- Crear órdenes.
- Consultar historial.
- Registrar servicios.

### Técnico

Puede:

- Consultar órdenes asignadas.
- Registrar trabajos.
- Registrar observaciones.
- Cargar evidencias.

### Inventario

Puede:

- Administrar productos.
- Registrar entradas.
- Registrar salidas.
- Ajustar inventario.
- Consultar existencias.

### Gestor de flota

Puede:

- Consultar flotas.
- Consultar vehículos.
- Revisar mantenimientos.
- Consultar alertas.
- Generar reportes.

### Cliente particular

Solo consulta sus vehículos y su historial.

### Cliente empresa

Consulta los vehículos y flotas asociadas a su empresa.

---

# 7. Módulo de clientes

Debe soportar dos grandes tipos.

## 7.1. Persona natural

Datos sugeridos:

- Tipo de identificación.
- Número de identificación.
- Nombres.
- Apellidos.
- Teléfono.
- Correo.
- Dirección.
- Estado.

## 7.2. Empresa

Datos sugeridos:

- NIT.
- Razón social.
- Nombre comercial.
- Contacto principal.
- Teléfono.
- Correo.
- Dirección.
- Estado.

Conceptualmente:

```text
customers
├── PERSON
└── COMPANY
```

---

# 8. Módulo de vehículos

Cada vehículo tendrá una hoja de vida digital.

## Datos básicos

- Placa.
- VIN/chasis.
- Marca.
- Línea.
- Modelo.
- Año.
- Tipo de vehículo.
- Color.
- Tipo de combustible.
- Capacidad del motor.
- Kilometraje actual.
- Estado.
- Fecha de registro.

## Relación con propietario

```text
Cliente
   ↓
Vehículo
```

## Relación con empresa y flota

```text
Empresa
   ↓
Flota
   ↓
Vehículo
```

Debe ser posible que un vehículo pertenezca a una flota y que además tenga información histórica sobre propietarios, responsables u operadores cuando el negocio lo requiera.

---

# 9. Módulo de flotas

Una empresa puede tener una o varias flotas.

Ejemplo:

```text
Empresa ABC
│
├── Flota Cartagena
│   ├── ABC123
│   ├── ABC124
│   └── ABC125
│
├── Flota Barranquilla
│   ├── XYZ123
│   └── XYZ124
│
└── Vehículos administrativos
    ├── AAA111
    └── BBB222
```

## Consultas individuales

Permitir consultar:

```text
ABC123
```

## Consultas grupales

Permitir consultar:

```text
Flota Cartagena
```

Y mostrar:

- Vehículos al día.
- Vehículos próximos a mantenimiento.
- Vehículos vencidos.
- Último servicio.
- Próximo servicio.
- Kilometraje.
- Costos.
- Historial.
- Documentos próximos a vencer.

---

# 10. Módulo de catálogo de servicios

La plataforma debe tener un catálogo general.

Ejemplos iniciales:

```text
CAMBIO_ACEITE
CAMBIO_FILTRO
REVISION_FRENOS
CAMBIO_LLANTAS
CAMBIO_BATERIA
ALINEACION
BALANCEO
REVISION_GENERAL
OTRO
```

En el futuro:

```text
SOAT
TECNOMECANICA
SEGURO
IMPUESTO
```

La idea es que un servicio pueda ser configurado sin modificar la arquitectura central.

---

# 11. Módulo de órdenes de servicio

La orden es el principal registro operativo de atención.

## Datos conceptuales

```text
service_orders
```

Campos principales:

- Número de orden.
- Negocio.
- Cliente.
- Vehículo.
- Fecha y hora de apertura.
- Fecha y hora de cierre.
- Kilometraje.
- Técnico responsable.
- Operador responsable.
- Estado.
- Observaciones.
- Totales, si posteriormente se incorpora facturación.

## Estados sugeridos

```text
DRAFT
OPEN
IN_PROGRESS
COMPLETED
CANCELLED
```

---

# 12. Módulo de servicios realizados

Una orden puede contener uno o varios servicios.

Ejemplo:

```text
Orden #000125
│
├── Cambio de aceite
├── Cambio de filtro de aceite
├── Revisión de niveles
└── Inspección visual
```

Esto permite combinar múltiples trabajos dentro de una misma visita.

---

# 13. Primer caso de uso: cambio de aceite

Este será el MVP operacional inicial.

## Flujo

```text
Registrar vehículo
        ↓
Crear orden
        ↓
Seleccionar cambio de aceite
        ↓
Registrar kilometraje
        ↓
Seleccionar productos
        ↓
Registrar cantidades
        ↓
Agregar observaciones
        ↓
Subir evidencias
        ↓
Finalizar servicio
        ↓
Programar próximo mantenimiento
```

## Ejemplo

```text
ORDEN #000125

Vehículo: ABC123
Cliente: Juan Pérez
Fecha: 02/10/2026
Kilometraje: 85.430 km

SERVICIOS
- Cambio de aceite

PRODUCTOS
- Aceite 5W30: 4 litros
- Filtro de aceite: 1 unidad

TÉCNICO
Carlos Pérez

OBSERVACIONES
Servicio realizado correctamente.

PRÓXIMO MANTENIMIENTO
95.000 km
O
02/01/2027
Lo que ocurra primero.
```

---

# 14. Módulo de inventario

El inventario debe ser independiente y reutilizable por cualquier servicio.

## Productos

Ejemplos:

```text
Aceite 5W30
Filtro de aceite Toyota
Filtro de aire Toyota
Líquido de frenos
Batería 12V
```

## Información sugerida

- SKU.
- Nombre.
- Categoría.
- Marca.
- Referencia.
- Unidad de medida.
- Stock actual.
- Stock mínimo.
- Costo.
- Precio.
- Estado.

## Movimientos

```text
inventory_movements
```

Tipos:

```text
ENTRY
EXIT
ADJUSTMENT
RETURN
TRANSFER
```

## Integración con órdenes

Cuando finaliza una orden:

```text
Orden #125
      ↓
4 litros aceite
1 filtro
      ↓
Movimientos de inventario
      ↓
Stock actualizado
```

---

# 15. Módulo de evidencias

Debe existir como módulo transversal.

## Tipos de archivos

- JPG.
- PNG.
- PDF.
- Otros documentos autorizados.

## Evidencias de un servicio

Ejemplo:

```text
Orden #125
│
├── kilometraje.jpg
├── aceite.jpg
├── filtro.jpg
├── vehículo.jpg
└── factura.pdf
```

## Aplicación futura

El mismo módulo sirve para:

```text
Vehículo
├── SOAT.pdf
├── Tecnomecanica.pdf
└── Seguro.pdf

Orden
├── Foto 1
├── Foto 2
└── Documento
```

---

# 16. Hoja de vida del vehículo

La hoja de vida será uno de los elementos centrales de la plataforma.

## Información general

```text
TOYOTA COROLLA
ABC123

Kilometraje actual: 85.430 km
```

## Secciones

- Información del vehículo.
- Propietario.
- Flota.
- Historial de servicios.
- Mantenimientos.
- Documentos.
- Evidencias.
- Inventario utilizado.
- Alertas.
- Próximas actividades.

## Línea de tiempo

```text
2026
│
├── Enero
│   └── Cambio de aceite - 61.500 km
│
├── Abril
│   └── Cambio de aceite - 70.050 km
│
├── Julio
│   └── Cambio de aceite - 78.210 km
│
└── Octubre
    └── Cambio de aceite - 85.430 km
```

---

# 17. Módulo de mantenimiento programado

Crear una entidad genérica de reglas de mantenimiento.

```text
maintenance_schedules
```

## Reglas

### Por kilometraje

```text
Cada 10.000 km
```

### Por tiempo

```text
Cada 6 meses
```

### Combinada

```text
Cada 10.000 km
O cada 6 meses
Lo que ocurra primero
```

## Ejemplo

```text
Vehículo ABC123

Último servicio:
85.430 km

Regla:
10.000 km

Próximo:
95.430 km
```

También puede manejar un objetivo redondeado, por ejemplo 95.000 km, según la regla configurada por el negocio.

---

# 18. Módulo de notificaciones

Debe existir un motor central de notificaciones.

## Canales futuros

```text
EMAIL
WHATSAPP
SMS
PUSH
IN_APP
```

## Eventos

Ejemplos:

- Próximo mantenimiento.
- Mantenimiento vencido.
- SOAT próximo a vencer.
- Técnico-mecánica próxima a vencer.
- Seguro próximo a vencer.
- Stock bajo.
- Servicio completado.
- Orden lista.

## Ejemplo particular

```text
Tu vehículo ABC123 tiene próximo mantenimiento.

95.000 km
O
02/01/2027
```

## Ejemplo empresa

```text
La flota ABC tiene:

7 vehículos próximos a mantenimiento.
3 vehículos con mantenimiento vencido.
2 SOAT próximos a vencer.
```

---

# 19. Portal del cliente particular

El cliente debe tener una experiencia separada del panel administrativo.

## Consulta inicial

Puede existir una consulta por:

```text
Placa
+
Documento del propietario
```

Sin embargo, este mecanismo debe tratarse como una capa de validación y no como el único mecanismo de seguridad. Para acceso persistente es preferible autenticación de usuario.

## Portal

```text
Mis vehículos
│
├── ABC123
├── XYZ456
└── DEF789
```

Cada vehículo permite consultar:

- Información.
- Servicios.
- Historial.
- Próximos mantenimientos.
- Documentos.
- Evidencias autorizadas.
- Alertas.

---

# 20. Portal empresarial

La empresa tendrá una experiencia orientada a la gestión de flotas.

## Dashboard

```text
EMPRESA ABC

35 vehículos

25 al día
7 próximos
3 vencidos
```

## Menú conceptual

```text
Dashboard
Flotas
Vehículos
Mantenimientos
Documentos
Servicios
Costos
Reportes
Usuarios
Configuración
```

## Filtros

```text
Todas
Al día
Próximas
Vencidas

Buscar por placa...
```

## Vista consolidada

La empresa puede ver información individual y agregada.

Ejemplo:

```text
Flota Cartagena

Vehículos: 15

Servicios del mes: 32
Costo acumulado: ...
Mantenimientos próximos: 4
Mantenimientos vencidos: 2
```

---

# 21. Módulo de documentación vehicular

No crear módulos rígidos aislados para cada documento.

Crear una estructura genérica:

```text
vehicle_documents
```

Y administrar tipos:

```text
SOAT
TECNOMECANICA
SEGURO
TARJETA_PROPIEDAD
IMPUESTO
OTRO
```

## Datos sugeridos

- Tipo de documento.
- Número.
- Entidad expedidora.
- Fecha de expedición.
- Fecha de vencimiento.
- Estado.
- Archivo.
- Observaciones.

---

# 22. Módulo SOAT

El módulo SOAT debe construirse sobre el módulo genérico de documentos.

Funciones iniciales:

- Registrar SOAT.
- Guardar número.
- Entidad.
- Fecha de expedición.
- Fecha de vencimiento.
- Evidencia/documento.
- Estado.
- Historial.

Posteriormente puede integrarse con servicios externos o aliados autorizados, dependiendo del modelo comercial y de las integraciones disponibles.

---

# 23. Módulo técnico-mecánica

Debe reutilizar la misma infraestructura de documentos y alertas.

Información:

- Centro de revisión.
- Número de certificado.
- Fecha de revisión.
- Fecha de vencimiento.
- Resultado.
- Documento.
- Observaciones.

Alertas:

```text
30 días
15 días
7 días
Vencido
```

Los tiempos deben ser configurables por negocio o política del producto.

---

# 24. Módulo de seguros

La plataforma puede registrar diferentes pólizas asociadas al vehículo.

Ejemplo:

```text
Vehículo ABC123
│
└── Seguro
    ├── Póliza
    ├── Aseguradora
    ├── Vigencia
    ├── Coberturas
    └── Documento
```

---

# 25. Módulo de llantas

Permitir registrar cada conjunto o unidad de llanta.

Datos sugeridos:

- Marca.
- Referencia.
- Medida.
- Serial.
- Posición.
- Fecha de instalación.
- Kilometraje de instalación.
- Vida útil.
- Fecha de retiro.
- Motivo de retiro.

Conceptualmente:

```text
Vehículo
   ↓
Llantas
   ↓
Historial de instalación / retiro
```

---

# 26. Módulo de baterías

Datos sugeridos:

- Marca.
- Referencia.
- Serial.
- Fecha de instalación.
- Kilometraje.
- Garantía.
- Fecha de vencimiento de garantía.
- Estado.

---

# 27. Módulo de mantenimiento preventivo

Aquí se transforma la plataforma de un simple registro histórico a un sistema de gestión preventiva.

## Plan de mantenimiento

Ejemplo:

```text
PLAN A — Vehículo liviano

Cada 10.000 km

☑ Cambio de aceite
☑ Filtro de aceite
☑ Revisión de frenos
☑ Revisión de niveles
☑ Revisión de llantas
```

Otro vehículo puede tener:

```text
PLAN B — Camioneta

Cada 8.000 km

☑ Aceite
☑ Filtros
☑ Lubricación
☑ Frenos
☑ Suspensión
```

Los planes deben ser configurables y reutilizables.

---

# 28. Reportes

## Cliente particular

- Historial del vehículo.
- Servicios realizados.
- Próximos mantenimientos.
- Documentos.
- Costos acumulados, si el modelo lo habilita.

## Empresa / flota

- Historial completo.
- Costo por vehículo.
- Costo por flota.
- Servicios por periodo.
- Consumo de productos.
- Frecuencia de mantenimiento.
- Documentos vencidos.
- Mantenimientos próximos.
- Mantenimientos vencidos.
- Vehículos activos/inactivos.

---

# 29. Módulo de proveedores y aliados

En una fase posterior:

```text
providers
```

Tipos posibles:

- Proveedor de aceites.
- Proveedor de filtros.
- Proveedor de llantas.
- Proveedor de baterías.
- Aseguradora.
- Centro técnico-mecánico.
- Taller aliado.
- Otros servicios.

Esto permite conectar la plataforma con un ecosistema de proveedores.

---

# 30. Futuro marketplace de servicios

Una vez consolidado el núcleo, la plataforma puede evolucionar a un ecosistema.

Ejemplo:

```text
Mi vehículo ABC123

Próximamente:

🛢 Cambio de aceite
🛞 Llantas
🔋 Batería
📄 SOAT
🔧 Técnico-mecánica
🛡 Seguro
```

La plataforma podría posteriormente mostrar o conectar proveedores para cada necesidad.

Este componente debe considerarse una fase futura y no hacer parte del primer MVP.

---

# 31. Modelo conceptual de datos

## Entidades principales

```text
businesses
users
roles
permissions
customers
vehicles
fleets
fleet_vehicles
service_types
services
service_orders
service_order_items
products
inventory_movements
attachments
maintenance_schedules
maintenance_records
notifications
vehicle_documents
providers
```

## Relación conceptual

```text
businesses
   │
   ├── users
   ├── customers
   ├── vehicles
   ├── fleets
   ├── products
   ├── service_orders
   └── providers

customers
   │
   └── vehicles

fleets
   │
   └── fleet_vehicles
             │
             └── vehicles

vehicles
   │
   ├── service_orders
   ├── maintenance_records
   ├── maintenance_schedules
   ├── vehicle_documents
   ├── attachments
   └── historial

service_orders
   │
   ├── services
   ├── service_order_items
   └── attachments

products
   │
   └── inventory_movements

maintenance_schedules
   │
   └── notifications
```

---

# 32. Flujo completo de un cambio de aceite

```text
1. Cliente solicita servicio
        ↓
2. Buscar/registrar cliente
        ↓
3. Buscar/registrar vehículo
        ↓
4. Crear orden de servicio
        ↓
5. Registrar kilometraje
        ↓
6. Seleccionar servicio: CAMBIO_ACEITE
        ↓
7. Seleccionar productos
        ↓
8. Registrar cantidades
        ↓
9. Registrar técnico
        ↓
10. Subir evidencias
        ↓
11. Registrar observaciones
        ↓
12. Finalizar orden
        ↓
13. Descargar inventario
        ↓
14. Registrar historial
        ↓
15. Crear próximo mantenimiento
        ↓
16. Programar alerta
        ↓
17. Notificar al cliente cuando corresponda
```

---

# 33. Flujo completo de una flota

```text
Empresa
   ↓
Crear flota
   ↓
Asignar vehículos
   ↓
Registrar servicios
   ↓
Actualizar kilometrajes
   ↓
Generar mantenimientos
   ↓
Evaluar documentos
   ↓
Generar alertas
   ↓
Consolidar indicadores
   ↓
Portal empresarial
```

---

# 34. Dashboard administrativo inicial

El dashboard interno puede mostrar:

```text
Vehículos registrados
Servicios realizados hoy
Órdenes abiertas
Órdenes completadas
Mantenimientos próximos
Mantenimientos vencidos
Stock bajo
Documentos próximos a vencer
```

No es necesario construir todos los indicadores desde el primer día. Deben priorizarse los que soportan la operación del MVP.

---

# 35. Roadmap de desarrollo 1 a 1

## FASE 0 — Arquitectura base

Objetivo: preparar el terreno.

### Tareas

- Definir arquitectura frontend/backend.
- Definir estrategia multiempresa.
- Definir autenticación.
- Definir roles y permisos.
- Definir storage de archivos.
- Definir manejo de auditoría.
- Definir convenciones de base de datos.
- Definir ambientes DEV / QA / PROD.
- Definir estructura modular.

### Resultado

Una base lista para crecer sin rehacer la aplicación.

---

## FASE 1 — Identidad y acceso

### Construir

- Usuarios.
- Roles.
- Permisos.
- Negocios.
- Inicio de sesión.
- Recuperación de acceso.
- Asociación usuario → negocio.

### Resultado

Cada usuario entra al contexto correcto de su negocio.

---

## FASE 2 — Clientes

### Construir

- Persona.
- Empresa.
- CRUD.
- Búsqueda.
- Historial básico.

### Resultado

El sistema puede identificar quién es el propietario o responsable del vehículo.

---

## FASE 3 — Vehículos

### Construir

- CRUD de vehículos.
- Datos técnicos.
- Propietario.
- Kilometraje.
- Estado.
- Búsqueda por placa.

### Resultado

Cada vehículo tiene identidad propia.

---

## FASE 4 — Flotas

### Construir

- Crear flotas.
- Asignar vehículos.
- Mover vehículos entre flotas.
- Consultas individuales.
- Consultas grupales.

### Resultado

Se puede manejar tanto cliente particular como empresa.

---

## FASE 5 — Catálogo de servicios

### Construir

- Tipos de servicio.
- Categorías.
- Servicios activos/inactivos.
- Parámetros de servicio.

### Resultado

La aplicación ya no depende de una sola clase de mantenimiento.

---

## FASE 6 — Órdenes de servicio

### Construir

- Crear orden.
- Editar orden.
- Cambiar estado.
- Registrar kilometraje.
- Asignar técnico.
- Agregar servicios.
- Observaciones.

### Resultado

Existe un proceso operativo formal.

---

## FASE 7 — Cambio de aceite

### Construir

- Flujo completo.
- Productos usados.
- Cantidades.
- Datos de servicio.
- Próximo mantenimiento.

### Resultado

Primer MVP funcional y demostrable.

---

## FASE 8 — Evidencias

### Construir

- Subida de imágenes.
- Subida de documentos.
- Asociación a órdenes.
- Consulta de evidencias.
- Permisos de visualización.

### Resultado

Cada servicio puede ser auditado visualmente/documentalmente.

---

## FASE 9 — Inventario

### Construir

- Productos.
- Categorías.
- Existencias.
- Entradas.
- Salidas.
- Ajustes.
- Stock mínimo.
- Integración con órdenes.

### Resultado

El consumo real de productos queda trazado.

---

## FASE 10 — Hoja de vida

### Construir

- Timeline.
- Servicios.
- Evidencias.
- Kilometrajes.
- Productos utilizados.
- Mantenimientos.
- Documentos.

### Resultado

Se obtiene la trazabilidad completa del vehículo.

---

## FASE 11 — Mantenimiento programado

### Construir

- Reglas por km.
- Reglas por tiempo.
- Reglas combinadas.
- Próxima fecha.
- Próximo kilometraje.
- Estados de mantenimiento.

### Resultado

La plataforma pasa de registrar a anticipar.

---

## FASE 12 — Notificaciones

### Construir

- Motor de eventos.
- Plantillas.
- Recordatorios.
- Alertas.
- Registro de envíos.
- Estados de notificación.

### Resultado

El sistema puede actuar sin que el usuario tenga que revisar manualmente todo el tiempo.

---

## FASE 13 — Portal cliente particular

### Construir

- Registro/autenticación.
- Mis vehículos.
- Historial.
- Próximos mantenimientos.
- Documentos.
- Evidencias autorizadas.

### Resultado

El cliente final tiene acceso directo a la trazabilidad.

---

## FASE 14 — Portal empresa

### Construir

- Dashboard.
- Flotas.
- Vehículos.
- Mantenimientos.
- Alertas.
- Documentos.
- Reportes.

### Resultado

La plataforma puede atender operaciones de flotas.

---

## FASE 15 — Documentación

### Construir

- Documentos genéricos.
- Tipos de documento.
- Vencimientos.
- Evidencias.
- Historial.

### Resultado

Base lista para SOAT, técnico-mecánica, seguros e impuestos.

---

## FASE 16 — SOAT

### Construir

- Registro.
- Vigencia.
- Evidencia.
- Alertas.
- Historial.

### Resultado

Primer módulo documental de alto valor.

---

## FASE 17 — Técnico-mecánica

### Construir

- Registro.
- Vigencia.
- Resultado.
- Evidencia.
- Alertas.

---

## FASE 18 — Seguros

### Construir

- Pólizas.
- Aseguradoras.
- Vigencias.
- Coberturas.
- Documentos.
- Alertas.

---

## FASE 19 — Llantas

### Construir

- Inventario de llantas por vehículo.
- Posición.
- Instalación.
- Retiro.
- Kilometraje.
- Historial.

---

## FASE 20 — Baterías

### Construir

- Registro.
- Serial.
- Instalación.
- Garantía.
- Historial.

---

## FASE 21 — Planes de mantenimiento

### Construir

- Plantillas.
- Planes por tipo de vehículo.
- Servicios asociados.
- Reglas de kilometraje.
- Reglas de tiempo.

---

## FASE 22 — Reportes avanzados

### Construir

- Costos por vehículo.
- Costos por flota.
- Consumo.
- Servicios por periodo.
- Mantenimiento por estado.
- Documentos por vencer.
- KPIs.

---

## FASE 23 — Proveedores

### Construir

- Proveedores.
- Categorías.
- Contactos.
- Servicios ofrecidos.
- Productos.

---

## FASE 24 — Marketplace / ecosistema

### Construir posteriormente

- Catálogo de servicios.
- Proveedores aliados.
- Solicitud de cotizaciones.
- Solicitudes de servicio.
- Integraciones externas.
- Posibles comisiones.

Esta fase representa una evolución del producto y debe iniciarse únicamente cuando el núcleo de trazabilidad ya sea estable.

---

# 36. Priorización del MVP

El MVP real debe centrarse en el problema principal.

## MVP 1

```text
Negocio
↓
Usuarios
↓
Clientes
↓
Vehículos
↓
Flotas
↓
Órdenes
↓
Cambio de aceite
↓
Evidencias
↓
Inventario
↓
Historial
↓
Próximo mantenimiento
```

## MVP 2

```text
Notificaciones
Portal particular
Portal empresa
Dashboard
Reportes
```

## MVP 3

```text
Documentos
SOAT
Técnico-mecánica
Seguros
```

## Expansión

```text
Llantas
Baterías
Frenos
Mantenimiento preventivo
Proveedores
Marketplace
```

---

# 37. Estructura de navegación sugerida

## Panel administrativo

```text
Dashboard

Operación
├── Clientes
├── Vehículos
├── Flotas
├── Órdenes de servicio
└── Servicios

Mantenimiento
├── Planes
├── Programados
└── Historial

Inventario
├── Productos
├── Existencias
└── Movimientos

Documentación
├── SOAT
├── Técnico-mecánica
├── Seguros
└── Otros

Notificaciones
├── Pendientes
├── Enviadas
└── Configuración

Reportes

Administración
├── Usuarios
├── Roles
├── Sedes
└── Configuración
```

---

# 38. Navegación del portal particular

```text
Inicio
Mis vehículos
Historial
Mantenimientos
Documentos
Notificaciones
Perfil
```

---

# 39. Navegación del portal empresarial

```text
Dashboard
Flotas
Vehículos
Mantenimientos
Documentos
Servicios
Costos
Reportes
Usuarios
Configuración
```

---

# 40. Auditoría y trazabilidad interna

La plataforma debe registrar quién realizó cada acción importante.

Ejemplos:

```text
Quién creó el vehículo
Quién modificó el kilometraje
Quién creó la orden
Quién registró el servicio
Quién cerró la orden
Quién modificó inventario
Quién subió una evidencia
Quién cambió una fecha de vencimiento
```

Entidad conceptual:

```text
audit_logs
```

Esto es especialmente importante para empresas y flotas.

---

# 41. Reglas importantes de negocio

## Regla 1 — La placa no debe ser la única identidad

La placa sirve para búsqueda, pero el vehículo debe tener un identificador interno único.

## Regla 2 — El kilometraje debe tener historial

No simplemente actualizar:

```text
vehicle.current_mileage
```

También debe poder registrarse el valor informado durante cada servicio.

## Regla 3 — Los documentos tienen vigencia

Nunca guardar solamente un archivo; guardar también los datos de vigencia y estado.

## Regla 4 — Los servicios generan historial

No actualizar únicamente el vehículo. Toda actividad importante debe quedar registrada como evento histórico.

## Regla 5 — Inventario y servicios deben estar relacionados

Lo utilizado en un servicio debe poder generar movimientos de inventario.

## Regla 6 — Las notificaciones deben derivarse de eventos/reglas

No crear una lógica diferente para cada módulo.

## Regla 7 — Todo módulo debe poder crecer sin romper el núcleo

SOAT, seguros, llantas y baterías deben aprovechar componentes existentes siempre que sea posible.

---

# 42. Arquitectura técnica sugerida

Una arquitectura inicial podría manejar:

```text
Frontend
   ↓
API Backend
   ↓
Servicios de dominio
   ↓
Base de datos
   ↓
Storage de archivos
   ↓
Cola de eventos / notificaciones
```

## Capas conceptuales

```text
UI
 ↓
Application
 ↓
Domain
 ↓
Infrastructure
```

No es obligatorio usar una arquitectura excesivamente compleja desde el primer día. Lo importante es mantener separadas las responsabilidades y evitar acoplar la lógica de negocio a la interfaz.

---

# 43. Consideraciones para la base de datos

La base de datos debe diseñarse para soportar:

- Multiempresa.
- Relaciones entre clientes y vehículos.
- Flotas.
- Historial.
- Servicios.
- Productos.
- Documentos.
- Evidencias.
- Mantenimientos.
- Notificaciones.
- Auditoría.

Se deben evitar columnas específicas para cada futuro módulo dentro de `vehicles`.

Ejemplo de mala práctica:

```text
vehicle
├── soat_number
├── soat_expiration
├── insurance_number
├── tire_brand
├── battery_brand
├── oil_type
└── ...
```

Es mejor utilizar entidades independientes:

```text
vehicle
├── vehicle_documents
├── tires
├── batteries
├── service_orders
├── maintenance_records
└── ...
```

---

# 44. Estrategia de crecimiento del producto

La plataforma debe crecer en capas.

### Capa 1 — Operación

Registrar lo que ocurre.

```text
Clientes
Vehículos
Servicios
Inventario
```

### Capa 2 — Trazabilidad

Entender qué ocurrió.

```text
Historial
Evidencias
Auditoría
```

### Capa 3 — Prevención

Anticipar lo que ocurrirá.

```text
Mantenimiento
Documentos
Alertas
```

### Capa 4 — Gestión empresarial

Analizar y controlar.

```text
Flotas
Dashboards
Reportes
Costos
```

### Capa 5 — Ecosistema

Conectar servicios y proveedores.

```text
SOAT
Seguros
Aliados
Marketplace
```

---

# 45. Visión final del producto

La evolución esperada es:

```text
                 VEHÍCULO
                     │
       ┌─────────────┼─────────────┐
       ↓             ↓             ↓
Mantenimiento   Documentación   Operación
       │             │             │
     Aceite         SOAT          Flotas
     Frenos         RTM           Inventario
     Llantas        Seguro        Servicios
     Batería        Impuestos     Reportes
       │             │             │
       └─────────────┼─────────────┘
                     ↓
              TRAZABILIDAD
                     ↓
             MANTENIMIENTO
                     ↓
              NOTIFICACIONES
                     ↓
              PORTAL CLIENTE
                     ↓
              GESTIÓN DE FLOTA
                     ↓
               ECOSISTEMA
```

El valor central del producto será que una persona o empresa pueda consultar **todo el ciclo de vida del vehículo desde un solo lugar**.

---

# 46. Orden recomendado de implementación

La secuencia final recomendada es:

```text
01. Arquitectura base
02. Multiempresa
03. Usuarios / roles / permisos
04. Clientes
05. Vehículos
06. Flotas
07. Catálogo de servicios
08. Órdenes de servicio
09. Cambio de aceite
10. Evidencias
11. Inventario
12. Hoja de vida del vehículo
13. Mantenimiento programado
14. Notificaciones
15. Portal cliente particular
16. Portal empresa
17. Documentos
18. SOAT
19. Técnico-mecánica
20. Seguros
21. Llantas
22. Baterías
23. Planes de mantenimiento
24. Reportes avanzados
25. Proveedores
26. Marketplace / ecosistema
```

---

# 47. Meta del producto

La meta no es crear simplemente una aplicación que registre cambios de aceite.

La meta es crear una plataforma donde:

```text
Un vehículo
   ↓
pueda tener
   ↓
una hoja de vida digital completa
   ↓
con todos sus servicios,
productos, mantenimientos,
documentos, evidencias y alertas
   ↓
y esa información pueda ser consultada
   ↓
por propietarios particulares,
empresas y administradores de flota.
```

Con esta estrategia, el proyecto puede comenzar de forma pequeña con cambios de aceite y crecer gradualmente hasta convertirse en una plataforma integral de gestión vehicular.

---

# 48. Próximo paso técnico recomendado

Antes de comenzar el desarrollo de frontend, el siguiente entregable debería ser un **diseño técnico detallado del núcleo**, compuesto por:

1. Modelo entidad-relación.
2. Tablas definitivas.
3. Campos de cada tabla.
4. Relaciones y cardinalidades.
5. Estados de cada entidad.
6. Reglas de negocio.
7. Permisos por rol.
8. Endpoints/API.
9. Estructura de módulos del backend.
10. Estructura de módulos del frontend.
11. Estrategia de archivos/evidencias.
12. Estrategia de notificaciones.
13. Estrategia multiempresa.
14. Roadmap técnico de implementación.

Ese diseño debe hacerse antes de construir las pantallas para que Angular, backend y base de datos nazcan sobre el mismo modelo de dominio.
