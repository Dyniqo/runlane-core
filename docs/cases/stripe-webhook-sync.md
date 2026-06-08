# Stripe Webhook Subscription Sync

## Problem

Billing state can drift when webhook handlers are not idempotent or when subscription changes are not persisted consistently with workspace plan state.

## Runlane flow

```txt
Stripe event
  -> signature verification
  -> billing event persistence
  -> duplicate detection
  -> customer or subscription resolution
  -> workspace billing state update
  -> audit record
  -> plan enforcement uses updated state
```

## Relevant modules

```txt
billing
workspace
usage
audit
config
security
```

## Demo command

```powershell
pnpm validate:billing
pnpm validate:billing-sessions
```

The billing validation verifies webhook signature handling, event idempotency, subscription mapping and workspace billing state updates. The session validation checks checkout and portal contract generation without requiring a browser flow.

## API endpoints

```txt
POST /v1/billing/webhook
POST /v1/billing/checkout
POST /v1/billing/portal
GET  /v1/usage/current
GET  /v1/audit-logs
```

## Operational value

This case demonstrates reliable billing ingestion, duplicate-safe provider events, plan mapping, failed payment handling and workspace-scoped subscription state.
