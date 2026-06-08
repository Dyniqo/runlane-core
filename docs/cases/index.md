# Case Study Index

Runlane Core includes five operational case studies. Each case maps a real backend problem to the modules, endpoints and validation commands that prove the behavior.

## AI Lead Routing

[AI Lead Routing](ai-lead-routing.md) shows the webhook-to-queue-to-worker path with an AI decision step and notification routing.

Primary proof points:

- Signed webhook ingestion
- Execution creation
- Queue processing
- AI decision output validation
- Notification connector behavior
- Usage and audit persistence

## Reliable Webhook Queue Worker

[Reliable Webhook Queue Worker](webhook-queue-worker.md) shows webhook reliability controls and background job processing.

Primary proof points:

- Signature verification
- Timestamp validation
- Replay protection
- Idempotency
- Retry and dead-letter behavior
- Manual retry with workspace scope

## Stripe Webhook Subscription Sync

[Stripe Webhook Subscription Sync](stripe-webhook-sync.md) shows billing webhook verification and subscription state synchronization.

Primary proof points:

- Stripe signature verification
- Provider event idempotency
- Billing event persistence
- Workspace billing state synchronization
- Billing audit records

## API Integration Backend

[API Integration Backend](api-integration-backend.md) shows safe outbound HTTP connector execution for external APIs.

Primary proof points:

- Secret injection at the connector boundary
- Authentication modes
- Timeout handling
- Redirect and response-size limits
- DNS and SSRF protections
- Retryable failure classification

## SaaS Backend Infrastructure

[SaaS Backend Infrastructure](saas-backend-infrastructure.md) shows the complete infrastructure slice for a workspace-scoped backend system.

Primary proof points:

- Auth and workspace scope
- API key access
- PostgreSQL persistence
- Redis/BullMQ execution
- Usage metering
- Audit logging
- Docker and image-based deployment
