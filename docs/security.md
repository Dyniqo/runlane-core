# Runlane Core Security

Runlane Core treats identity, workspace scope, webhook verification, connector IO, billing webhooks, demo mode and deployment boundaries as first-class security controls.

## Identity and session controls

Passwords are normalized at the request boundary and hashed with scrypt before persistence. Login issues short-lived access tokens and long-lived refresh tokens. Refresh tokens are persisted as hashes, rotated on refresh, and can be revoked through logout.

Access tokens carry the user, session and current workspace scope. Controllers do not accept `workspaceId` from user-provided request bodies as an authorization source.

## API keys

API keys are generated once and returned only during creation. The stored form is hashed. API responses expose only the stable prefix and metadata. Revoked keys cannot resolve workspace scope. Last-used timestamps are updated after successful guard resolution.

API-key endpoints are intended for external automation callers and are isolated from JWT-only user endpoints.

## Workspace isolation

Every workspace-owned operation must carry trusted workspace scope. Entity IDs are never globally actionable. Repository methods for workspace-owned data require `workspaceId` and filter by it.

Demo sessions resolve to isolated demo workspaces during login. After login, all endpoints use the issued JWT workspace scope. Demo callers do not send a trusted demo workspace identifier on later requests.

## Webhook security

Public webhook ingestion requires a signature using the configured webhook signing secret. The signature covers a timestamp and canonical payload hash. Timestamp tolerance blocks stale signed requests. Replay protection stores signed request markers in Redis for a bounded window. Idempotency keys are workspace-prefixed and prevent duplicate execution creation.

Webhook request persistence records source, payload hash, request status, user agent, client IP and workflow scope.

## Connector safety

HTTP connector execution is protected against unsafe outbound destinations:

```txt
localhost blocked
private IP ranges blocked
link-local ranges blocked
metadata endpoints blocked
URL credentials blocked
unsafe DNS results blocked
unsupported protocols blocked
redirect count bounded
response size bounded
hard timeout enforced
demo URL allowlist supported
```

Secrets and connector credentials are encrypted before persistence. Raw secret values are not returned from APIs, written to logs, stored in execution step input, or exposed in connector output.

## Billing webhook safety

Stripe webhook processing verifies provider signatures before parsing business state. Provider event IDs are persisted for idempotency. Duplicate events are ignored without reapplying subscription state. Subscription and customer identifiers are resolved through billing workspace records before plan state is changed.

## Demo safety

Public demo mode has an explicit toggle, public registration has an explicit toggle, and demo execution and AI call limits are configurable. Session-scoped demo workspaces prevent shared mutable data between browser sessions. Demo cleanup removes expired session workspaces through controlled repository paths.

## Deployment safety

The deployment Compose stack does not expose PostgreSQL or Redis ports publicly. API, Worker, Migrator, PostgreSQL, Redis and Caddy run on an internal Docker network. Caddy is the only public entry point and applies request body limits, security headers, compression and reverse proxy health checks.

Environment files must not contain shared secrets from another environment. Deployment secrets should be generated per installation and stored outside version control.

## Logging safety

Structured logs include request IDs, correlation IDs, runtime service name, status codes and durations. Secrets, API keys, bearer tokens, webhook signatures, connector credential values and provider keys must not be logged. Domain errors expose stable codes and safe details only.
