-- Recepciones de compra (inventario). Sin costos ni facturación.
CREATE TABLE "purchase_receipts" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "supplier_name" VARCHAR(180) NOT NULL,
    "document_ref" VARCHAR(80),
    "received_at" TIMESTAMPTZ(6) NOT NULL,
    "notes" VARCHAR(500),
    "operation_key" VARCHAR(180),
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_receipts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "purchase_receipt_lines" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "receipt_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unit" VARCHAR(30) NOT NULL,
    "movement_id" UUID,

    CONSTRAINT "purchase_receipt_lines_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "purchase_receipts_business_id_id_key" ON "purchase_receipts"("business_id", "id");
CREATE UNIQUE INDEX "purchase_receipts_business_id_operation_key_key" ON "purchase_receipts"("business_id", "operation_key");
CREATE INDEX "purchase_receipts_business_id_received_at_idx" ON "purchase_receipts"("business_id", "received_at" DESC);

CREATE UNIQUE INDEX "purchase_receipt_lines_business_id_id_key" ON "purchase_receipt_lines"("business_id", "id");
CREATE INDEX "purchase_receipt_lines_business_id_receipt_id_idx" ON "purchase_receipt_lines"("business_id", "receipt_id");

ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "purchase_receipt_lines" ADD CONSTRAINT "purchase_receipt_lines_business_id_receipt_id_fkey" FOREIGN KEY ("business_id", "receipt_id") REFERENCES "purchase_receipts"("business_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
