# Operational Scenario Index

Runlane Core includes five operational scenarios. Each scenario maps a backend problem to the modules, endpoints and validation commands that exercise the behavior.

## AI Lead Routing

[AI Lead Routing](ai-lead-routing.md) covers the webhook-to-queue-to-worker path with an AI decision step and notification routing.

What this covers:

- Signed webhook ingestion
- Execution creation
- Queue processing
- AI decision output validation
- Notification connector behavior
- Usage and audit persistence

## Reliable Webhook Queue Worker

[Reliable Webhook Queue Worker](webhook-queue-worker.md) covers webhook reliability controls and background job processing.

What this covers:

- Signature verification
- Timestamp validation
- Replay protection
- Idempotency
- Retry and dead-letter behavior
- Manual retry with workspace scope

## Stripe Webhook Subscription Sync

[Stripe Webhook Subscription Sync](stripe-webhook-sync.md) covers billing webhook verification and subscription state synchronization.

What this covers:

- Stripe signature verification
- Provider event idempotency
- Billing event persistence
- Workspace billing state synchronization
- Billing audit records

## API Integration Backend

[API Integration Backend](api-integration-backend.md) covers safe outbound HTTP connector execution for external APIs.

What this covers:

- Secret injection at the connector boundary
- Authentication modes
- Timeout handling
- Redirect and response-size limits
- DNS and SSRF protections
- Retryable failure classification

## SaaS Backend Infrastructure

[SaaS Backend Infrastructure](saas-backend-infrastructure.md) covers the infrastructure slice for a workspace-scoped backend system.

What this covers:

- Auth and workspace scope
- API key access
- PostgreSQL persistence
- Redis/BullMQ execution
- Usage metering
- Audit logging
- Docker and image-based deployment
