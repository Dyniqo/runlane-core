import type { JsonObject } from '@runlane/contracts';
import { DEMO_WORKFLOW_PUBLIC_IDS } from '@runlane/domain';
import type { DemoWorkflowSeedInput } from '../../ports';

export function buildDemoWorkflowSeeds(): readonly DemoWorkflowSeedInput[] {
  return [
    {
      publicId: DEMO_WORKFLOW_PUBLIC_IDS.leadRouting,
      name: 'Lead intake and routing workflow',
      triggerType: 'automation',
      definition: buildLeadRoutingWorkflowDefinition(),
    },
    {
      publicId: DEMO_WORKFLOW_PUBLIC_IDS.webhookQueueWorker,
      name: 'Reliable webhook queue worker',
      triggerType: 'webhook',
      definition: buildWebhookQueueWorkerDefinition(),
    },
    {
      publicId: DEMO_WORKFLOW_PUBLIC_IDS.apiEnrichment,
      name: 'API enrichment and handoff workflow',
      triggerType: 'automation',
      definition: buildApiEnrichmentWorkflowDefinition(),
    },
    {
      publicId: DEMO_WORKFLOW_PUBLIC_IDS.retryFailureDrill,
      name: 'Controlled retry and failure workflow',
      triggerType: 'automation',
      definition: buildRetryFailureDrillWorkflowDefinition(),
    },
    {
      publicId: DEMO_WORKFLOW_PUBLIC_IDS.subscriptionSync,
      name: 'Subscription sync contract workflow',
      triggerType: 'webhook',
      definition: buildSubscriptionSyncWorkflowDefinition(),
    },
    {
      publicId: DEMO_WORKFLOW_PUBLIC_IDS.aiDecisionRouting,
      name: 'AI routing contract workflow',
      triggerType: 'automation',
      definition: buildAiDecisionRoutingWorkflowDefinition(),
    },
  ];
}

function buildLeadRoutingWorkflowDefinition(): JsonObject {
  return {
    schemaVersion: 1,
    trigger: {
      type: 'automation',
      config: {
        consolePayload: buildLeadRoutingPayload(),
      },
    },
    entryStepKey: 'validate_lead_payload',
    steps: [
      {
        key: 'validate_lead_payload',
        name: 'Validate lead payload',
        type: 'condition',
        timeoutMs: 1000,
        config: {
          branch: 'valid',
          pass: true,
        },
        transitions: {
          branches: {
            valid: 'classify_source',
          },
        },
      },
      {
        key: 'classify_source',
        name: 'Classify acquisition source',
        type: 'condition',
        timeoutMs: 1000,
        config: {
          branch: 'qualified',
          pass: true,
        },
        transitions: {
          branches: {
            qualified: 'create_lead_snapshot',
            nurture: 'create_nurture_snapshot',
          },
        },
      },
      {
        key: 'create_lead_snapshot',
        name: 'Create lead routing snapshot',
        type: 'http',
        timeoutMs: 15000,
        config: {
          request: {
            method: 'POST',
            url: 'https://postman-echo.com/post',
            bodyType: 'json',
            headers: {
              'x-runlane-demo': 'lead-routing-snapshot',
            },
            body: {
              name: '{{ payload.name }}',
              email: '{{ payload.email }}',
              company: '{{ payload.company }}',
              source: '{{ payload.source }}',
              requestId: '{{ payload.requestId }}',
              routingScore: '{{ payload.score }}',
            },
          },
          auth: {
            mode: 'none',
          },
          response: {
            successStatusCodes: [200],
            retryStatusCodes: [408, 429, 500, 502, 503, 504],
            includeHeaders: false,
            maxBodyBytes: 65536,
          },
        },
        transitions: {
          onSuccess: 'route_to_owner_queue',
        },
      },
      {
        key: 'create_nurture_snapshot',
        name: 'Create nurture snapshot',
        type: 'http',
        timeoutMs: 15000,
        config: {
          request: {
            method: 'POST',
            url: 'https://postman-echo.com/post',
            bodyType: 'json',
            headers: {
              'x-runlane-demo': 'lead-nurture-snapshot',
            },
            body: {
              name: '{{ payload.name }}',
              email: '{{ payload.email }}',
              company: '{{ payload.company }}',
              reason: 'lead_requires_follow_up',
              requestId: '{{ payload.requestId }}',
            },
          },
          auth: {
            mode: 'none',
          },
          response: {
            successStatusCodes: [200],
            retryStatusCodes: [408, 429, 500, 502, 503, 504],
            includeHeaders: false,
            maxBodyBytes: 65536,
          },
        },
        transitions: {
          onSuccess: 'write_routing_audit',
        },
      },
      {
        key: 'route_to_owner_queue',
        name: 'Route lead to owner queue',
        type: 'http',
        timeoutMs: 15000,
        config: {
          request: {
            method: 'POST',
            url: 'https://postman-echo.com/post',
            bodyType: 'json',
            headers: {
              'x-runlane-demo': 'lead-owner-routing',
            },
            body: {
              queue: 'sales-qualified',
              lead: '{{ payload.email }}',
              company: '{{ payload.company }}',
              snapshotStatus: '{{ steps.create_lead_snapshot.output.statusCode }}',
              owner: 'revenue-ops',
            },
          },
          auth: {
            mode: 'none',
          },
          response: {
            successStatusCodes: [200],
            retryStatusCodes: [408, 429, 500, 502, 503, 504],
            includeHeaders: false,
            maxBodyBytes: 65536,
          },
        },
        transitions: {
          onSuccess: 'write_routing_audit',
        },
      },
      {
        key: 'write_routing_audit',
        name: 'Write routing audit event',
        type: 'http',
        timeoutMs: 15000,
        config: {
          request: {
            method: 'POST',
            url: 'https://postman-echo.com/post',
            bodyType: 'json',
            headers: {
              'x-runlane-demo': 'routing-audit',
            },
            body: {
              workflow: 'lead-routing',
              lead: '{{ payload.email }}',
              requestId: '{{ payload.requestId }}',
              completedAt: '{{ payload.receivedAt }}',
            },
          },
          auth: {
            mode: 'none',
          },
          response: {
            successStatusCodes: [200],
            retryStatusCodes: [408, 429, 500, 502, 503, 504],
            includeHeaders: false,
            maxBodyBytes: 65536,
          },
        },
      },
    ],
  };
}

