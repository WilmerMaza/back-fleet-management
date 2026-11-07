# H-07 Fase 6 — Auditoría previa: FK de sesiones ↔ membresía

| | |
| --- | --- |
| Repo | `back-fleet-management` |
| Fecha | 2026-11-05 |
| Rol | Arquitecto (solo lectura) |
| Alcance | Viabilidad de FK compuesta `auth_refresh_sessions (user_id, active_business_id)` → `user_business_roles (user_id, business_id)` |
| Fuera de alcance | Migraciones, cambios de código/schema, escritura en BD, drop de FK existentes, implementación |

**Estado H-07 operativo (F0–F5, local):** 5 UNIQUE `(business_id, id)` · 8 FK tenant validadas · 8 FK simples conservadas · H-03 9/9 · `db:verify-tenant-fks` 12/12. **No** se proponen cambios a esas restricciones en esta fase.

---

## 1. Resumen ejecutivo

| Pregunta | Respuesta |
| --- | --- |
| ¿Es viable la FK compuesta a `user_business_roles`? | **Sí.** Tipos UUID compatibles; PK padre `(user_id, business_id)` ya existe; columnas hijas `NOT NULL`. |
| ¿Sustituye la comprobación `status = ACTIVE`? | **No.** La FK solo exige que **exista la fila** de membresía. `INACTIVE` es soft-status y **no** rompe la FK. |
| ¿`ON DELETE RESTRICT` es compatible hoy? | **Compatible con el modelo de producto** (baja = `INACTIVE`, no `DELETE`). **Incompatible con hard-delete** de membresía mientras existan filas de sesión (incluidas revocadas/expiradas) que apunten a ese par. |
| ¿Hay que revocar sesiones antes de borrar membresía? | **Sí, si algún día se hace `DELETE` físico.** Para `INACTIVE`, la app ya corta acceso (SEC-02/03); la FK no obliga a revocar, pero **sí es recomendable** revocar familias del negocio afectado. |
| ¿`NOT VALID` + `VALIDATE`? | **Sí**, mismo patrón F2–F5. Preflight: check `auth_session_missing_membership` = 0. |
| ¿Implementar ahora? | **No** en esta entrega. Informe para revisión. Prerrequisito de implementación: política explícita de ciclo de vida de membresía + (opcional) FK simple a `businesses`. |

**Veredicto:** la FK fuerte a membresía es el diseño correcto para H-07-03 (capa DB). No cierra sola el gap de membresía inactiva (eso ya lo cubre `AccessSessionService`). El riesgo operativo principal es **RESTRICT + filas históricas de sesión** frente a un futuro `DELETE` de `user_business_roles` sin API de purge.

---

## 2. Estado actual del modelo

### 2.1 Tablas y columnas (Hecho — `schema.prisma` + PostgreSQL local)

**`auth_refresh_sessions`**

| Columna | Tipo | Nullable | Notas |
| --- | --- | --- | --- |
| `id` | UUID | NO | PK |
| `user_id` | UUID | NO | FK → `users(id)` `ON DELETE CASCADE` `ON UPDATE CASCADE` |
| `family_id` | UUID | NO | Familia de rotación (H-04 / SEC-02) |
| `token_hash` | VARCHAR(64) | NO | UNIQUE |
| `active_business_id` | UUID | NO | **Sin FK** hoy |
| `expires_at` | timestamptz | NO | |
| `revoked_at` | timestamptz | YES | Soft revoke |
| `replaced_by_id` | UUID | YES | Sin FK (cadena de rotación) |
| `created_at` | timestamptz | NO | |

**`user_business_roles`** (modelo Prisma: `UserBusinessMembership`)

| Columna | Tipo | Nullable | Notas |
| --- | --- | --- | --- |
| `user_id` | UUID | NO | PK compuesta; FK → `users` RESTRICT |
| `business_id` | UUID | NO | PK compuesta; FK → `businesses` RESTRICT |
| `role_codes` | text[] | — | Fuente de permisos (SEC-03) |
| `permissions` | text[] | — | Informativo; Guard no confía |
| `status` | `MembershipStatus` | NO | `ACTIVE` \| `INACTIVE` |

**PK / UNIQUE padre (requisito FK compuesta):** `PRIMARY KEY (user_id, business_id)` — **suficiente** como destino de `REFERENCES user_business_roles (user_id, business_id)`. No hace falta UNIQUE adicional.

