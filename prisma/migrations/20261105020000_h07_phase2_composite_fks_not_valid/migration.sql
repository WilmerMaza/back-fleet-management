-- H-07 Fase 2: FK compuestas multi-tenant con NOT VALID.
-- Exige co-tenancy en INSERT/UPDATE nuevos; no valida filas históricas todavía
-- (VALIDATE CONSTRAINT = Fase 3, tras revisión).
--
-- Conserva las FK simples existentes (*_customer_id_fkey, etc.).
-- No toca UNIQUE Fase 1 ni restricciones H-03.
-- Reglas alineadas a FK simples: ON UPDATE CASCADE ON DELETE RESTRICT.
--
-- Rollback manual:
--   ALTER TABLE "vehicle_mileage_logs" DROP CONSTRAINT IF EXISTS "vehicle_mileage_logs_vehicle_tenant_fkey";
--   ALTER TABLE "inventory_movements" DROP CONSTRAINT IF EXISTS "inventory_movements_product_tenant_fkey";
--   ALTER TABLE "fleet_vehicles" DROP CONSTRAINT IF EXISTS "fleet_vehicles_vehicle_tenant_fkey";
--   ALTER TABLE "fleet_vehicles" DROP CONSTRAINT IF EXISTS "fleet_vehicles_fleet_tenant_fkey";
--   ALTER TABLE "fleets" DROP CONSTRAINT IF EXISTS "fleets_customer_tenant_fkey";
--   ALTER TABLE "vehicles" DROP CONSTRAINT IF EXISTS "vehicles_customer_tenant_fkey";

ALTER TABLE "vehicles"
  ADD CONSTRAINT "vehicles_customer_tenant_fkey"
  FOREIGN KEY ("business_id", "customer_id")
  REFERENCES "customers" ("business_id", "id")
  ON UPDATE CASCADE
  ON DELETE RESTRICT
  NOT VALID;

ALTER TABLE "fleets"
  ADD CONSTRAINT "fleets_customer_tenant_fkey"
  FOREIGN KEY ("business_id", "customer_id")
  REFERENCES "customers" ("business_id", "id")
  ON UPDATE CASCADE
  ON DELETE RESTRICT
  NOT VALID;

ALTER TABLE "fleet_vehicles"
  ADD CONSTRAINT "fleet_vehicles_fleet_tenant_fkey"
  FOREIGN KEY ("business_id", "fleet_id")
  REFERENCES "fleets" ("business_id", "id")
  ON UPDATE CASCADE
  ON DELETE RESTRICT
  NOT VALID;

ALTER TABLE "fleet_vehicles"
  ADD CONSTRAINT "fleet_vehicles_vehicle_tenant_fkey"
  FOREIGN KEY ("business_id", "vehicle_id")
  REFERENCES "vehicles" ("business_id", "id")
  ON UPDATE CASCADE
  ON DELETE RESTRICT
  NOT VALID;

ALTER TABLE "inventory_movements"
  ADD CONSTRAINT "inventory_movements_product_tenant_fkey"
  FOREIGN KEY ("business_id", "product_id")
  REFERENCES "products" ("business_id", "id")
  ON UPDATE CASCADE
  ON DELETE RESTRICT
  NOT VALID;

ALTER TABLE "vehicle_mileage_logs"
  ADD CONSTRAINT "vehicle_mileage_logs_vehicle_tenant_fkey"
  FOREIGN KEY ("business_id", "vehicle_id")
  REFERENCES "vehicles" ("business_id", "id")
  ON UPDATE CASCADE
  ON DELETE RESTRICT
  NOT VALID;
