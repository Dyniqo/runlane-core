import type { ReactElement } from 'react';
import type { AppState, AppTab, Workflow } from '../types';
import { formatDate, formatDuration, percentage, titleCase } from '../lib/format';
import { Button, Card, PanelHeader, ProgressBar, StatusBadge } from '../components/ui';

export function OverviewView({
  state,
  workflow,
  onCreate,
  onRun,
  onReset,
  onNavigate,
}: {
  readonly state: AppState;
  readonly workflow: Workflow | null;
  readonly onCreate: () => Promise<void>;
  readonly onRun: (workflow: Workflow) => Promise<void>;
  readonly onReset: () => Promise<void>;
  readonly onNavigate: (tab: AppTab) => void;
}): ReactElement {
  const successful = state.executions.filter(
    (execution) => execution.status === 'succeeded',
  ).length;
  const attention = state.executions.filter(
    (execution) =>
      execution.status === 'failed' ||
      execution.status === 'dead_letter' ||
      execution.status === 'retrying',
  ).length;
  const draftCount = state.workflows.filter((item) => item.status === 'draft').length;
  const publishedCount = state.workflows.filter((item) => item.status === 'published').length;
  const executionLimit =
    state.usage?.plan.limits.executions ?? state.usage?.plan.limits.monthly_executions ?? 100;
  const executionUsed =
    state.usage?.plan.used.executions ??
    state.usage?.plan.used.monthly_executions ??
    state.executions.length;
  const webhookUsed =
    state.usage?.plan.used.webhooks ?? state.usage?.plan.used.webhook_requests ?? 0;
  const usagePercent = percentage(executionUsed, executionLimit);
  const lastExecution = state.executions[0] ?? null;
  const steps = workflow?.definition.steps.length ?? 0;
  const recommendedAction = workflow ? 'Run a guided check' : 'Create the first workflow';

  return (
    <div className="overview-page final">
      <Card className="overview-hero-card refined">
        <div className="hero-copy">
          <span className="eyebrow">Operations overview</span>
          <h1>
            <span className="gradient-word">Runlane is ready</span> for guided workflow operations.
          </h1>
          <p>
            Operate workflows through a guided interface with readable cards, controlled actions,
            and a visual canvas built for workspace teams.
          </p>
          <div className="hero-actions">
            <Button tone="primary" onClick={() => void (workflow ? onRun(workflow) : onCreate())}>
              {recommendedAction}
            </Button>
            <Button onClick={() => onNavigate('workflows')}>Open builder</Button>
            <Button tone="subtle" onClick={() => void onReset()}>
              Refresh demo
            </Button>
          </div>
        </div>
        <div className="overview-action-panel">
          <div className="action-panel-top">
            <span>Recommended next step</span>
            <strong>{recommendedAction}</strong>
            <p>
              {workflow
                ? 'Create a new run and review its status, timing, and retry path from the run timeline.'
                : 'Start with a draft workflow and add the first operation steps on the canvas.'}
            </p>
          </div>
          <div className="action-panel-grid">
            <MiniStat
              label="Flows"
              value={`${publishedCount}/${state.workflows.length || 0}`}
              detail="published"
            />
            <MiniStat label="Canvas" value={steps} detail="nodes" />
            <MiniStat label="Runs" value={state.executions.length} detail="total" />
          </div>
          <div className="readiness-stack">
            <ReadinessItem label="API" ready={state.health.api === 'online'} />
            <ReadinessItem label="Queue" ready={state.health.queue === 'online'} />
            <ReadinessItem label="Workspace" ready={Boolean(state.session)} />
          </div>
        </div>
      </Card>
      <section className="overview-command-grid">
        <CommandCard
          tone="blue"
          title="Design the flow"
          value={state.workflows.length > 0 ? 'Builder ready' : 'Start design'}
          caption={`${publishedCount} published · ${draftCount} drafts`}
          button="Open builder"
          onClick={() => onNavigate('workflows')}
        />
        <CommandCard
          tone="green"
          title="Validate outcomes"
          value={state.executions.length > 0 ? `${successful} successful` : 'Run first check'}
          caption={attention > 0 ? `${attention} need attention` : 'No issues waiting'}
          button="Review runs"
          onClick={() => onNavigate('executions')}
        />
        <CommandCard
          tone="violet"
          title="Connect safely"
          value={state.apiKeys.length > 0 ? 'Access active' : 'Add access'}
          caption={`${state.apiKeys.length} keys · ${state.secrets.length} masked secrets`}
          button="Integrations"
          onClick={() => onNavigate('integrations')}
        />
        <CommandCard
          tone="amber"
          title="Plan capacity"
          value={state.usage?.plan.name ? titleCase(state.usage.plan.name) : 'Free'}
          caption={`${executionUsed} of ${executionLimit} runs used`}
          button="Usage"
          onClick={() => onNavigate('usage')}
        >
          <ProgressBar value={usagePercent} />
        </CommandCard>
      </section>
      <section className="overview-lower-grid final balanced">
        <Card className="operation-scope-card final overview-tile-span">
          <PanelHeader
            eyebrow="Coverage"
            title="Workspace scope"
            caption="Enabled surfaces across the selected workspace."
          />
          <div className="scope-list">
            <ScopeItem label="Access" value={`${state.apiKeys.length} keys`} tone="violet" />
            <ScopeItem label="Audit" value={`${state.auditLogs.length} events`} tone="blue" />
            <ScopeItem label="Usage" value={`${executionUsed}/${executionLimit}`} tone="amber" />
            <ScopeItem label="Flows" value={`${state.workflows.length} total`} tone="green" />
          </div>
          <div className="state-compact-list">
            <div>
              <span>Selected flow</span>
              <strong>{workflow?.name ?? 'None selected'}</strong>
            </div>
            <div>
              <span>Last update</span>
              <strong>
                {lastExecution ? formatDate(lastExecution.createdAt) : 'Waiting for first run'}
              </strong>
            </div>
          </div>
        </Card>
        <Card className="workspace-state-card enhanced final overview-tile-span">
          <PanelHeader
            eyebrow="Workspace state"
            title="Readiness"
            caption="Capacity, selected flow, and service health."
            actions={workflow ? <StatusBadge value={workflow.status} /> : null}
          />
          <div className="snapshot-grid workspace-snapshot-grid">
            <Snapshot
              label="Readiness"
              value={state.health.ready === 'online' ? 'Ready' : 'Offline'}
              tone={state.health.ready === 'online' ? 'green' : 'amber'}
            />
            <Snapshot
              label="Queue"
              value={state.health.queue === 'online' ? 'Accepting' : 'Offline'}
              tone={state.health.queue === 'online' ? 'blue' : 'amber'}
            />
            <Snapshot
              label="Capacity"
              value={`${usagePercent}%`}
              tone={usagePercent > 80 ? 'amber' : 'blue'}
            />
            <Snapshot label="Flow" value={workflow ? `${steps} nodes` : 'None'} tone="violet" />
          </div>
          <div className="state-radar">
            <div>
              <span>API</span>
              <i className={state.health.api === 'online' ? 'on' : ''} />
            </div>
            <div>
              <span>Ready</span>
              <i className={state.health.ready === 'online' ? 'on' : ''} />
            </div>
            <div>
              <span>Queue</span>
              <i className={state.health.queue === 'online' ? 'on' : ''} />
            </div>
          </div>
        </Card>
        <Card className="recent-activity-card enhanced final overview-tile-span">
          <PanelHeader
            eyebrow="Recent activity"
            title="Latest run"
            caption="The newest run in a readable summary."
          />
          <div className="activity-feature">
            <span>{lastExecution ? titleCase(lastExecution.status) : 'Waiting for first run'}</span>
            <strong>
              {lastExecution ? formatDuration(lastExecution.durationMs) : 'No execution yet'}
            </strong>
            <p>
              {lastExecution
                ? `${lastExecution.attempts} attempt${lastExecution.attempts === 1 ? '' : 's'} recorded for the latest workflow check.`
                : 'Run a guided check from overview or builder to populate this panel.'}
            </p>
          </div>
          <div className="activity-mini-grid">
            <MiniStat label="Succeeded" value={successful} detail="runs" />
            <MiniStat label="Attention" value={attention} detail="runs" />
          </div>
          <Button onClick={() => onNavigate('executions')}>Open runs</Button>
        </Card>

        <Card className="journey-card enhanced overview-tile-span">
          <PanelHeader
            eyebrow="Guided path"
            title="What to do next"
            caption="A complete operator path for shaping, publishing, running, and reviewing workflows."
          />
          <div className="journey-list compact">
            <Step
              done={state.workflows.length > 0}
              index="01"
              title="Create or select a workflow"
              caption="Choose a draft or stable snapshot from the builder."
              action="Builder"
              onClick={() => onNavigate('workflows')}
            />
            <Step
              done={Boolean(workflow?.publishedAt) || workflow?.status === 'published'}
              index="02"
              title="Publish a stable version"
              caption="Drafts can be saved while published snapshots stay protected."
              action="Canvas"
              onClick={() => onNavigate('workflows')}
            />
            <Step
              done={state.executions.length > 0}
              index="03"
              title="Run a guided check"
              caption="Use workspace forms to create a fresh execution."
              action="Run"
              onClick={() => void (workflow ? onRun(workflow) : onCreate())}
            />
            <Step
              done={state.auditLogs.length > 0}
              index="04"
              title="Review activity"
              caption="Check outcomes, timing, capacity, and recent events."
              action="Audit"
              onClick={() => onNavigate('audit')}
            />
          </div>
          <div className="journey-insight-grid">
            <JourneyInsight label="Drafts" value={draftCount} tone="blue" />
            <JourneyInsight label="Published" value={publishedCount} tone="green" />
            <JourneyInsight label="Steps" value={steps} tone="violet" />
          </div>
        </Card>
        <Card className="workspace-guard-card final overview-tile-span">
          <PanelHeader
            eyebrow="Control plane"
            title="Operational guardrails"
            caption="Workspace actions remain routed through scoped controls."
          />
          <div className="guardrail-stack expanded">
            <Guardrail
              label="Published editing"
              value={workflow?.status === 'published' ? 'Draft copy' : 'Direct draft'}
              tone="blue"
            />
            <Guardrail label="Run source" value="Guided form" tone="green" />
            <Guardrail
              label="Credentials"
              value={`${state.credentials.length + state.secrets.length} configured`}
              tone="violet"
            />
          </div>
          <div className="control-plane-detail">
            <ControlDetail label="Workspace scope" value="Token resolved" />
            <ControlDetail label="Secrets" value="Masked at rest" />
            <ControlDetail label="Retry action" value="Runs only" />
          </div>
          <Button onClick={() => onNavigate('integrations')}>Review controls</Button>
        </Card>
        <Card className="execution-rhythm-card final overview-tile-span">
          <PanelHeader
            eyebrow="Run rhythm"
            title="Execution mix"
            caption="Queue intake, webhook pressure, and attention at a glance."
          />
          <div className="rhythm-meter">
            <span>Used capacity</span>
            <strong>{usagePercent}%</strong>
            <ProgressBar value={usagePercent} />
          </div>
          <div className="rhythm-grid expanded">
            <Rhythm label="Runs" value={state.executions.length} tone="blue" />
            <Rhythm label="Webhooks" value={webhookUsed} tone="violet" />
            <Rhythm label="Attention" value={attention} tone="amber" />
            <Rhythm label="Healthy" value={successful} tone="green" />
          </div>
          <div className="rhythm-story">
            <span>{attention > 0 ? 'Attention queue' : 'Operating status'}</span>
            <strong>
              {attention > 0
                ? `${attention} run${attention === 1 ? '' : 's'} need review`
                : 'No attention backlog'}
            </strong>
            <p>
              {lastExecution
                ? `Latest run finished as ${titleCase(lastExecution.status)}.`
                : 'Start a guided check to create the first execution signal.'}
            </p>
          </div>
          <Button onClick={() => onNavigate('plans')}>Compare plans</Button>
        </Card>
      </section>
    </div>
  );
}