function buildWebhookQueueWorkerDefinition(): JsonObject {
  return {
    schemaVersion: 1,
    trigger: {
      type: 'webhook',
      config: {
        consolePayload: buildWebhookQueueWorkerPayload(),
      },
    },
    entryStepKey: 'accept_signed_webhook',
    steps: [
      {
        key: 'accept_signed_webhook',
        name: 'Accept signed webhook',
        type: 'condition',
        timeoutMs: 1000,
        config: {
          branch: 'accepted',
          pass: true,
        },
        transitions: {
          branches: {
            accepted: 'normalize_event_payload',
          },
        },
      },
      {
        key: 'normalize_event_payload',
        name: 'Normalize event payload',
        type: 'condition',
        timeoutMs: 1000,
        config: {
          branch: 'normalized',
          pass: true,
        },
        transitions: {
          branches: {
            normalized: 'persist_idempotency_window',
          },
        },
      },
      {
        key: 'persist_idempotency_window',
        name: 'Persist idempotency window',
        type: 'http',
        timeoutMs: 15000,
        config: {
          request: {
            method: 'POST',
            url: 'https://postman-echo.com/post',
            bodyType: 'json',
            headers: {
              'x-runlane-demo': 'webhook-idempotency',
            },
            body: {
              idempotencyKey: '{{ payload.idempotencyKey }}',
              externalId: '{{ payload.externalId }}',
              event: '{{ payload.event }}',
              receivedAt: '{{ payload.receivedAt }}',
            },
          },
          auth: {
            mode: 'none',
          },
          response: {
            successStatusCodes: [200],
            retryStatusCodes: [408, 429, 500, 502, 503, 504],
            includeHeaders: false,
            maxBodyBytes: 65536,
          },
        },
        transitions: {
          onSuccess: 'deliver_to_downstream_api',
        },
      },
      {
        key: 'deliver_to_downstream_api',
        name: 'Deliver to downstream API',
        type: 'http',
        timeoutMs: 15000,
        config: {
          request: {
            method: 'POST',
            url: 'https://postman-echo.com/post',
            bodyType: 'json',
            headers: {
              'x-runlane-demo': 'webhook-worker-delivery',
            },
            body: {
              event: '{{ payload.event }}',
              externalId: '{{ payload.externalId }}',
              accountId: '{{ payload.accountId }}',
              payload: '{{ payload }}',
            },
          },
          auth: {
            mode: 'none',
          },
          response: {
            successStatusCodes: [200],
            retryStatusCodes: [408, 429, 500, 502, 503, 504],
            includeHeaders: false,
            maxBodyBytes: 65536,
          },
        },
        transitions: {
          onSuccess: 'archive_delivery_snapshot',
        },
      },
      {
        key: 'archive_delivery_snapshot',
        name: 'Archive delivery snapshot',
        type: 'http',
        timeoutMs: 15000,
        config: {
          request: {
            method: 'POST',
            url: 'https://postman-echo.com/post',
            bodyType: 'json',
            headers: {
              'x-runlane-demo': 'webhook-delivery-archive',
            },
            body: {
              status: 'delivered',
              sourceEvent: '{{ payload.event }}',
              downstreamStatus: '{{ steps.deliver_to_downstream_api.output.statusCode }}',
              requestId: '{{ payload.requestId }}',
            },
          },
          auth: {
            mode: 'none',
          },
          response: {
            successStatusCodes: [200],
            retryStatusCodes: [408, 429, 500, 502, 503, 504],
            includeHeaders: false,
            maxBodyBytes: 65536,
          },
        },
      },
    ],
  };
}