### 2.2 FK existentes en `auth_refresh_sessions` (Hecho)

| Constraint | Definición |
| --- | --- |
| `auth_refresh_sessions_user_id_fkey` | `(user_id) → users(id)` ON UPDATE CASCADE ON DELETE **CASCADE** |
| — | **Ninguna** FK sobre `active_business_id` |
| — | **Ninguna** FK a `user_business_roles` |

Migración: `prisma/migrations/20261104020000_auth_refresh_sessions/migration.sql`.

### 2.3 Datos locales (SELECT, 2026-11-05)

| Métrica | Valor |
| --- | ---: |
| Sesiones totales | 0 |
| Sesiones activas (no revocadas, no expiradas) | 0 |
| Membresías | 5 |
| Membresías `INACTIVE` | 0 |
| Orphan `active_business_id` → `businesses` | 0 |
| Sesión sin fila de membresía | 0 |
| Sesión apuntando a membresía `INACTIVE` | 0 |

Diagnóstico canónico ya incluido en `npm run db:verify-tenant-fks`:

- `auth_session_orphan_business`
- `auth_session_missing_membership` (LEFT JOIN a `user_business_roles` por `(user_id, business_id)` — **existencia de fila**, no status)

### 2.4 Código de identidad (no hay `AuthService`)

Responsabilidades reales:

| Pieza | Rol |
| --- | --- |
| `LoginUseCase` | Credenciales + `SessionIssuer.issue` |
| `SessionIssuer` | Emite access/refresh; persiste hash; filtra membresías **ACTIVE** |
| `RefreshSessionUseCase` | Rotación + reuse → `revokeFamily`; conserva `activeBusinessId` de la fila |
| `LogoutUseCase` | `revokeFamily` |
| `AuthController.switchBusiness` | `SessionIssuer.issue(userId, businessId)` (nueva familia) |
| `AccessSessionService` | SEC-02/03: familia activa + usuario ACTIVE + membresía ACTIVE + `permissionsForRoles` |
| `revokeFamily` | Soft: `revoked_at = now()` en filas de la familia |

No existe API HTTP de alta/baja/borrado de membresías en el código actual (solo seed / updates en tests).

---

## 3. Flujo de vida de las sesiones

```text
login / switch-business
  → SessionIssuer.loadMembership (solo ACTIVE)
  → JWT refresh + fila auth_refresh_sessions (familyId nuevo, active_business_id = membership.businessId)

refresh
  → verifica JWT + fila por token_hash
  → si reuse/revoked/expired → revokeFamily → 401
  → rota: marca revoked + create nueva fila (mismo familyId, mismo active_business_id)
  → issueAccessOnly → vuelve a exigir membresía ACTIVE

logout
  → revokeFamily(familyId) → access con ese familyId falla en Guard

request autenticado
  → AuthGuard → AccessSessionService
  → EXISTS sesión activa de familyId
  → membresía ACTIVE para payload.activeBusinessId
```

### 3.1 Escenarios relevantes para la FK

| Evento | Comportamiento actual | Efecto de FK a membresía |
| --- | --- | --- |
| Desactivar membresía (`status = INACTIVE`) | Access → 403 (SEC-03). Refresh → falla en `issueAccessOnly` tras rotar (si llega). Fila de sesión **sigue** existiendo. | FK **sigue válida** (la fila de membresía no se borró). |
| Eliminar membresía (`DELETE` fila) | No hay use case. Si se hace en SQL con sesiones que apuntan al par → hoy permitido a nivel FK (solo app/diagnóstico detecta). | Con `ON DELETE RESTRICT`: **bloqueado** mientras exista cualquier sesión con ese `(user_id, active_business_id)`. |
| Cambiar negocio activo (`switch-business`) | Nueva familia + nueva fila; **no** revoca la familia anterior. | FK exige membresía ACTIVE ya filtrada en `issue`; INSERT OK si existe fila (siempre ACTIVE path). Familias viejas del otro negocio siguen referenciando la otra membresía. |
| Revocar sesión (logout / reuse) | Soft `revoked_at`; filas **no** se borran. | FK sigue apuntando a la membresía. RESTRICT no se libera por revoke. |
| Refresh con membresía ya no ACTIVE | Tras rotación TX, `issueAccessOnly` lanza. Puede quedar fila nueva creada si falla post-TX. | Si membresía **borrada**: el `CREATE` de rotación fallaría por FK (mejor). Si solo INACTIVE: CREATE OK; fallo en app (igual que hoy). |
| Refresh con membresía inexistente | Hoy: create de rotación **sí** puede persistir; fallo después en loadMembership. | FK **rechaza** el INSERT de la rotación — mejora de integridad. |

