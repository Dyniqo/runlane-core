CREATE TABLE "demo_states" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "seed_version" VARCHAR(80) NOT NULL,
    "reset_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "demo_states_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "demo_states_workspace_id_key" ON "demo_states"("workspace_id");

CREATE INDEX "demo_states_reset_at_idx" ON "demo_states"("reset_at");

CREATE INDEX "workspaces_is_demo_created_at_idx" ON "workspaces"("is_demo", "created_at");

ALTER TABLE "demo_states" ADD CONSTRAINT "demo_states_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
