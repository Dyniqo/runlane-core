CREATE TYPE "ExecutionStepStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED');

CREATE TABLE "execution_steps" (
  "id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "execution_id" UUID NOT NULL,
  "step_key" VARCHAR(80) NOT NULL,
  "type" VARCHAR(64) NOT NULL,
  "status" "ExecutionStepStatus" NOT NULL DEFAULT 'RUNNING',
  "input_json" JSONB NOT NULL,
  "output_json" JSONB,
  "error_code" VARCHAR(96),
  "error_message" TEXT,
  "duration_ms" INTEGER,
  "started_at" TIMESTAMPTZ(3) NOT NULL,
  "finished_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "execution_steps_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "execution_steps_workspace_id_execution_id_step_key_key" ON "execution_steps"("workspace_id", "execution_id", "step_key");
CREATE INDEX "execution_steps_workspace_id_execution_id_idx" ON "execution_steps"("workspace_id", "execution_id");
CREATE INDEX "execution_steps_workspace_id_status_started_at_idx" ON "execution_steps"("workspace_id", "status", "started_at");
CREATE INDEX "execution_steps_execution_id_started_at_idx" ON "execution_steps"("execution_id", "started_at");

ALTER TABLE "execution_steps" ADD CONSTRAINT "execution_steps_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "execution_steps" ADD CONSTRAINT "execution_steps_execution_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "executions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
