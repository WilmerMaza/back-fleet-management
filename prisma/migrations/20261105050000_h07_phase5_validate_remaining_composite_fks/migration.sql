-- H-07 Fase 5: VALIDATE CONSTRAINT de las dos FK tenant restantes (Fase 4).
--
-- Escanea filas existentes y marca convalidated = true.
-- No crea ni elimina restricciones; no modifica datos, nulabilidad ni ON DELETE/UPDATE.
--
-- IMPORTANTE — entornos:
--   Ejecutar preflight (db:verify-tenant-fks + db:verify-constraints) en CADA
--   entorno antes de aplicar esta migración allí. Local limpio ≠ staging/prod.
--   No aplicar a producción sin autorización expresa.
--
-- Impacto de bloqueo (PostgreSQL):
--   VALIDATE toma SHARE UPDATE EXCLUSIVE (permite DML concurrente; bloquea DDL
--   conflictivo). Local demo: vehicles ≈ 6 filas, inventory_movements ≈ 2 → trivial.
--
-- Si VALIDATE falla por filas inconsistentes: remediar datos manualmente y reintentar.
-- No forzar ni dropear la FK.

ALTER TABLE "vehicles"
  VALIDATE CONSTRAINT "vehicles_fleet_tenant_fkey";

ALTER TABLE "inventory_movements"
  VALIDATE CONSTRAINT "inventory_movements_reversal_tenant_fkey";
