-- H-07 Fase 3: VALIDATE CONSTRAINT de las seis FK tenant (Fase 2).
--
-- Escanea filas existentes y marca convalidated = true.
-- No crea ni elimina restricciones; no modifica datos ni reglas ON DELETE/UPDATE.
--
-- IMPORTANTE — entornos:
--   Ejecutar preflight (db:verify-tenant-fks + db:verify-constraints) en CADA
--   entorno antes de aplicar esta migración allí. Local limpio ≠ staging/prod.
--   No aplicar a producción sin autorización expresa.
--
-- Impacto de bloqueo (PostgreSQL):
--   VALIDATE toma SHARE UPDATE EXCLUSIVE en la tabla hija (permite lecturas y
--   escrituras concurrentes; bloquea DDL conflictivo). En tablas grandes planificar
--   ventana de baja carga. Con volúmenes locales de demo el coste es trivial.
--
-- Si VALIDATE falla por filas inconsistentes: remediar datos manualmente y reintentar.
-- No forzar ni dropear la FK.

ALTER TABLE "vehicles"
  VALIDATE CONSTRAINT "vehicles_customer_tenant_fkey";

ALTER TABLE "fleets"
  VALIDATE CONSTRAINT "fleets_customer_tenant_fkey";

ALTER TABLE "fleet_vehicles"
  VALIDATE CONSTRAINT "fleet_vehicles_fleet_tenant_fkey";

ALTER TABLE "fleet_vehicles"
  VALIDATE CONSTRAINT "fleet_vehicles_vehicle_tenant_fkey";

ALTER TABLE "inventory_movements"
  VALIDATE CONSTRAINT "inventory_movements_product_tenant_fkey";

ALTER TABLE "vehicle_mileage_logs"
  VALIDATE CONSTRAINT "vehicle_mileage_logs_vehicle_tenant_fkey";