function buildApiEnrichmentWorkflowDefinition(): JsonObject {
  return {
    schemaVersion: 1,
    trigger: {
      type: 'automation',
      config: {
        consolePayload: buildApiEnrichmentPayload(),
      },
    },
    entryStepKey: 'prepare_enrichment_request',
    steps: [
      {
        key: 'prepare_enrichment_request',
        name: 'Prepare enrichment request',
        type: 'condition',
        timeoutMs: 1000,
        config: {
          branch: 'ready',
          pass: true,
        },
        transitions: {
          branches: {
            ready: 'fetch_company_profile',
          },
        },
      },
      {
        key: 'fetch_company_profile',
        name: 'Fetch company profile',
        type: 'http',
        timeoutMs: 15000,
        config: {
          request: {
            method: 'POST',
            url: 'https://postman-echo.com/post',
            bodyType: 'json',
            headers: {
              'x-runlane-demo': 'company-profile-enrichment',
            },
            body: {
              companyDomain: '{{ payload.companyDomain }}',
              company: '{{ payload.company }}',
              requestId: '{{ payload.requestId }}',
            },
          },
          auth: {
            mode: 'none',
          },
          response: {
            successStatusCodes: [200],
            retryStatusCodes: [408, 429, 500, 502, 503, 504],
            includeHeaders: false,
            maxBodyBytes: 65536,
          },
        },
        transitions: {
          onSuccess: 'fetch_contact_profile',
        },
      },
      {
        key: 'fetch_contact_profile',
        name: 'Fetch contact profile',
        type: 'http',
        timeoutMs: 15000,
        config: {
          request: {
            method: 'POST',
            url: 'https://postman-echo.com/post',
            bodyType: 'json',
            headers: {
              'x-runlane-demo': 'contact-profile-enrichment',
            },
            body: {
              email: '{{ payload.email }}',
              name: '{{ payload.name }}',
              companyDomain: '{{ payload.companyDomain }}',
              requestId: '{{ payload.requestId }}',
            },
          },
          auth: {
            mode: 'none',
          },
          response: {
            successStatusCodes: [200],
            retryStatusCodes: [408, 429, 500, 502, 503, 504],
            includeHeaders: false,
            maxBodyBytes: 65536,
          },
        },
        transitions: {
          onSuccess: 'evaluate_enrichment_quality',
        },
      },
      {
        key: 'evaluate_enrichment_quality',
        name: 'Evaluate enrichment quality',
        type: 'condition',
        timeoutMs: 1000,
        config: {
          branch: 'accepted',
          pass: true,
        },
        transitions: {
          branches: {
            accepted: 'push_to_business_system',
            rejected: 'write_review_event',
          },
        },
      },
      {
        key: 'push_to_business_system',
        name: 'Push to business system',
        type: 'http',
        timeoutMs: 15000,
        config: {
          request: {
            method: 'POST',
            url: 'https://postman-echo.com/post',
            bodyType: 'json',
            headers: {
              'x-runlane-demo': 'business-system-sync',
            },
            body: {
              requestId: '{{ payload.requestId }}',
              enriched: true,
              companyStatus: '{{ steps.fetch_company_profile.output.statusCode }}',
              contactStatus: '{{ steps.fetch_contact_profile.output.statusCode }}',
              source: 'runlane',
            },
          },
          auth: {
            mode: 'none',
          },
          response: {
            successStatusCodes: [200],
            retryStatusCodes: [408, 429, 500, 502, 503, 504],
            includeHeaders: false,
            maxBodyBytes: 65536,
          },
        },
      },
      {
        key: 'write_review_event',
        name: 'Write review event',
        type: 'http',
        timeoutMs: 15000,
        config: {
          request: {
            method: 'POST',
            url: 'https://postman-echo.com/post',
            bodyType: 'json',
            headers: {
              'x-runlane-demo': 'enrichment-review',
            },
            body: {
              requestId: '{{ payload.requestId }}',
              reason: 'enrichment_requires_review',
              companyDomain: '{{ payload.companyDomain }}',
            },
          },
          auth: {
            mode: 'none',
          },
          response: {
            successStatusCodes: [200],
            retryStatusCodes: [408, 429, 500, 502, 503, 504],
            includeHeaders: false,
            maxBodyBytes: 65536,
          },
        },
      },
    ],
  };
}

