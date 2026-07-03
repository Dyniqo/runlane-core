import type { JsonObject } from '@runlane/contracts';
import { DEMO_WORKFLOW_PUBLIC_IDS } from '@runlane/domain';
import type { DemoWorkflowSeedInput } from '../../ports';

export function buildDemoWorkflowSeeds(): readonly DemoWorkflowSeedInput[] {
  return [
    {
      publicId: DEMO_WORKFLOW_PUBLIC_IDS.leadRouting,
      name: 'Lead routing workflow',
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
      publicId: DEMO_WORKFLOW_PUBLIC_IDS.subscriptionSync,
      name: 'Stripe subscription sync workflow',
      triggerType: 'webhook',
      definition: buildSubscriptionSyncWorkflowDefinition(),
    },
    {
      publicId: DEMO_WORKFLOW_PUBLIC_IDS.apiEnrichment,
      name: 'API integration enrichment workflow',
      triggerType: 'automation',
      definition: buildApiEnrichmentWorkflowDefinition(),
    },
    {
      publicId: DEMO_WORKFLOW_PUBLIC_IDS.aiDecisionRouting,
      name: 'AI decision routing workflow',
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
    entryStepKey: 'validate_payload',
    steps: [
      {
        key: 'validate_payload',
        name: 'Validate lead payload',
        type: 'condition',
        timeoutMs: 1000,
        config: {
          branch: 'valid',
          pass: true,
        },
        transitions: {
          branches: {
            valid: 'enrich_lead',
          },
        },
      },
      {
        key: 'enrich_lead',
        name: 'Enrich lead profile',
        type: 'http',
        timeoutMs: 15000,
        config: {
          request: {
            method: 'POST',
            url: 'https://postman-echo.com/post',
            bodyType: 'json',
            headers: {
              'x-runlane-demo': 'lead-enrichment',
            },
            body: {
              email: '{{ payload.email }}',
              company: '{{ payload.company }}',
              source: '{{ payload.source }}',
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
          onSuccess: 'segment_lead',
        },
      },
      {
        key: 'segment_lead',
        name: 'Segment by buying intent',
        type: 'condition',
        timeoutMs: 1000,
        config: {
          branch: 'qualified',
          pass: true,
        },
        transitions: {
          branches: {
            qualified: 'route_to_sales',
            nurture: 'send_nurture_event',
          },
        },
      },
      {
        key: 'route_to_sales',
        name: 'Route to sales pipeline',
        type: 'http',
        timeoutMs: 15000,
        config: {
          request: {
            method: 'POST',
            url: 'https://postman-echo.com/post',
            bodyType: 'json',
            headers: {
              'x-runlane-demo': 'sales-routing',
            },
            body: {
              route: 'sales',
              lead: '{{ payload.name }}',
              email: '{{ payload.email }}',
              company: '{{ payload.company }}',
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
        key: 'send_nurture_event',
        name: 'Send nurture event',
        type: 'http',
        timeoutMs: 15000,
        config: {
          request: {
            method: 'POST',
            url: 'https://postman-echo.com/post',
            bodyType: 'json',
            headers: {
              'x-runlane-demo': 'nurture-routing',
            },
            body: {
              route: 'nurture',
              lead: '{{ payload.name }}',
              email: '{{ payload.email }}',
              reason: 'Lead requires additional qualification',
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
    entryStepKey: 'accept_webhook',
    steps: [
      {
        key: 'accept_webhook',
        name: 'Accept signed webhook',
        type: 'condition',
        timeoutMs: 1000,
        config: {
          branch: 'accepted',
          pass: true,
        },
        transitions: {
          branches: {
            accepted: 'normalize_event',
          },
        },
      },
      {
        key: 'normalize_event',
        name: 'Normalize event payload',
        type: 'condition',
        timeoutMs: 1000,
        config: {
          branch: 'normalized',
          pass: true,
        },
        transitions: {
          branches: {
            normalized: 'deliver_to_downstream_api',
          },
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
              'x-runlane-demo': 'webhook-worker',
            },
            body: {
              event: '{{ payload.event }}',
              externalId: '{{ payload.externalId }}',
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
              'x-runlane-demo': 'webhook-archive',
            },
            body: {
              status: 'delivered',
              sourceEvent: '{{ payload.event }}',
              downstream: '{{ steps.deliver_to_downstream_api.output.statusCode }}',
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
              'x-runlane-demo': 'billing-event',
            },
            body: {
              provider: 'stripe',
              eventId: '{{ payload.id }}',
              eventType: '{{ payload.type }}',
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
              'x-runlane-demo': 'subscription-sync',
            },
            body: {
              customerId: '{{ payload.data.object.customer }}',
              subscriptionId: '{{ payload.data.object.id }}',
              status: '{{ payload.data.object.status }}',
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
              plan: 'pro',
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
            ready: 'call_enrichment_api',
          },
        },
      },
      {
        key: 'call_enrichment_api',
        name: 'Call enrichment API',
        type: 'http',
        timeoutMs: 15000,
        config: {
          request: {
            method: 'POST',
            url: 'https://postman-echo.com/post',
            bodyType: 'json',
            headers: {
              'x-runlane-demo': 'api-enrichment',
            },
            body: {
              companyDomain: '{{ payload.companyDomain }}',
              contactEmail: '{{ payload.email }}',
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
          onSuccess: 'route_enriched_payload',
        },
      },
      {
        key: 'route_enriched_payload',
        name: 'Route enriched payload',
        type: 'condition',
        timeoutMs: 1000,
        config: {
          branch: 'accepted',
          pass: true,
        },
        transitions: {
          branches: {
            accepted: 'push_to_business_system',
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
    entryStepKey: 'score_request',
    steps: [
      {
        key: 'score_request',
        name: 'Score request with AI',
        type: 'ai_decision',
        timeoutMs: 30000,
        config: {
          messages: [
            {
              role: 'system',
              content:
                'Score an automation request and return a branch value of priority or standard.',
            },
            {
              role: 'user',
              content:
                'Request title: {{ payload.title }}. Company: {{ payload.company }}. Urgency: {{ payload.urgency }}. Notes: {{ payload.notes }}.',
            },
          ],
          schema: {
            type: 'object',
            properties: {
              branch: {
                type: 'string',
                enum: ['priority', 'standard'],
              },
              score: {
                type: 'integer',
                minimum: 0,
                maximum: 100,
              },
              reason: {
                type: 'string',
                maxLength: 500,
              },
            },
            required: ['branch', 'score', 'reason'],
            additionalProperties: false,
          },
          branchPath: 'branch',
          maxOutputTokens: 400,
          temperature: 0.1,
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
              'x-runlane-demo': 'priority-ai-routing',
            },
            body: {
              queue: 'priority',
              score: '{{ steps.score_request.output.decision.score }}',
              reason: '{{ steps.score_request.output.decision.reason }}',
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
              'x-runlane-demo': 'standard-ai-routing',
            },
            body: {
              queue: 'standard',
              score: '{{ steps.score_request.output.decision.score }}',
              reason: '{{ steps.score_request.output.decision.reason }}',
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
  };
}

function buildWebhookQueueWorkerPayload(): JsonObject {
  return {
    event: 'lead.created',
    externalId: 'crm-lead-1042',
    source: 'console',
    name: 'Ava Morgan',
    email: 'ava.morgan@northstar.example',
    company: 'Northstar Digital',
  };
}

function buildSubscriptionSyncPayload(): JsonObject {
  return {
    type: 'customer.subscription.updated',
    source: 'stripe',
    data: {
      object: {
        customer: 'cus_runlane_demo',
        id: 'sub_runlane_demo',
        status: 'active',
      },
    },
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
  };
}
