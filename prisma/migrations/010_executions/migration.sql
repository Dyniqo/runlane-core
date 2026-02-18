CREATE TYPE "ExecutionStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'RETRYING', 'DEAD_LETTER', 'CANCELLED');

CREATE TABLE "executions" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "workflow_id" UUID NOT NULL,
  "status" "ExecutionStatus" NOT NULL DEFAULT 'QUEUED',
  "input_json" JSONB NOT NULL,
  "output_json" JSONB,
  "error_code" VARCHAR(96),
  "error_message" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "duration_ms" INTEGER,
  "queued_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "started_at" TIMESTAMPTZ(3),
  "finished_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "executions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "executions_workspace_id_id_idx" ON "executions"("workspace_id", "id");
CREATE INDEX "executions_workspace_id_workflow_id_idx" ON "executions"("workspace_id", "workflow_id");
CREATE INDEX "executions_workspace_id_status_created_at_idx" ON "executions"("workspace_id", "status", "created_at");
CREATE INDEX "executions_workflow_id_created_at_idx" ON "executions"("workflow_id", "created_at");

ALTER TABLE "executions" ADD CONSTRAINT "executions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "executions" ADD CONSTRAINT "executions_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;
