CREATE TYPE "WebhookRequestStatus" AS ENUM ('ACCEPTED', 'REJECTED');

CREATE TABLE "webhook_requests" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "workflow_id" UUID NOT NULL,
  "signature" VARCHAR(512),
  "idempotency_key" VARCHAR(160),
  "payload_hash" VARCHAR(64) NOT NULL,
  "source" VARCHAR(80) NOT NULL,
  "ip" VARCHAR(64),
  "user_agent" VARCHAR(512),
  "status" "WebhookRequestStatus" NOT NULL DEFAULT 'ACCEPTED',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "webhook_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "webhook_requests_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "webhook_requests_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "webhook_requests_workspace_id_id_idx" ON "webhook_requests"("workspace_id", "id");
CREATE INDEX "webhook_requests_workspace_id_workflow_id_created_at_idx" ON "webhook_requests"("workspace_id", "workflow_id", "created_at");
CREATE INDEX "webhook_requests_workspace_id_idempotency_key_idx" ON "webhook_requests"("workspace_id", "idempotency_key");
CREATE INDEX "webhook_requests_workflow_id_created_at_idx" ON "webhook_requests"("workflow_id", "created_at");
