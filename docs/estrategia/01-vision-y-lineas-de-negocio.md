# KONTI — Visión estratégica y líneas de negocio

| | |
| --- | --- |
| Estado | **Documento estratégico** — no es contrato API ni backlog de sprint |
| Fecha | 2026-11-15 |
| Alcance | Producto, arquitectura y comercialización |
| Implementación | Prohibida por el solo hecho de aparecer aquí; ver §8 |

---

## 1. Propósito

Incorporar en la planeación maestra de KONTI una visión estratégica que consolide líneas de negocio actuales y futuras, manteniendo una arquitectura **modular**, **multiempresa (multi-tenant)**, **escalable** y **comercialmente flexible**.

KONTI evoluciona como plataforma integral de **gestión empresarial** y **digitalización comercial**: las empresas administran operaciones internas y canales de venta desde un mismo ecosistema.

Esta definición forma parte de la documentación estratégica y funcional. **No** implica que todas las capacidades deban desarrollarse de inmediato.

---

## 2. Visión del producto

KONTI es una plataforma **SaaS multiempresa** que centraliza la gestión operativa y comercial de las organizaciones: procesos empresariales, control de recursos y canales digitales.

### Principio fundamental

> **Una empresa, una fuente de verdad, un inventario y múltiples canales de operación y comercialización.**

Los módulos y servicios comparten la información empresarial central. Se evita:

- duplicidad de registros maestros;
- inventarios independientes por canal;
- reglas de negocio inconsistentes entre módulos.

### Relación con el vertical vehicular

El núcleo operativo actual (gestión y trazabilidad vehicular, órdenes de servicio, inventario de taller, flotas) es el **primer vertical de profundidad** dentro de **KONTI Gestión**. No sustituye esta visión: la materializa en el dominio taller/flota.

Cadena conceptual del vertical vigente:

```text
Cliente → Vehículo/Flota → Orden/Servicio → Evidencias → Historial → Alertas
```

---

## 3. Líneas de negocio

### Línea 1. KONTI Gestión — Gestión empresarial

**Núcleo principal** de la plataforma. Fuente de verdad de la información operativa.

**Objetivo:** herramientas para administrar la operación de cada empresa (`Business` / tenant).

**Capacidades contempladas:**

| Área | Capacidades |
| --- | --- |
| Organización | Empresas y sucursales |
| Catálogo | Productos y servicios |
| Stock | Inventario, movimientos, almacenes |
| Cadena de suministro | Compras y proveedores |
| Comercial operativo | Ventas y clientes |
| Precios | Control de precios y costos |
| Finanzas | Gestión financiera y administrativa (evolución) |
| Acceso | Usuarios, roles y permisos |
| Inteligencia básica | Reportes y analítica empresarial |
| Cumplimiento | Preparación de datos para futuras integraciones de facturación electrónica |

**Estado de evolución (referencia):** el vertical vehicular/taller está en ejecución según [`PLAN_EJECUCION_COMPLETO.md`](../PLAN_EJECUCION_COMPLETO.md). Capacidades genéricas de compras, almacenes multi-sucursal o finanzas avanzadas pueden estar en visión o evaluación según el corte vigente.

---

### Línea 2. KONTI Comercio — Presencia digital y comercio electrónico

Línea **complementaria**: página web y tienda en línea de cada empresa, administradas desde KONTI.

**No** es un segundo sistema administrativo ni mantiene inventarios independientes.

#### Sitio web empresarial

- Identidad visual (logotipo, colores, personalización)
- Dominios propios y subdominios
- Plantillas y páginas institucionales
- Contacto y ubicación

#### Catálogo digital

- Publicación de productos **existentes** en KONTI Gestión
- Imágenes y galerías
- Descripciones comerciales
- Categorías y colecciones de presentación
- SEO, URLs amigables, destacados
- Visibilidad y estado de publicación

#### Tienda en línea

- Carrito y pedidos
- Pasarelas de pago
- Métodos de envío
- Disponibilidad alineada al inventario
- Estados de pedido
- Integración con ventas e inventario de Gestión

#### Analítica digital

- Visitas, productos consultados, rendimiento del catálogo
- Conversión y ventas por canal

#### Principio arquitectónico de KONTI Comercio

La tienda **consume** KONTI Gestión. No debe existir una segunda administración de:

- productos maestros;
- SKU y referencias;
- precios operativos;
- existencias;
- movimientos de inventario;
- compras y proveedores.

Los productos conservan **una identidad empresarial** y pueden tener **perfiles adicionales** de presentación comercial y publicación digital.

| Concern | Regla |
| --- | --- |
| Medios | Objetos en almacenamiento externo; KONTI guarda referencias y metadatos |
| Disponibilidad web | Respeta inventario, almacenes, reservas y canales de venta |
| Pedidos web | Entran a KONTI vía APIs y procesos transaccionales controlados |

**Estado de evolución (referencia):** Visión / en evaluación. No hay contrato HTTP ni módulo de implementación aprobado.

---

## 4. Líneas de negocio futuras

Oportunidades estratégicas. **No** están aprobadas para desarrollo inmediato.

### Línea 3. KONTI Conecta — Integraciones empresariales

Ecosistema de integraciones externas:

- Pasarelas de pago
- Facturación electrónica
- Servicios logísticos
- WhatsApp Business
- Marketplaces
- Servicios contables
- Sistemas externos y APIs

**Estado:** Visión. La preparación de datos para FE (sin motor DIAN) se documenta en [`arquitectura-comercial/11-preparacion-facturacion-electronica.md`](../arquitectura-comercial/11-preparacion-facturacion-electronica.md); eso **no** equivale a KONTI Conecta implementado.