---

## 4. Flujo de cambio de negocio

```text
POST /auth/switch-business { businessId }
  AuthGuard (familia + membresía ACTIVE del JWT actual)
  → SessionIssuer.issue(ctx.userId, body.businessId)
  → exige membresía ACTIVE en destino
  → nueva familyId / sid / refresh persistido
  → NO llama revokeFamily sobre la familia anterior
```

Implicaciones:

1. Un usuario multi-taller puede tener **varias familias activas** (una por switch/login), cada una con su `active_business_id`.
2. La FK compuesta valida cada fila por separado contra su par de membresía.
3. Switch a negocio sin membresía: falla en app **antes** del INSERT (y con FK también fallaría el INSERT).
4. Gap de producto (fuera del núcleo FK, pero relacionado): switch no invalida refresh del negocio previo. La FK **no** obliga a cerrar la familia anterior; si se desea “una sesión lógica”, es cambio de aplicación, no de constraint.

---

## 5. Riesgos de integridad

| ID | Riesgo | Severidad | Mitigación actual | ¿FK membresía lo cierra? |
| --- | --- | --- | --- | --- |
| R1 | `active_business_id` apunta a negocio inexistente | P2 | Diagnóstico `auth_session_orphan_business`; app solo escribe IDs de membresía | Parcial: FK a `user_business_roles` implica negocio existente vía FK de membresía a `businesses`. FK simple a `businesses` es redundante pero más explícita. |
| R2 | Sesión con negocio existente **sin** fila de membresía | P2 | Diagnóstico `auth_session_missing_membership`; issue/refresh/Guard | **Sí** (objetivo de esta FK) |
| R3 | Sesión con membresía `INACTIVE` | P1 auth (SEC) | Guard + issueAccessOnly | **No** (FK no ve `status`) |
| R4 | Hard-delete de membresía con sesiones históricas | P2 ops | No hay API delete | RESTRICT lo convierte en error SQL; requiere política de purge |
| R5 | Rotación refresh tras borrado de membresía deja fila inconsistente | Medio | App falla post-TX | FK falla en INSERT de rotación (mejora) |
| R6 | Prisma `migrate diff` propone DROP de `user_id` FK o de H-07 operativas | Proceso | Revisión manual (lección F2–F5) | Proceso, no diseño |
| R7 | Doble FK `user_id` (CASCADE a users) + RESTRICT a membresía | Bajo | Coexistencia viable | Documentar orden de borrado |

**Límite conceptual:** la FK garantiza **membresía referencial**, no **membresía autorizada (ACTIVE)**. Ambas capas son necesarias.

---

## 6. Política recomendada para eliminación de membresías

Alineada a contratos (`docs/api-contracts/01-auth.md`, `00-multitenancy.md`): baja = **`INACTIVE`**, no borrado físico.

### 6.1 Camino preferido (producto)

1. `UPDATE user_business_roles SET status = 'INACTIVE'`.
2. **Recomendado:** revocar todas las familias del usuario con `active_business_id = :businessId` (`revokeFamily` por familia o `UPDATE … SET revoked_at` filtrado).
3. Invalidar cache de access (`AccessSessionService.invalidateFamily`).
4. No `DELETE` la fila salvo requisito legal/retención.

Con esta política, `ON DELETE RESTRICT` en la FK de sesión **casi nunca se ejercita** y es seguro.

### 6.2 Si en el futuro se requiere `DELETE` físico

Orden obligatorio en una sola TX (o pasos ordenados):

1. Revocar sesiones del par `(user_id, business_id)`.
2. **Borrar o archivar** filas de `auth_refresh_sessions` con ese par (no basta soft-revoke si la FK sigue referenciando la membresía).
3. `DELETE` de `user_business_roles`.

Sin el paso 2, `RESTRICT` fallará aunque `revoked_at` esté poblado.

