ALTER TABLE "workflows" ADD COLUMN "public_id" VARCHAR(40);

UPDATE "workflows"
SET "public_id" = 'wf_' || lower(replace("id"::text, '-', ''));

ALTER TABLE "workflows" ALTER COLUMN "public_id" SET NOT NULL;

CREATE UNIQUE INDEX "workflows_public_id_key" ON "workflows"("public_id");
CREATE INDEX "workflows_workspace_id_public_id_idx" ON "workflows"("workspace_id", "public_id");
