CREATE TABLE IF NOT EXISTS "_runlane_bootstrap_migrations" (
  migration_id text PRIMARY KEY,
  applied_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO "_runlane_bootstrap_migrations" (migration_id)
VALUES ('000001-runtime-foundation')
ON CONFLICT (migration_id) DO NOTHING;
