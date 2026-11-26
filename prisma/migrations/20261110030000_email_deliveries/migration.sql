-- CreateEnum
CREATE TYPE "EmailDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "EmailNotificationType" AS ENUM ('BUSINESS_INVITATION');

-- CreateTable
CREATE TABLE "email_deliveries" (
    "id" UUID NOT NULL,
    "notification_type" "EmailNotificationType" NOT NULL,
    "recipient" VARCHAR(255) NOT NULL,
    "subject" VARCHAR(255) NOT NULL,
    "status" "EmailDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "provider" VARCHAR(40) NOT NULL,
    "provider_message_id" VARCHAR(120),
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "last_error" VARCHAR(500),
    "related_entity_type" VARCHAR(50),
    "related_entity_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "email_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "email_deliveries_recipient_idx" ON "email_deliveries"("recipient");

-- CreateIndex
CREATE INDEX "email_deliveries_related_entity_type_related_entity_id_idx" ON "email_deliveries"("related_entity_type", "related_entity_id");

-- CreateIndex
CREATE INDEX "email_deliveries_status_created_at_idx" ON "email_deliveries"("status", "created_at" DESC);
