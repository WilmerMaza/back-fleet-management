# 18 — Roles y permisos

Mock en el frontend. HTTP pendiente.

## Endpoints

### GET `/businesses/{businessId}/roles`

Lista roles del negocio (sistema + personalizados). Roles: `nav.roles`.

### GET `/businesses/{businessId}/roles/{roleId}`

Detalle con `permissionCodes`. Roles: `roles.write` (edición) o `nav.roles`.

### POST `/businesses/{businessId}/roles`

Crea un rol personalizado.

```json
{ "name": "Supervisor", "code": "SUPERVISOR", "description": "", "permissionCodes": ["nav.orders", "orders.write"] }
```

### PATCH `/businesses/{businessId}/roles/{roleId}`

Actualiza nombre, descripción y `permissionCodes`. El `code` de roles de sistema no cambia.

### DELETE `/businesses/{businessId}/roles/{roleId}`

Solo roles `isSystem: false` sin usuarios asignados. Roles: `roles.delete`.

## Matriz UI

Cada módulo expone acciones:

| Acción   | Significado                         |
| -------- | ----------------------------------- |
| Ver      | `nav.<módulo>` (aparece en el menú) |
| Editar   | `*.write` (alta y cambios)          |
| Eliminar | `*.delete` (cuando el módulo lo tiene) |

Órdenes y ventas tienen acciones extra (`orders.complete`, `sales.confirm`, …).

## Reglas

- Un usuario acumula los `permissionCodes` de todos sus `roleCodes`.
- ADMIN no puede quitarse Ver/Editar en Usuarios ni en Roles.
- Los roles de sistema se pueden ajustar; no se eliminan.