### 6.3 Alternativas de `ON DELETE` evaluadas

| Opción | Veredicto |
| --- | --- |
| `RESTRICT` | **Recomendada** con política soft-delete + purge antes de hard-delete. |
| `CASCADE` (borrar sesiones al borrar membresía) | Posible pero agresivo; mezcla identidad de sesión con admin de roles; no recomendada en MVP. |
| `SET NULL` | **Inválida:** columnas `NOT NULL`. |
| FK parcial solo sesiones activas | **No soportado** en PostgreSQL. |

---

## 7. Diseño SQL propuesto (no implementar aún)

```sql
-- H-07 Fase 6 (propuesta): FK sesión → membresía, NOT VALID
-- Conservar auth_refresh_sessions_user_id_fkey.
-- Preflight: auth_session_missing_membership = 0 en el entorno.

ALTER TABLE "auth_refresh_sessions"
  ADD CONSTRAINT "auth_refresh_sessions_membership_tenant_fkey"
  FOREIGN KEY ("user_id", "active_business_id")
  REFERENCES "user_business_roles" ("user_id", "business_id")
  ON UPDATE CASCADE
  ON DELETE RESTRICT
  NOT VALID;

-- Fase posterior (VALIDATE), tras el mismo preflight en el entorno:
-- ALTER TABLE "auth_refresh_sessions"
--   VALIDATE CONSTRAINT "auth_refresh_sessions_membership_tenant_fkey";
```

**Opcional en la misma oleada o justo antes (más débil, barata):**

```sql
ALTER TABLE "auth_refresh_sessions"
  ADD CONSTRAINT "auth_refresh_sessions_active_business_id_fkey"
  FOREIGN KEY ("active_business_id")
  REFERENCES "businesses" ("id")
  ON UPDATE CASCADE
  ON DELETE RESTRICT
  NOT VALID;
```

La FK a membresía **ya implica** negocio existente; la FK simple a `businesses` aporta claridad y mensajes de error más directos, a costa de una constraint extra. Decisión de producto: **membresía es la fuerte; businesses es opcional**.

Nombre sugerido alineado a F2/F4: `auth_refresh_sessions_membership_tenant_fkey`.

---

## 8. Diseño Prisma propuesto (no implementar aún)

```prisma
model AuthRefreshSession {
  id               String    @id @default(uuid()) @db.Uuid
  userId           String    @map("user_id") @db.Uuid
  familyId         String    @map("family_id") @db.Uuid
  tokenHash        String    @unique @map("token_hash") @db.VarChar(64)
  activeBusinessId String    @map("active_business_id") @db.Uuid
  expiresAt        DateTime  @map("expires_at") @db.Timestamptz(6)
  revokedAt        DateTime? @map("revoked_at") @db.Timestamptz(6)
  replacedById     String?   @map("replaced_by_id") @db.Uuid
  createdAt        DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)

  /// Conservar FK simple a users (CASCADE) — coexistencia con constraint SQL actual
  user       User                     @relation(fields: [userId], references: [id], onDelete: Cascade)
  /// H-07: sesión anclada a membresía (SQL NOT VALID → VALIDATE)
  membership UserBusinessMembership   @relation(fields: [userId, activeBusinessId], references: [userId, businessId], onDelete: Restrict)

  @@index([userId])
  @@index([familyId])
  @@index([expiresAt])
  @@map("auth_refresh_sessions")
}

model UserBusinessMembership {
  // …campos existentes…
  user     User     @relation(…)
  business Business @relation(…)
  refreshSessions AuthRefreshSession[]

  @@id([userId, businessId])
  @@map("user_business_roles")
}
```

**Notas Prisma 6:**

- `userId` participa en dos relaciones (`User` y `UserBusinessMembership`); patrón válido y análogo a coexistencia simple+compuesta de H-07 operativo.
- No ejecutar `migrate diff` / `migrate dev` a ciegas: puede proponer `DROP` de la FK simple a `users` o cambios ajenos.
- Preferir migración SQL manual (`NOT VALID`) + ajuste de schema, como Fases 2–5.
- No usar `prisma migrate reset` en entornos con datos.

---

## 9. Plan de migración y validación (futuro)

