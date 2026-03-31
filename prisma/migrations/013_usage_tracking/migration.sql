CREATE TYPE "UsageMetricType" AS ENUM ('EXECUTION', 'AI_CALL', 'HTTP_CALL', 'WEBHOOK_REQUEST', 'RETRY');

CREATE TABLE "usage_records" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "type" "UsageMetricType" NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "source_type" VARCHAR(64) NOT NULL,
  "source_id" VARCHAR(160) NOT NULL,
  "metadata_json" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "usage_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "usage_records_workspace_id_type_source_type_source_id_key"
  ON "usage_records"("workspace_id", "type", "source_type", "source_id");

CREATE INDEX "usage_records_workspace_id_type_created_at_idx"
  ON "usage_records"("workspace_id", "type", "created_at");

CREATE INDEX "usage_records_workspace_id_created_at_id_idx"
  ON "usage_records"("workspace_id", "created_at", "id");

ALTER TABLE "usage_records"
  ADD CONSTRAINT "usage_records_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