function buildRetryFailureDrillWorkflowDefinition(): JsonObject {
  return {
    schemaVersion: 1,
    trigger: {
      type: 'automation',
      config: {
        consolePayload: buildRetryFailureDrillPayload(),
      },
    },
    entryStepKey: 'prepare_retry_probe',
    steps: [
      {
        key: 'prepare_retry_probe',
        name: 'Prepare retry probe',
        type: 'condition',
        timeoutMs: 1000,
        config: {
          branch: 'probe_ready',
          pass: true,
        },
        transitions: {
          branches: {
            probe_ready: 'write_retry_context',
          },
        },
      },
      {
        key: 'write_retry_context',
        name: 'Write retry context',
        type: 'http',
        timeoutMs: 15000,
        config: {
          request: {
            method: 'POST',
            url: 'https://postman-echo.com/post',
            bodyType: 'json',
            headers: {
              'x-runlane-demo': 'retry-context',
            },
            body: {
              requestId: '{{ payload.requestId }}',
              externalId: '{{ payload.externalId }}',
              failureMode: '{{ payload.failureMode }}',
              event: '{{ payload.event }}',
            },
          },
          auth: {
            mode: 'none',
          },
          response: {
            successStatusCodes: [200],
            retryStatusCodes: [408, 429, 500, 502, 503, 504],
            includeHeaders: false,
            maxBodyBytes: 65536,
          },
        },
        transitions: {
          onSuccess: 'classify_retry_probe',
        },
      },
      {
        key: 'classify_retry_probe',
        name: 'Classify retry probe',
        type: 'condition',
        timeoutMs: 1000,
        config: {
          branch: 'retryable',
          pass: true,
        },
        transitions: {
          branches: {
            retryable: 'call_unstable_downstream',
          },
        },
      },
      {
        key: 'call_unstable_downstream',
        name: 'Call unstable downstream',
        type: 'http',
        timeoutMs: 15000,
        config: {
          request: {
            method: 'POST',
            url: 'https://postman-echo.com/post',
            bodyType: 'json',
            headers: {
              'x-runlane-demo': 'controlled-retry-drill',
            },
            body: {
              requestId: '{{ payload.requestId }}',
              failureMode: '{{ payload.failureMode }}',
              expectedStatus: '{{ payload.expectedStatus }}',
              reason: 'controlled_retry_drill',
            },
          },
          auth: {
            mode: 'none',
          },
          response: {
            successStatusCodes: [202],
            retryStatusCodes: [200, 408, 429, 500, 502, 503, 504],
            includeHeaders: false,
            maxBodyBytes: 65536,
          },
        },
      },
    ],
  };
}

