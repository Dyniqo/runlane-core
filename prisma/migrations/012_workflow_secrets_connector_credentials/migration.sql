CREATE TABLE "workflow_secrets" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "workflow_id" UUID NOT NULL,
    "key" VARCHAR(128) NOT NULL,
    "encrypted_value" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_secrets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "connector_credentials" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "workflow_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "type" VARCHAR(64) NOT NULL,
    "encrypted_value" TEXT NOT NULL,
    "metadata_json" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "connector_credentials_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "workflow_secrets_workspace_id_workflow_id_key_key" ON "workflow_secrets"("workspace_id", "workflow_id", "key");
CREATE INDEX "workflow_secrets_workspace_id_workflow_id_idx" ON "workflow_secrets"("workspace_id", "workflow_id");
CREATE INDEX "workflow_secrets_workspace_id_key_idx" ON "workflow_secrets"("workspace_id", "key");

CREATE UNIQUE INDEX "connector_credentials_workspace_id_workflow_id_name_key" ON "connector_credentials"("workspace_id", "workflow_id", "name");
CREATE INDEX "connector_credentials_workspace_id_workflow_id_idx" ON "connector_credentials"("workspace_id", "workflow_id");
CREATE INDEX "connector_credentials_workspace_id_type_created_at_idx" ON "connector_credentials"("workspace_id", "type", "created_at");

ALTER TABLE "workflow_secrets" ADD CONSTRAINT "workflow_secrets_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workflow_secrets" ADD CONSTRAINT "workflow_secrets_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "connector_credentials" ADD CONSTRAINT "connector_credentials_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "connector_credentials" ADD CONSTRAINT "connector_credentials_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;