### Línea 4. KONTI Inteligencia — Analítica y automatización

- Indicadores y tableros ejecutivos
- Análisis de ventas
- Predicción de demanda
- Alertas inteligentes
- Automatización de procesos
- Asistentes empresariales

**Estado:** Visión.

---

## 5. Administración estratégica (perfil administrador de plataforma)

En la consola global de KONTI (`SUPER_ADMIN` / administración de plataforma), incorporar una sección:

**Estrategia y líneas de negocio**

Finalidad: que el administrador de KONTI consulte y mantenga visible la dirección estratégica del producto.

**No** confundir con los módulos administrativos disponibles para los tenants.

### Información por línea

| Campo | Descripción |
| --- | --- |
| Nombre | Identificador comercial de la línea |
| Descripción | Resumen |
| Objetivo estratégico | Para qué existe |
| Propuesta de valor | Beneficio para el cliente |
| Capacidades principales | Funciones previstas o habilitadas |
| Público objetivo | Segmentos |
| Modelo comercial | Cómo se vende / empaqueta |
| Dependencias | Relación con otras líneas o módulos |
| Estado de evolución | Ver estados abajo |
| Prioridad estratégica | Orden relativo |
| Observaciones | Decisiones relevantes |

### Estados sugeridos

| Estado | Significado |
| --- | --- |
| Visión | Oportunidad identificada |
| Planeada | Aprobada para planificación |
| En evaluación | Requiere análisis |
| En desarrollo | Implementación activa |
| Disponible | Habilitada comercialmente |
| Suspendida | Detenida temporalmente |

### Funcionalidades del administrador (previstas)

- Consultar líneas, capacidades y paquetes comerciales
- Registrar oportunidades y actualizar estados
- Documentar decisiones y dependencias
- Consultar historial de cambios
- Acceso exclusivo a perfiles autorizados de administración global

**Estado de esta sección UI:** Consulta disponible en consola `SUPER_ADMIN` (`/app/admin/strategy`). Solo lectura embebida desde `features/platform/strategy`; editar estados, historial y alta de oportunidades quedan pendientes.

---

## 6. Modelo comercial y contratación

Las líneas pueden convertirse en **servicios contratables** por empresa (`Business`).

### Ejemplo de oferta

| Servicio | Rol comercial |
| --- | --- |
| KONTI Gestión | Servicio principal |
| KONTI Comercio | Complemento de presencia digital |
| KONTI E-commerce | Capacidades avanzadas de venta en línea (dentro o sobre Comercio) |
| KONTI Conecta | Integraciones adicionales |
| KONTI Inteligencia | Analítica y automatización avanzada |

### Requisitos de arquitectura

- Activar / desactivar capacidades por empresa
- Planes, paquetes y suscripciones
- Permisos según servicios contratados
- Bloquear acceso a funcionalidades no habilitadas
- Contratación **sin** duplicar datos ni crear sistemas operativos paralelos

La contratación es independiente y configurable por tenant.

---

## 7. Principios arquitectónicos obligatorios

Toda evolución de KONTI debe respetar:

1. Arquitectura multi-tenant con aislamiento de datos (`businessId` / contexto).
2. Modularidad y separación de responsabilidades.
3. Fuente única de verdad para datos empresariales.
4. Inventario centralizado y compartido entre canales.
5. APIs para integraciones y comunicación entre módulos.
6. Seguridad por roles, permisos y contexto empresarial.
7. Escalabilidad progresiva **sin** microservicios prematuros.
8. Separación entre información operativa y presentación comercial.
9. Preparación para integraciones externas (sin acoplar motores de terceros al núcleo).
10. Trazabilidad de operaciones y decisiones.
11. Observabilidad y control del consumo de recursos.
12. Evolución tecnológica sin comprometer módulos existentes.

Complementan (no sustituyen) los principios del vertical vehicular en el plan de ejecución: núcleo genérico de servicios (sin `oil_changes`), evidencias polimórficas, auditoría, etc.

---

## 8. Directrices para la planeación

Esta definición es **referencia** para decisiones de arquitectura, diseño, desarrollo y comercialización.

**No** implementar automáticamente nuevas funcionalidades por estar contempladas aquí.

Cada iniciativa debe pasar por:

1. Evaluación de valor de negocio
2. Análisis de impacto arquitectónico
3. Identificación de dependencias
4. Definición de alcance
5. Priorización
6. Estimación de esfuerzo
7. Aprobación explícita para desarrollo

---

## 9. Resultado esperado

KONTI se consolida como ecosistema empresarial: cada organización administra operaciones y contrata servicios digitales adicionales **sin** sistemas independientes.

Visión final: inventario, compras, ventas, clientes, sitio web y comercio electrónico desde una misma plataforma, con integridad de datos e independencia de canales comerciales.

> **KONTI: un ecosistema, múltiples capacidades, una sola operación empresarial.**

---

## 10. Matriz de referencia rápida (snapshot)

| Línea | Prioridad estratégica | Estado (snapshot 2026-11-15) | Dependencias |
| --- | --- | --- | --- |
| KONTI Gestión | Alta | En desarrollo (vertical vehicular/taller) | Identidad, tenancy, inventario |
| KONTI Comercio | Media | Visión | Gestión (catálogo, precios, stock, ventas) |
| KONTI Conecta | Media-baja | Visión | Gestión; prep. FE documentada por separado |
| KONTI Inteligencia | Baja | Visión | Datos de Gestión (+ Comercio si aplica) |

Vista en app: `/app/admin/strategy` (permiso `nav.platform.strategy`). Actualizar esta matriz cuando el administrador de plataforma o el equipo de producto registren decisiones formales.