```text
F6a  Auditoría (este documento)                         ← AQUÍ
F6b  Acuerdo de política: soft-delete membresía + purge
F6c  Preflight por entorno (verify-tenant-fks auth_*)
F6d  ADD CONSTRAINT … NOT VALID (membresía; opcional businesses)
F6e  Pruebas int (INSERT/refresh/switch/INACTIVE/DELETE)
F6f  VALIDATE CONSTRAINT (ventana controlada)
F6g  (Opcional) API admin: desactivar membresía + revoke sesiones
```

**Bloqueo:** si `auth_session_missing_membership > 0` en staging/prod → remediar datos **antes** de VALIDATE; no auto-reparar.

**Impacto de bloqueo:** tablas de sesión suelen ser medianas; `NOT VALID` barato; `VALIDATE` = `SHARE UPDATE EXCLUSIVE`. Local hoy: 0 sesiones → trivial.

**Entornos:** local limpio ≠ staging/prod. No aplicar a producción sin autorización expresa.

---

## 10. Pruebas necesarias (cuando se implemente)

| # | Caso | Esperado |
| --- | --- | --- |
| 1 | Login/switch crea sesión con membresía ACTIVE | OK |
| 2 | INSERT sesión con `active_business_id` sin fila de membresía | Rechazo FK (P2003) |
| 3 | INSERT sesión con negocio existente pero otro `user_id` | Rechazo FK |
| 4 | Refresh mismo negocio con membresía ACTIVE | OK |
| 5 | Membresía → `INACTIVE`; access | 403 (app); FK intacta |
| 6 | `DELETE` membresía con sesión (incluso revoked) sin purge | Rechazo RESTRICT |
| 7 | Revocar + `DELETE` sesiones del par + `DELETE` membresía | OK |
| 8 | Rotación refresh tras `DELETE` membresía | Falla en CREATE (FK), no deja huérfano |
| 9 | Catálogo: constraint existe; tras F6f `convalidated = true` |
| 10 | Regresión: H-07 F0–F5, H-03 9/9, auth-hardening int |
| 11 | `verify-tenant-fks` siembra missing membership vía `session_replication_role` | Sigue detectando FAIL |

---

## 11. Riesgos staging / producción

| Riesgo | Nota |
| --- | --- |
| Sesiones huérfanas reales | Posibles si hubo SQL manual o bugs antiguos; F6c obligatorio |
| Volumen de sesiones históricas | RESTRICT dificulta limpiezas de membresía; planear job de purge de revoked/expired |
| Multi-instancia + cache SEC-02 | Independiente de la FK; invalidar cache tras revoke sigue siendo app |
| Switch sin revoke de familia previa | Comportamiento actual; FK no lo cambia |
| Confundir FK con ACTIVE | Operaciones pueden creer sesión solo vía app ACTIVE; un INSERT crudo con membresía INACTIVE **pasaría** la FK |
| Drift Prisma | Revisar SQL generado; no dropear `auth_refresh_sessions_user_id_fkey` ni FK H-07 operativas |

---

## 12. Relación con auditorías hermanas

| Documento | Vínculo |
| --- | --- |
| [`tenant-referential-integrity-audit.md`](./tenant-referential-integrity-audit.md) | H-07-03; Fases 0–5 operativas hechas; auth = siguiente |
| [`database-integrity-audit.md`](./database-integrity-audit.md) | P2 FK auth; ya anticipaba FK compuesta a membresía |
| [`auth-hardening-fixes.md`](./auth-hardening-fixes.md) | SEC-02/03 ya revalidan familia + ACTIVE; la FK es defensa en profundidad en DB |
| [`security-audit.md`](./security-audit.md) | Baja de membresía / ventana de access — complementario, no sustituido |

---

## 13. Recomendación final

1. **Aprobar** la FK compuesta a `user_business_roles` con `ON DELETE RESTRICT` + `NOT VALID` → `VALIDATE` en oleadas separadas.
2. **Documentar y aplicar** política: membresía se desactiva; hard-delete solo tras purge de sesiones del par.
3. **Mantener** la revalidación ACTIVE en aplicación (SEC-03); no depender de la FK para eso.
4. **Opcional:** FK simple a `businesses` como complemento explícito.
5. **No implementar** en esta fase; esperar revisión explícita antes de F6d.

**Detenido para revisión.** Sin migraciones ni cambios de código en esta entrega.