function buildSubscriptionSyncWorkflowDefinition(): JsonObject {
  return {
    schemaVersion: 1,
    trigger: {
      type: 'webhook',
      config: {
        consolePayload: buildSubscriptionSyncPayload(),
      },
    },
    entryStepKey: 'classify_billing_event',
    steps: [
      {
        key: 'classify_billing_event',
        name: 'Classify billing event',
        type: 'condition',
        timeoutMs: 1000,
        config: {
          branch: 'subscription_event',
          pass: true,
        },
        transitions: {
          branches: {
            subscription_event: 'persist_billing_event',
          },
        },
      },
      {
        key: 'persist_billing_event',
        name: 'Persist billing event',
        type: 'http',
        timeoutMs: 15000,
        config: {
          request: {
            method: 'POST',
            url: 'https://postman-echo.com/post',
            bodyType: 'json',
            headers: {
              'x-runlane-demo': 'billing-event-contract',
            },
            body: {
              provider: 'stripe',
              eventId: '{{ payload.id }}',
              eventType: '{{ payload.type }}',
              receivedAt: '{{ payload.receivedAt }}',
            },
          },
          auth: {
            mode: 'none',
          },
          response: {
            successStatusCodes: [200],
            retryStatusCodes: [408, 429, 500, 502, 503, 504],
            includeHeaders: false,
            maxBodyBytes: 65536,
          },
        },
        transitions: {
          onSuccess: 'sync_subscription_state',
        },
      },
      {
        key: 'sync_subscription_state',
        name: 'Sync subscription state',
        type: 'http',
        timeoutMs: 15000,
        config: {
          request: {
            method: 'POST',
            url: 'https://postman-echo.com/post',
            bodyType: 'json',
            headers: {
              'x-runlane-demo': 'subscription-state-sync',
            },
            body: {
              customerId: '{{ payload.data.object.customer }}',
              subscriptionId: '{{ payload.data.object.id }}',
              status: '{{ payload.data.object.status }}',
              plan: '{{ payload.data.object.plan }}',
            },
          },
          auth: {
            mode: 'none',
          },
          response: {
            successStatusCodes: [200],
            retryStatusCodes: [408, 429, 500, 502, 503, 504],
            includeHeaders: false,
            maxBodyBytes: 65536,
          },
        },
        transitions: {
          onSuccess: 'write_plan_audit',
        },
      },
      {
        key: 'write_plan_audit',
        name: 'Write plan audit event',
        type: 'http',
        timeoutMs: 15000,
        config: {
          request: {
            method: 'POST',
            url: 'https://postman-echo.com/post',
            bodyType: 'json',
            headers: {
              'x-runlane-demo': 'plan-audit',
            },
            body: {
              action: 'plan.synced',
              customerId: '{{ payload.data.object.customer }}',
              subscriptionId: '{{ payload.data.object.id }}',
              plan: '{{ payload.data.object.plan }}',
              sourceEvent: '{{ payload.id }}',
            },
          },
          auth: {
            mode: 'none',
          },
          response: {
            successStatusCodes: [200],
            retryStatusCodes: [408, 429, 500, 502, 503, 504],
            includeHeaders: false,
            maxBodyBytes: 65536,
          },
        },
      },
    ],
  };
}

function buildAiDecisionRoutingWorkflowDefinition(): JsonObject {
  return {
    schemaVersion: 1,
    trigger: {
      type: 'automation',
      config: {
        consolePayload: buildAiDecisionRoutingPayload(),
      },
    },
    entryStepKey: 'prepare_ai_contract',
    steps: [
      {
        key: 'prepare_ai_contract',
        name: 'Prepare AI routing contract',
        type: 'condition',
        timeoutMs: 1000,
        config: {
          branch: 'contract_ready',
          pass: true,
        },
        transitions: {
          branches: {
            contract_ready: 'record_ai_request_contract',
          },
        },
      },
      {
        key: 'record_ai_request_contract',
        name: 'Record AI request contract',
        type: 'http',
        timeoutMs: 15000,
        config: {
          request: {
            method: 'POST',
            url: 'https://postman-echo.com/post',
            bodyType: 'json',
            headers: {
              'x-runlane-demo': 'ai-routing-contract',
            },
            body: {
              requestId: '{{ payload.requestId }}',
              provider: '{{ payload.ai.provider }}',
              model: '{{ payload.ai.model }}',
              title: '{{ payload.title }}',
              urgency: '{{ payload.urgency }}',
              score: '{{ payload.score }}',
              expectedBranch: '{{ payload.ai.expectedBranch }}',
            },
          },
          auth: {
            mode: 'none',
          },
          response: {
            successStatusCodes: [200],
            retryStatusCodes: [408, 429, 500, 502, 503, 504],
            includeHeaders: false,
            maxBodyBytes: 65536,
          },
        },
        transitions: {
          onSuccess: 'classify_ai_result',
        },
      },
      {
        key: 'classify_ai_result',
        name: 'Classify AI routing result',
        type: 'condition',
        timeoutMs: 1000,
        config: {
          branch: 'priority',
          pass: true,
        },
        transitions: {
          branches: {
            priority: 'route_priority_request',
            standard: 'route_standard_request',
          },
        },
      },
      {
        key: 'route_priority_request',
        name: 'Route priority request',
        type: 'http',
        timeoutMs: 15000,
        config: {
          request: {
            method: 'POST',
            url: 'https://postman-echo.com/post',
            bodyType: 'json',
            headers: {
              'x-runlane-demo': 'priority-ai-routing-contract',
            },
            body: {
              queue: 'priority',
              score: '{{ payload.ai.score }}',
              reason: '{{ payload.ai.reason }}',
              requestId: '{{ payload.requestId }}',
            },
          },
          auth: {
            mode: 'none',
          },
          response: {
            successStatusCodes: [200],
            retryStatusCodes: [408, 429, 500, 502, 503, 504],
            includeHeaders: false,
            maxBodyBytes: 65536,
          },
        },
      },
      {
        key: 'route_standard_request',
        name: 'Route standard request',
        type: 'http',
        timeoutMs: 15000,
        config: {
          request: {
            method: 'POST',
            url: 'https://postman-echo.com/post',
            bodyType: 'json',
            headers: {
              'x-runlane-demo': 'standard-ai-routing-contract',
            },
            body: {
              queue: 'standard',
              score: '{{ payload.ai.score }}',
              reason: '{{ payload.ai.reason }}',
              requestId: '{{ payload.requestId }}',
            },
          },
          auth: {
            mode: 'none',
          },
          response: {
            successStatusCodes: [200],
            retryStatusCodes: [408, 429, 500, 502, 503, 504],
            includeHeaders: false,
            maxBodyBytes: 65536,
          },
        },
      },
    ],
  };
}

