-- Preparación FE: identidad/ubicación opcionales del cliente (sin reglas DIAN).
ALTER TABLE "customers" ADD COLUMN "verification_digit" VARCHAR(2);
ALTER TABLE "customers" ADD COLUMN "municipality" VARCHAR(120);
ALTER TABLE "customers" ADD COLUMN "department" VARCHAR(120);
