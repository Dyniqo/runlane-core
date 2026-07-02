import { useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import type { AppState, Execution, ExecutionStep } from '../types';
import { formatDate, formatDuration, summarizeRecord, titleCase } from '../lib/format';
import {
  Button,
  Card,
  CompactPager,
  EmptyState,
  InfoPill,
  PanelHeader,
  StatusBadge,
} from '../components/ui';

export function ExecutionsView({
  state,
  selectedExecution,
  onSelect,
  onRetry,
  onRefresh,
}: {
  readonly state: AppState;
  readonly selectedExecution: Execution | null;
  readonly onSelect: (execution: Execution) => Promise<void>;
  readonly onRetry: (execution: Execution) => Promise<void>;
  readonly onRefresh: () => Promise<void>;
}): ReactElement {
  const queued = state.executions.filter(
    (execution) => execution.status === 'queued' || execution.status === 'running',
  ).length;
  const succeeded = state.executions.filter((execution) => execution.status === 'succeeded').length;
  const attention = state.executions.filter(
    (execution) =>
      execution.status === 'failed' ||
      execution.status === 'dead_letter' ||
      execution.status === 'retrying',
  ).length;
  const [page, setPage] = useState(0);
  const pageSize = 8;
  const pageCount = Math.max(1, Math.ceil(state.executions.length / pageSize));
  const normalizedPage = Math.min(page, pageCount - 1);
  const visibleExecutions = useMemo(
    () => state.executions.slice(normalizedPage * pageSize, normalizedPage * pageSize + pageSize),
    [normalizedPage, state.executions],
  );

  return (
    <div className="executions-page expanded">
      <Card className="run-list">
        <PanelHeader
          eyebrow="Runs"
          title="Execution history"
          caption="Every accepted execution returned by the workspace API."
          actions={
            <Button size="sm" onClick={() => void onRefresh()}>
              Refresh runs
            </Button>
          }
        />
        <div className="run-counter-grid">
          <InfoPill label="Total" value={state.executions.length.toString()} />
          <InfoPill label="In progress" value={queued.toString()} />
          <InfoPill label="Succeeded" value={succeeded.toString()} />
          <InfoPill label="Attention" value={attention.toString()} />
        </div>
        {state.automationRunResult ? (
          <div className="latest-run-card">
            <span>Latest accepted run</span>
            <strong>{state.automationRunResult.executionId.slice(0, 12)}</strong>
            <p>
              {titleCase(state.automationRunResult.status)} ·{' '}
              {formatDate(state.automationRunResult.acceptedAt)}
            </p>
          </div>
        ) : null}
        <div className="run-items bounded-scroll tall">
          {visibleExecutions.map((execution, index) => (
            <RunRow
              key={execution.id}
              execution={execution}
              index={normalizedPage * pageSize + index}
              selected={execution.id === selectedExecution?.id}
              onSelect={onSelect}
            />
          ))}
          {state.executions.length === 0 ? (
            <EmptyState
              title="No executions yet"
              caption="Run a workflow from the builder to create the first execution."
            />
          ) : null}
        </div>
        <CompactPager
          page={normalizedPage}
          pageCount={pageCount}
          total={state.executions.length}
          label="Runs"
          onPage={setPage}
        />
      </Card>
      <Card className="run-detail">
        {selectedExecution ? (
          <ExecutionDetail
            execution={selectedExecution}
            steps={state.executionSteps}
            onRetry={onRetry}
          />
        ) : (
          <EmptyState title="Select an execution" caption="Run details will appear here." />
        )}
      </Card>
    </div>
  );
}

function RunRow({
  execution,
  index,
  selected,
  onSelect,
}: {
  readonly execution: Execution;
  readonly index: number;
  readonly selected: boolean;
  readonly onSelect: (execution: Execution) => Promise<void>;
}): ReactElement {
  return (
    <button
      className={selected ? 'run-item active' : 'run-item'}
      onClick={() => void onSelect(execution)}
    >
      <div>
        <strong>{`Run ${index + 1}`}</strong>
        <span>{formatDate(execution.createdAt)}</span>
        <small>{execution.workflowPublicId || execution.workflowId.slice(0, 12)}</small>
      </div>
      <StatusBadge value={execution.status} />
    </button>
  );
}

function ExecutionDetail({
  execution,
  steps,
  onRetry,
}: {
  readonly execution: Execution;
  readonly steps: readonly ExecutionStep[];
  readonly onRetry: (execution: Execution) => Promise<void>;
}): ReactElement {
  const fields = summarizeRecord(execution.input);
  return (
    <div className="detail-layout">
      <div className="detail-hero">
        <div>
          <span className="eyebrow">Execution trace</span>
          <h2>{titleCase(execution.status)}</h2>
          <p>
            Run summary with worker timing, retry controls, and the latest persisted step state.
          </p>
        </div>
        <StatusBadge value={execution.status} />
      </div>
      <div className="mini-grid">
        <InfoPill label="Attempts" value={execution.attempts.toString()} />
        <InfoPill label="Duration" value={formatDuration(execution.durationMs)} />
        <InfoPill label="Queued" value={formatDate(execution.queuedAt)} />
        <InfoPill label="Version" value={execution.workflowVersion.toString()} />
      </div>
      <PanelHeader title="Payload summary" caption="Readable fields prepared for operators." />
      <div className="summary-grid bounded-scroll short">
        {fields.map(([label, value]) => (
          <InfoPill key={label} label={label} value={value} />
        ))}
        {fields.length === 0 ? <EmptyState title="No readable fields" /> : null}
      </div>
      <PanelHeader
        title="Worker timing"
        caption="Step records are shown when persisted trace details are available."
      />
      <div className="timeline-list bounded-scroll short">
        {steps.map((step, index) => (
          <div key={step.id} className="timeline-row">
            <i />
            <div>
              <strong>{`Step ${index + 1}`}</strong>
              <span>
                {titleCase(step.type)} · {titleCase(step.status)}
                {step.errorMessage ? ` · ${step.errorMessage}` : ''}
              </span>
            </div>
            <b>{formatDuration(step.durationMs)}</b>
          </div>
        ))}
        {steps.length === 0 ? <EmptyState title="No step records available" /> : null}
      </div>
      {execution.errorMessage ? (
        <div className="inline-alert danger">{execution.errorMessage}</div>
      ) : null}
      {execution.status === 'failed' || execution.status === 'dead_letter' ? (
        <Button tone="primary" onClick={() => void onRetry(execution)}>
          Request retry
        </Button>
      ) : null}
    </div>
  );
}