function CommandCard({
  tone,
  title,
  value,
  caption,
  button,
  onClick,
  children,
}: {
  readonly tone: 'blue' | 'green' | 'violet' | 'amber';
  readonly title: string;
  readonly value: string;
  readonly caption: string;
  readonly button: string;
  readonly onClick: () => void;
  readonly children?: ReactElement;
}): ReactElement {
  return (
    <Card className={`command-card refined ${tone}`}>
      <div>
        <span>{title}</span>
        <strong>{value}</strong>
        <p>{caption}</p>
      </div>
      {children ? <div className="command-progress">{children}</div> : null}
      <button type="button" onClick={onClick}>
        {button}
      </button>
    </Card>
  );
}

function MiniStat({
  label,
  value,
  detail,
}: {
  readonly label: string;
  readonly value: string | number;
  readonly detail: string;
}): ReactElement {
  return (
    <div className="mini-stat">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function ReadinessItem({
  label,
  ready,
}: {
  readonly label: string;
  readonly ready: boolean;
}): ReactElement {
  return (
    <div className={ready ? 'readiness-item ready' : 'readiness-item'}>
      <i />
      {label}
    </div>
  );
}

function Step({
  done,
  index,
  title,
  caption,
  action,
  onClick,
}: {
  readonly done: boolean;
  readonly index: string;
  readonly title: string;
  readonly caption: string;
  readonly action: string;
  readonly onClick: () => void;
}): ReactElement {
  return (
    <div className={`journey-step ${done ? 'done' : ''}`}>
      <i>{done ? '✓' : index}</i>
      <div>
        <strong>{title}</strong>
        <span>{caption}</span>
      </div>
      <button type="button" onClick={onClick}>
        {action}
      </button>
    </div>
  );
}

function Snapshot({
  label,
  value,
  tone,
}: {
  readonly label: string;
  readonly value: string;
  readonly tone: 'blue' | 'green' | 'violet' | 'amber';
}): ReactElement {
  return (
    <div className={`snapshot-tile ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ScopeItem({
  label,
  value,
  tone,
}: {
  readonly label: string;
  readonly value: string;
  readonly tone: 'blue' | 'green' | 'violet' | 'amber';
}): ReactElement {
  return (
    <div className={`scope-item ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Guardrail({
  label,
  value,
  tone,
}: {
  readonly label: string;
  readonly value: string;
  readonly tone: 'blue' | 'green' | 'violet';
}): ReactElement {
  return (
    <div className={`guardrail-item ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ControlDetail({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}): ReactElement {
  return (
    <div className="control-detail">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function JourneyInsight({
  label,
  value,
  tone,
}: {
  readonly label: string;
  readonly value: string | number;
  readonly tone: 'blue' | 'green' | 'violet';
}): ReactElement {
  return (
    <div className={`journey-insight ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Rhythm({
  label,
  value,
  tone,
}: {
  readonly label: string;
  readonly value: string | number;
  readonly tone: 'blue' | 'green' | 'violet' | 'amber';
}): ReactElement {
  return (
    <div className={`rhythm-item ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
