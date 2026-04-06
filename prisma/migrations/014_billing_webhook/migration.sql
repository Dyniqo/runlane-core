CREATE TYPE "BillingProvider" AS ENUM ('STRIPE');
CREATE TYPE "BillingEventStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'IGNORED', 'FAILED');
CREATE TYPE "BillingStatus" AS ENUM ('NONE', 'TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'UNPAID', 'INCOMPLETE', 'INCOMPLETE_EXPIRED', 'PAUSED');

ALTER TABLE "workspaces"
  ADD COLUMN "stripe_customer_id" VARCHAR(255),
  ADD COLUMN "stripe_subscription_id" VARCHAR(255),
  ADD COLUMN "billing_status" "BillingStatus" NOT NULL DEFAULT 'NONE',
  ADD COLUMN "billing_current_period_start" TIMESTAMPTZ(3),
  ADD COLUMN "billing_current_period_end" TIMESTAMPTZ(3);

CREATE INDEX "workspaces_stripe_customer_id_idx" ON "workspaces"("stripe_customer_id");
CREATE INDEX "workspaces_stripe_subscription_id_idx" ON "workspaces"("stripe_subscription_id");

CREATE TABLE "billing_events" (
  "id" UUID NOT NULL,
  "workspace_id" UUID,
  "provider" "BillingProvider" NOT NULL,
  "provider_event_id" VARCHAR(255) NOT NULL,
  "event_type" VARCHAR(120) NOT NULL,
  "status" "BillingEventStatus" NOT NULL DEFAULT 'RECEIVED',
  "payload_json" JSONB NOT NULL,
  "error_message" TEXT,
  "received_at" TIMESTAMPTZ(3) NOT NULL,
  "processed_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "billing_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "billing_events_provider_provider_event_id_key" ON "billing_events"("provider", "provider_event_id");
CREATE INDEX "billing_events_workspace_id_received_at_idx" ON "billing_events"("workspace_id", "received_at");
CREATE INDEX "billing_events_provider_status_received_at_idx" ON "billing_events"("provider", "status", "received_at");

ALTER TABLE "billing_events"
  ADD CONSTRAINT "billing_events_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;
