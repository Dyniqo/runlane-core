import type { ReactElement } from 'react';
import type { AppState } from '../types';
import { percentage, titleCase } from '../lib/format';
import { Card, CircleProgress, EmptyState, PanelHeader, ProgressBar } from '../components/ui';

type UsageTone = 'blue' | 'green' | 'violet' | 'amber';

export function UsageView({ state }: { readonly state: AppState }): ReactElement {
  const usage = state.usage;
  const executionLimit =
    usage?.plan.limits.executions ?? usage?.plan.limits.monthly_executions ?? 100;
  const executionUsed = usage?.plan.used.executions ?? usage?.plan.used.monthly_executions ?? 0;
  const executionPercent = percentage(executionUsed, executionLimit);
  const workflowLimit = usage?.plan.limits.workflows ?? 2;
  const workflowUsed = usage?.plan.used.workflows ?? state.workflows.length;
  const webhookLimit = usage?.plan.limits.webhooks ?? usage?.plan.limits.webhook_requests ?? 100;
  const webhookUsed = usage?.plan.used.webhooks ?? usage?.plan.used.webhook_requests ?? 0;
  const aiLimit = usage?.plan.limits.ai_decisions ?? usage?.plan.limits.ai_calls ?? 10;
  const aiUsed = usage?.plan.used.ai_decisions ?? usage?.plan.used.ai_calls ?? 0;
  const httpLimit = usage?.plan.limits.http_calls ?? usage?.plan.limits.http_connector_calls ?? 100;
  const httpUsed = usage?.plan.used.http_calls ?? usage?.plan.used.http_connector_calls ?? 0;

  return (
    <div className="usage-page refined current-only">
      <Card className="usage-hero-card refined usage-dashboard-hero">
        <div>
          <span className="eyebrow">Usage dashboard</span>
          <h1>
            {usage?.plan.name ? `${titleCase(usage.plan.name)} capacity` : 'Workspace capacity'}
          </h1>
          <p>
            Monitor active metering, compare pressure across workflow resources, and keep the
            workspace inside its current operating limits.
          </p>
          <div className="usage-hero-summary">
            <span>{executionUsed} executions used</span>
            <span>{workflowUsed} workflows active</span>
            <span>{webhookUsed} webhook requests</span>
          </div>
        </div>
        <div className="usage-radial-board">
          <CircleProgress
            value={executionPercent}
            label="Executions"
            detail={`${executionUsed} / ${executionLimit}`}
            tone="green"
            size="lg"
          />
          <div className="usage-radial-meta">
            <strong>{usage?.plan.name ? titleCase(usage.plan.name) : 'Free'} plan</strong>
            <span>Current billing window</span>
            <ProgressBar value={executionPercent} />
          </div>
        </div>
      </Card>
      <section className="usage-capacity-strip radial">
        <CapacityTile title="Workflows" used={workflowUsed} limit={workflowLimit} tone="blue" />
        <CapacityTile title="Executions" used={executionUsed} limit={executionLimit} tone="green" />
        <CapacityTile title="Webhooks" used={webhookUsed} limit={webhookLimit} tone="violet" />
        <CapacityTile title="AI decisions" used={aiUsed} limit={aiLimit} tone="amber" />
      </section>
      <Card className="usage-card refined">
        <PanelHeader
          title="Current meters"
          caption="Metered activity reported by the workspace API."
        />
        {usage ? (
          <div className="usage-metric-grid elevated">
            <UsageMetric
              metric="workflows"
              value={workflowUsed}
              limit={workflowLimit}
              tone="blue"
            />
            <UsageMetric
              metric="executions"
              value={executionUsed}
              limit={executionLimit}
              tone="green"
            />
            <UsageMetric metric="webhooks" value={webhookUsed} limit={webhookLimit} tone="violet" />
            <UsageMetric metric="ai decisions" value={aiUsed} limit={aiLimit} tone="amber" />
            <UsageMetric metric="http calls" value={httpUsed} limit={httpLimit} tone="blue" />
            {Object.entries(usage.plan.used)
              .filter(
                ([metric]) =>
                  ![
                    'workflows',
                    'executions',
                    'monthly_executions',
                    'webhooks',
                    'webhook_requests',
                    'ai_decisions',
                    'ai_calls',
                    'http_calls',
                    'http_connector_calls',
                  ].includes(metric),
              )
              .map(([metric, value]) => (
                <UsageMetric
                  key={metric}
                  metric={metric}
                  value={value}
                  limit={usage.plan.limits[metric] ?? value}
                  tone="violet"
                />
              ))}
          </div>
        ) : (
          <EmptyState
            title="Usage is not available"
            caption="Refresh after signing in to an active workspace."
          />
        )}
      </Card>
    </div>
  );
}

function CapacityTile({
  title,
  used,
  limit,
  tone,
}: {
  readonly title: string;
  readonly used: number;
  readonly limit: number;
  readonly tone: UsageTone;
}): ReactElement {
  const value = percentage(used, limit);
  return (
    <Card className={`capacity-tile radial ${tone}`}>
      <CircleProgress
        value={value}
        label={title}
        detail={`${used} / ${limit}`}
        tone={tone}
        size="sm"
      />
      <div>
        <strong>
          {used} / {limit}
        </strong>
        <span>{title}</span>
        <p>{value}% used</p>
      </div>
    </Card>
  );
}

function UsageMetric({
  metric,
  value,
  limit,
  tone,
}: {
  readonly metric: string;
  readonly value: number;
  readonly limit: number;
  readonly tone: UsageTone;
}): ReactElement {
  const valuePercent = percentage(value, limit);
  return (
    <div className={`usage-metric elevated ${tone}`}>
      <CircleProgress value={valuePercent} label={titleCase(metric)} tone={tone} size="sm" />
      <div>
        <span>{titleCase(metric)}</span>
        <strong>
          {value} / {limit}
        </strong>
        <small>{valuePercent}% used</small>
      </div>
    </div>
  );
}
