-- Invitaciones a empresas (token hasheado).

CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED');

CREATE TABLE "invitations" (
  "id" UUID NOT NULL,
  "business_id" UUID NOT NULL,
  "email" VARCHAR(255) NOT NULL,
  "role_code" VARCHAR(60) NOT NULL,
  "token_hash" VARCHAR(64) NOT NULL,
  "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "invited_by_id" UUID NOT NULL,
  "accepted_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "invitations_token_hash_key" ON "invitations"("token_hash");
CREATE INDEX "invitations_business_id_status_idx" ON "invitations"("business_id", "status");
CREATE INDEX "invitations_email_idx" ON "invitations"("email");

ALTER TABLE "invitations"
  ADD CONSTRAINT "invitations_business_id_fkey"
  FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "invitations"
  ADD CONSTRAINT "invitations_invited_by_id_fkey"
  FOREIGN KEY ("invited_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