function buildLeadRoutingPayload(): JsonObject {
  return {
    name: 'Ava Morgan',
    email: 'ava.morgan@northstar.example',
    score: 86,
    source: 'console',
    company: 'Northstar Digital',
    companyDomain: 'northstar.example',
    title: 'Lifecycle automation request',
    urgency: 'high',
    notes: 'Inbound lead asks for webhook-based routing, queue retries and CRM handoff.',
    requestId: 'seed-lead-routing',
    receivedAt: 'runtime',
  };
}

function buildWebhookQueueWorkerPayload(): JsonObject {
  return {
    event: 'lead.created',
    externalId: 'crm-lead-seed',
    idempotencyKey: 'idem-seed-webhook-worker',
    accountId: 'acct_runlane_demo',
    source: 'console',
    name: 'Ava Morgan',
    email: 'ava.morgan@northstar.example',
    company: 'Northstar Digital',
    requestId: 'seed-webhook-worker',
    receivedAt: 'runtime',
  };
}

function buildApiEnrichmentPayload(): JsonObject {
  return {
    name: 'Ava Morgan',
    email: 'ava.morgan@northstar.example',
    source: 'console',
    company: 'Northstar Digital',
    companyDomain: 'northstar.example',
    title: 'Account enrichment request',
    urgency: 'standard',
    notes: 'Console run requests enrichment before routing the payload to a business system.',
    requestId: 'seed-api-enrichment',
    receivedAt: 'runtime',
  };
}

function buildRetryFailureDrillPayload(): JsonObject {
  return {
    source: 'console',
    event: 'downstream.delivery.retry_drill',
    externalId: 'retry-drill-seed',
    failureMode: 'retryable_status',
    expectedStatus: 202,
    requestId: 'seed-retry-drill',
    receivedAt: 'runtime',
  };
}

function buildSubscriptionSyncPayload(): JsonObject {
  return {
    id: 'evt_seed_subscription_updated',
    type: 'customer.subscription.updated',
    source: 'stripe',
    receivedAt: 'runtime',
    data: {
      object: {
        customer: 'cus_runlane_demo',
        id: 'sub_runlane_demo',
        status: 'active',
        plan: 'pro',
      },
    },
  };
}

function buildAiDecisionRoutingPayload(): JsonObject {
  return {
    name: 'Ava Morgan',
    email: 'ava.morgan@northstar.example',
    score: 91,
    source: 'console',
    company: 'Northstar Digital',
    companyDomain: 'northstar.example',
    title: 'AI workflow routing request',
    urgency: 'high',
    notes: 'The customer needs webhook intake, queue-backed execution and priority routing.',
    requestId: 'seed-ai-routing',
    receivedAt: 'runtime',
    ai: {
      provider: 'openai-compatible',
      model: 'configured-runtime-model',
      expectedBranch: 'priority',
      score: 91,
      reason: 'High-value workflow automation request with urgent routing needs.',
    },
  };
}
