import type { JsonObject } from '@runlane/contracts';
import { DEMO_WORKFLOW_PUBLIC_IDS } from '@runlane/domain';
import type { DemoWorkflowSeedInput } from '../../ports';

export function buildDemoWorkflowSeeds(): readonly DemoWorkflowSeedInput[] {
  return [
    {
      publicId: DEMO_WORKFLOW_PUBLIC_IDS.leadRouting,
      name: 'AI Lead Routing Demo',
      triggerType: 'webhook',
      definition: buildLeadRoutingWorkflowDefinition(),
    },
    {
      publicId: DEMO_WORKFLOW_PUBLIC_IDS.automationBridge,
      name: 'Automation Bridge Demo',
      triggerType: 'automation',
      definition: buildAutomationBridgeWorkflowDefinition(),
    },
  ];
}

function buildLeadRoutingWorkflowDefinition(): JsonObject {
  return {
    schemaVersion: 1,
    trigger: {
      type: 'webhook',
      config: {},
    },
    entryStepKey: 'qualify_lead',
    steps: [
      {
        key: 'qualify_lead',
        name: 'Qualify lead',
        type: 'ai_decision',
        timeoutMs: 30000,
        config: {
          messages: [
            {
              role: 'system',
              content:
                'Score the inbound lead for a service business. Return a branch value of qualified or nurture.',
            },
            {
              role: 'user',
              content:
                'Lead name: {{ payload.name }}. Email: {{ payload.email }}. Company: {{ payload.company }}. Message: {{ payload.message }}. Budget: {{ payload.budget }}.',
            },
          ],
          schema: {
            type: 'object',
            properties: {
              branch: {
                type: 'string',
                enum: ['qualified', 'nurture'],
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
            qualified: 'send_notification',
            nurture: 'store_nurture_payload',
          },
        },
      },
      {
        key: 'send_notification',
        name: 'Notify team',
        type: 'notification',
        timeoutMs: 10000,
        config: {
          provider: 'slack',
          title: 'Qualified lead received',
          message:
            'Qualified lead {{ payload.name }} from {{ payload.company }} scored {{ steps.qualify_lead.output.decision.score }}.',
          severity: 'info',
          includeExecutionContext: true,
          metadata: {
            email: '{{ payload.email }}',
            branch: '{{ steps.qualify_lead.output.branch }}',
            reason: '{{ steps.qualify_lead.output.decision.reason }}',
          },
        },
      },
      {
        key: 'store_nurture_payload',
        name: 'Store nurture payload',
        type: 'http',
        timeoutMs: 10000,
        config: {
          request: {
            method: 'POST',
            url: 'https://postman-echo.com/post',
            bodyType: 'json',
            headers: {
              'x-runlane-demo': 'lead-routing',
            },
            body: {
              email: '{{ payload.email }}',
              name: '{{ payload.name }}',
              branch: '{{ steps.qualify_lead.output.branch }}',
              reason: '{{ steps.qualify_lead.output.decision.reason }}',
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

function buildAutomationBridgeWorkflowDefinition(): JsonObject {
  return {
    schemaVersion: 1,
    trigger: {
      type: 'automation',
      config: {},
    },
    entryStepKey: 'normalize_payload',
    steps: [
      {
        key: 'normalize_payload',
        name: 'Normalize payload',
        type: 'condition',
        timeoutMs: 1000,
        config: {
          branch: 'accepted',
          pass: true,
        },
        transitions: {
          branches: {
            accepted: 'call_echo_api',
          },
        },
      },
      {
        key: 'call_echo_api',
        name: 'Call echo API',
        type: 'http',
        timeoutMs: 10000,
        config: {
          request: {
            method: 'POST',
            url: 'https://postman-echo.com/post',
            bodyType: 'json',
            headers: {
              'x-runlane-demo': 'automation-bridge',
            },
            body: {
              source: '{{ payload.source }}',
              event: '{{ payload.event }}',
              payload: '{{ payload.payload }}',
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
