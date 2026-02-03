CREATE TYPE "WorkflowStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

CREATE TABLE "workflows" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "name" VARCHAR(140) NOT NULL,
    "status" "WorkflowStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "definition_json" JSONB NOT NULL DEFAULT '{}',
    "trigger_type" VARCHAR(64) NOT NULL DEFAULT 'webhook',
    "published_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "workflows_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "workflows_workspace_id_id_idx" ON "workflows"("workspace_id", "id");
CREATE INDEX "workflows_workspace_id_status_updated_at_idx" ON "workflows"("workspace_id", "status", "updated_at");
CREATE INDEX "workflows_workspace_id_created_at_id_idx" ON "workflows"("workspace_id", "created_at", "id");

ALTER TABLE "workflows" ADD CONSTRAINT "workflows_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
