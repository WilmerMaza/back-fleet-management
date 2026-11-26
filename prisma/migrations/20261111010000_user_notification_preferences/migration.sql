-- Preferencias personales de notificación por usuario.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "notification_preferences" JSONB;
