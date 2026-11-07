-- Refresh sessions: hash-only storage + rotation family for rotation / reuse detection.
CREATE TABLE "auth_refresh_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "active_business_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "replaced_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "auth_refresh_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "auth_refresh_sessions_token_hash_key" ON "auth_refresh_sessions"("token_hash");
CREATE INDEX "auth_refresh_sessions_user_id_idx" ON "auth_refresh_sessions"("user_id");
CREATE INDEX "auth_refresh_sessions_family_id_idx" ON "auth_refresh_sessions"("family_id");
CREATE INDEX "auth_refresh_sessions_expires_at_idx" ON "auth_refresh_sessions"("expires_at");

ALTER TABLE "auth_refresh_sessions"
  ADD CONSTRAINT "auth_refresh_sessions_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
