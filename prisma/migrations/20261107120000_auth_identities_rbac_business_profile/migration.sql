-- Auth identities, RBAC tables, business profile, platform role, nullable password.

CREATE TYPE "BusinessStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'REJECTED');
CREATE TYPE "PlatformRole" AS ENUM ('SUPER_ADMIN');
CREATE TYPE "AuthProvider" AS ENUM ('GOOGLE', 'LOCAL');

ALTER TABLE "businesses"
  ADD COLUMN "legal_name" TEXT,
  ADD COLUMN "tax_id" VARCHAR(32),
  ADD COLUMN "email" TEXT,
  ADD COLUMN "phone" VARCHAR(40),
  ADD COLUMN "address" TEXT,
  ADD COLUMN "status" "BusinessStatus" NOT NULL DEFAULT 'ACTIVE';

CREATE UNIQUE INDEX "businesses_tax_id_key" ON "businesses"("tax_id");

ALTER TABLE "users"
  ALTER COLUMN "password_hash" DROP NOT NULL,
  ADD COLUMN "platform_role" "PlatformRole";

ALTER TABLE "auth_refresh_sessions"
  ALTER COLUMN "active_business_id" DROP NOT NULL;

CREATE TABLE "auth_identities" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "provider" "AuthProvider" NOT NULL,
  "provider_user_id" VARCHAR(255) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "auth_identities_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "auth_identities_provider_provider_user_id_key"
  ON "auth_identities"("provider", "provider_user_id");
CREATE INDEX "auth_identities_user_id_idx" ON "auth_identities"("user_id");

ALTER TABLE "auth_identities"
  ADD CONSTRAINT "auth_identities_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "permissions" (
  "id" UUID NOT NULL,
  "code" VARCHAR(80) NOT NULL,
  "description" VARCHAR(255) NOT NULL,
  "module" VARCHAR(60) NOT NULL,
  CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");

CREATE TABLE "roles" (
  "id" UUID NOT NULL,
  "business_id" UUID,
  "code" VARCHAR(60) NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "description" VARCHAR(255),
  "is_system" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "roles_business_id_idx" ON "roles"("business_id");
CREATE UNIQUE INDEX "roles_platform_code_uidx" ON "roles"("code") WHERE "business_id" IS NULL;
CREATE UNIQUE INDEX "roles_business_code_uidx" ON "roles"("business_id", "code") WHERE "business_id" IS NOT NULL;

ALTER TABLE "roles"
  ADD CONSTRAINT "roles_business_id_fkey"
  FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "role_permissions" (
  "role_id" UUID NOT NULL,
  "permission_id" UUID NOT NULL,
  CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id", "permission_id")
);

ALTER TABLE "role_permissions"
  ADD CONSTRAINT "role_permissions_role_id_fkey"
  FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "role_permissions"
  ADD CONSTRAINT "role_permissions_permission_id_fkey"
  FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
