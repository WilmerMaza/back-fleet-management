# 02 — Customers

## Endpoints

- `GET /businesses/{businessId}/customers?search=&type=&status=&page=&sortBy=&sortDir=`
- `GET /businesses/{businessId}/customers/{id}`
- `POST /businesses/{businessId}/customers`
- `PATCH /businesses/{businessId}/customers/{id}`

## Entidad

```json
{
  "id": "uuid",
  "businessId": "uuid",
  "type": "PERSON|COMPANY",
  "status": "ACTIVE|INACTIVE",
  "documentType": "CC",
  "documentNumber": "...",
  "firstName": "...",
  "lastName": "...",
  "nit": "...",
  "legalName": "...",
  "tradeName": "...",
  "contactName": "...",
  "phone": "...",
  "email": "...",
  "address": "..."
}
```

## Reglas

- Unique por negocio: PERSON(`documentType`,`documentNumber`), COMPANY(`nit`).
- PERSON requiere nombres + documento; COMPANY requiere nit + legalName.
- Soft status; no borrar físico si tiene vehículos/órdenes.

## `GET` listado — parámetro `search` (`q` en la UI)

La firma no cambia: un único string. El alcance de campos **sí** debe alinearse.

### Comportamiento del mock (actual)

`CustomerMockRepository.list` filtra con `includes` (sin acentos normalizados, case-insensitive) sobre:

| Campo                   | Aplica a           |
| ----------------------- | ------------------ |
| `legalName`             | COMPANY            |
| `tradeName`             | COMPANY            |
| `firstName`, `lastName` | PERSON             |
| `contactName`           | COMPANY, si existe |
| `documentNumber`        | PERSON             |
| `nit`                   | COMPANY            |
| `email`                 | ambos, si existe   |
| `phone`                 | ambos, si existe   |

No usa el nombre mostrado (`tradeName || legalName`). Por eso `search=Transportes` encuentra `cust-002` aunque el listado pinte `ABC Flotas`.

### Contrato que deberá implementar backend

El HTTP `search` debe indexar **al menos** los mismos campos. Si el motor de búsqueda omite `phone` o `contactName`, hay que documentarlo aquí **antes** de cambiar el mock. No se añaden parámetros nuevos (`q` sigue siendo el único texto).

Aceptación: `search=Transportes` → `cust-002`; `ABC`, NIT y correo siguen coincidiendo; sin matches → lista vacía (`total: 0`), no error.

`sortBy` / `sortDir` se aplican **antes** de recortar la página. El mock acepta `name` | `type` | `document` | `status`. Sin `sortBy` conserva el orden de inserción.

## `PATCH` — vaciado de opcionales (DX-6, **pendiente de acuerdo**)

### Comportamiento actual del mock

`update` hace spread del payload. Un campo `undefined` **no borra** en JS (`{ ...row, email: undefined }` deja `email: undefined` en el objeto, y la UI lo trata como vacío). Un string vacío sí queda como `""`. El formulario de edición envía `undefined` para opcionales vacíos (`customer-form-payload.ts`). En el mock el usuario percibe el vaciado.

### Comportamiento esperado de PATCH HTTP (propuesta, no implementada)

JSON omite claves `undefined`. Vaciar un opcional en edición **no se persistiría**: el servidor conservaría el valor anterior y un `GET` posterior lo devolvería. Eso contradice lo que el usuario acaba de borrar.

Propuesta de producto (no aplicada en el cliente):

- En **edición**, los opcionales vaciados se envían como `null` (no `""`, no omitidos).
- Backend interpreta `null` como “borrar el valor”.
- Claves ausentes = “no cambiar”.

### Campos opcionales que se pueden vaciar en el formulario

Compartidos: `phone`, `email`, `address`. COMPANY: `tradeName`, `contactName`. PERSON: `lastName` (no es obligatorio, DC-6). Los obligatorios del tipo no se vacían: el formulario los valida.

### Cambio requerido en backend

Aceptar `null` en esos opcionales en `PATCH /businesses/{businessId}/customers/{id}` y persistir el borrado. Respuesta del recurso con el campo vacío o ausente.

### Prueba de aceptación con `HttpRepository` (cuando exista)

1. Editar un cliente que tiene correo.
2. Borrar el correo y guardar.
3. `GET` del mismo id → `email` vacío.
4. No enviar `null` en alta (`POST`): omitir opcionales vacíos sigue siendo válido.

**Estado:** pendiente. El cliente **no** cambia `undefined` → `null` hasta este acuerdo. Ver `CUSTOMERS_CRUD_AUDIT.md` AU-F6.

## Errores de `GET` por id

Hoy el mock (y el contrato documentado) solo lanzan `Error(message)` (`Cliente no encontrado`). La UI **no** distingue 404 de fallo de red. Hace falta un código de error estable (B3) antes de ocultar «Reintentar» en un 404 real.

## Auditoría

`CUSTOMER_CREATED`, `CUSTOMER_UPDATED`
