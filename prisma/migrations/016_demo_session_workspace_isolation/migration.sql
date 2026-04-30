ALTER TABLE "workspaces" ADD COLUMN "demo_session_id" VARCHAR(64);

ALTER TABLE "sessions" ADD COLUMN "workspace_id" UUID;

CREATE TABLE "demo_sessions" (
    "id" UUID NOT NULL,
    "session_key_hash" VARCHAR(64) NOT NULL,
    "workspace_id" UUID NOT NULL,
    "ip_hash" VARCHAR(64),
    "user_agent_hash" VARCHAR(64),
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "demo_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "demo_sessions_session_key_hash_key" ON "demo_sessions"("session_key_hash");

CREATE UNIQUE INDEX "demo_sessions_workspace_id_key" ON "demo_sessions"("workspace_id");

CREATE INDEX "demo_sessions_workspace_id_idx" ON "demo_sessions"("workspace_id");

CREATE INDEX "demo_sessions_expires_at_idx" ON "demo_sessions"("expires_at");

CREATE INDEX "demo_sessions_ip_hash_created_at_idx" ON "demo_sessions"("ip_hash", "created_at");

CREATE INDEX "workspaces_owner_id_is_demo_demo_session_id_idx" ON "workspaces"("owner_id", "is_demo", "demo_session_id");

CREATE INDEX "workspaces_demo_session_id_idx" ON "workspaces"("demo_session_id");

CREATE INDEX "sessions_workspace_id_created_at_idx" ON "sessions"("workspace_id", "created_at");

ALTER TABLE "sessions" ADD CONSTRAINT "sessions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "demo_sessions" ADD CONSTRAINT "demo_sessions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
