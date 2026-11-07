-- H-07 Fase 4: FK compuestas restantes (proyección flota + self-FK reversión).
-- NOT VALID: exige co-tenancy en INSERT/UPDATE nuevos; no valida filas históricas
-- (VALIDATE CONSTRAINT = fase posterior, tras revisión).
--
-- Conserva las FK simples:
--   vehicles_fleet_id_fkey
--   inventory_movements_reverses_movement_id_fkey
--
-- Nulabilidad: fleet_id y reverses_movement_id siguen NULLABLE (NULL = sin flota /
-- sin reversión). PostgreSQL no aplica FK cuando la(s) columna(s) FK son NULL.
--
-- Reglas alineadas a FK simples: ON UPDATE CASCADE ON DELETE RESTRICT.
-- No toca UNIQUE Fase 1, FK Fase 2–3, ni H-03. Sin triggers.
--
-- Rollback manual:
--   ALTER TABLE "inventory_movements" DROP CONSTRAINT IF EXISTS "inventory_movements_reversal_tenant_fkey";
--   ALTER TABLE "vehicles" DROP CONSTRAINT IF EXISTS "vehicles_fleet_tenant_fkey";

ALTER TABLE "vehicles"
  ADD CONSTRAINT "vehicles_fleet_tenant_fkey"
  FOREIGN KEY ("business_id", "fleet_id")
  REFERENCES "fleets" ("business_id", "id")
  ON UPDATE CASCADE
  ON DELETE RESTRICT
  NOT VALID;

ALTER TABLE "inventory_movements"
  ADD CONSTRAINT "inventory_movements_reversal_tenant_fkey"
  FOREIGN KEY ("business_id", "reverses_movement_id")
  REFERENCES "inventory_movements" ("business_id", "id")
  ON UPDATE CASCADE
  ON DELETE RESTRICT
  NOT VALID;
