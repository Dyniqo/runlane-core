import type { ReactElement } from 'react';
import type { AppState } from '../types';
import { titleCase } from '../lib/format';
import { Button, Card, PanelHeader } from '../components/ui';

type PlanTone = 'blue' | 'green' | 'violet' | 'amber';

type PlanModel = {
  readonly id: string;
  readonly name: string;
  readonly price: string;
  readonly summary: string;
  readonly tone: PlanTone;
  readonly limits: readonly { readonly label: string; readonly value: string }[];
  readonly features: readonly string[];
};

type CapabilityModel = {
  readonly title: string;
  readonly summary: string;
  readonly items: readonly string[];
};

const plans: readonly PlanModel[] = [
  {
    id: 'free',
    name: 'Free',
    price: '$0',
    summary: 'A focused workspace for evaluation and small automation checks.',
    tone: 'blue',
    limits: [
      { label: 'Workflows', value: '2' },
      { label: 'Executions', value: '100/mo' },
      { label: 'AI decisions', value: '10/mo' },
    ],
    features: ['Session workspace', 'Manual retry', 'API keys', 'Seven-day activity view'],
  },
  {
    id: 'starter',
    name: 'Starter',
    price: '$19',
    summary: 'Reliable workflow operations for an active workspace.',
    tone: 'green',
    limits: [
      { label: 'Workflows', value: '10' },
      { label: 'Executions', value: '5k/mo' },
      { label: 'AI decisions', value: '500/mo' },
    ],
    features: [
      'Connector credentials',
      'Webhook processing',
      'Manual retry',
      'Thirty-day activity retention',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$49',
    summary: 'Higher limits for teams with active API integrations and queues.',
    tone: 'violet',
    limits: [
      { label: 'Workflows', value: '50' },
      { label: 'Executions', value: '50k/mo' },
      { label: 'AI decisions', value: '5k/mo' },
    ],
    features: [
      'Priority queue profile',
      'Advanced retry window',
      'Ninety-day activity retention',
      'Team-ready workspace structure',
    ],
  },
  {
    id: 'agency',
    name: 'Agency',
    price: '$149',
    summary: 'Expanded capacity for client-facing automation workspaces.',
    tone: 'amber',
    limits: [
      { label: 'Workflows', value: 'Custom' },
      { label: 'Executions', value: 'Custom' },
      { label: 'AI decisions', value: 'Custom' },
    ],
    features: [
      'Client workspace isolation',
      'Custom usage limits',
      'Exportable audit logs',
      'Expanded rate limits',
    ],
  },
];

const capabilityMap: readonly CapabilityModel[] = [
  {
    title: 'Secure intake',
    summary: 'Request acceptance, replay control, and payload boundaries.',
    items: ['Signed webhook endpoint', 'Replay protection', 'Idempotency guard', 'Payload limits'],
  },
  {
    title: 'Execution engine',
    summary: 'Queue-backed workflow runs with retry visibility.',
    items: ['Queue-backed runs', 'Step duration tracking', 'Retry rules', 'Dead-letter handling'],
  },
  {
    title: 'Connector layer',
    summary: 'External calls, classifier steps, and protected credentials.',
    items: ['HTTP connector', 'AI classifier', 'Notifications', 'Encrypted credentials'],
  },
  {
    title: 'Workspace controls',
    summary: 'Operational controls for access, metering, and audit review.',
    items: ['API keys', 'Usage windows', 'Audit stream', 'Billing portal'],
  },
];

export function PlansView({
  state,
  onCheckout,
  onPortal,
}: {
  readonly state: AppState;
  readonly onCheckout: (plan: string) => Promise<void>;
  readonly onPortal: () => Promise<void>;
}): ReactElement {
  const currentPlan = state.usage?.plan.name ?? 'free';
  return (
    <div className="plans-page">
      <Card className="plans-hero">
        <div>
          <span className="eyebrow">Plans</span>
          <h1>
            <span className="gradient-word">Choose the operating tier</span> that matches the
            workspace.
          </h1>
          <p>
            Plans define workflow capacity, metered execution volume, retention, and the controls
            available for automation operations.
          </p>
        </div>
        <div className="plans-current-card">
          <span>Current plan</span>
          <strong>{titleCase(currentPlan)}</strong>
          <p>Plan changes are handled here so the usage page stays focused on active meters.</p>
          <Button tone="primary" onClick={() => void onPortal()}>
            Open billing portal
          </Button>
        </div>
      </Card>
      <section className="plans-grid">
        {plans.map((plan) => (
          <PlanCard key={plan.id} plan={plan} currentPlan={currentPlan} onCheckout={onCheckout} />
        ))}
      </section>
      <Card className="plans-compare-card capability-map-card">
        <PanelHeader
          eyebrow="Included controls"
          title="Operational capability map"
          caption="A compact map of the controls available across workflow operations."
        />
        <div className="capability-map-grid">
          {capabilityMap.map((capability, index) => (
            <Capability key={capability.title} capability={capability} index={index} />
          ))}
        </div>
      </Card>
    </div>
  );
}

function PlanCard({
  plan,
  currentPlan,
  onCheckout,
}: {
  readonly plan: PlanModel;
  readonly currentPlan: string;
  readonly onCheckout: (plan: string) => Promise<void>;
}): ReactElement {
  const isCurrent = currentPlan.toLowerCase() === plan.id;
  return (
    <Card className={`plan-showcase-card ${plan.tone} ${isCurrent ? 'current' : ''}`}>
      <div className="plan-showcase-head">
        <span>{isCurrent ? 'Current plan' : 'Available plan'}</span>
        <strong>{plan.name}</strong>
        <p>{plan.summary}</p>
      </div>
      <div className="plan-price">
        <b>{plan.price}</b>
        <span>/ month</span>
      </div>
      <div className="plan-limit-grid">
        {plan.limits.map((limit) => (
          <div key={limit.label}>
            <span>{limit.label}</span>
            <strong>{limit.value}</strong>
          </div>
        ))}
      </div>
      <ul>
        {plan.features.map((feature) => (
          <li key={feature}>{feature}</li>
        ))}
      </ul>
      <Button tone={isCurrent ? 'default' : 'primary'} onClick={() => void onCheckout(plan.id)}>
        {isCurrent ? 'Manage billing' : `Choose ${plan.name}`}
      </Button>
    </Card>
  );
}

function Capability({
  capability,
  index,
}: {
  readonly capability: CapabilityModel;
  readonly index: number;
}): ReactElement {
  return (
    <div className="capability-map-item">
      <div className="capability-map-index">{String(index + 1).padStart(2, '0')}</div>
      <div>
        <strong>{capability.title}</strong>
        <p>{capability.summary}</p>
        <div>
          {capability.items.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
