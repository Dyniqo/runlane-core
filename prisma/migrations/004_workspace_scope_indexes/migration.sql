CREATE INDEX IF NOT EXISTS "workspaces_id_owner_id_idx" ON "workspaces"("id", "owner_id");
CREATE INDEX IF NOT EXISTS "workspace_members_user_id_workspace_id_role_idx" ON "workspace_members"("user_id", "workspace_id", "role");

