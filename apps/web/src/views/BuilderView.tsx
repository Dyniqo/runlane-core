import type { Dispatch, ReactElement, SetStateAction } from 'react';
import type { AppState, Workflow, WorkflowStep, WorkflowStepType, WorkflowTrigger } from '../types';
import { WorkflowCanvas, StepInspector, createVisualStep } from '../components/canvas';
import {
  Button,
  Card,
  EmptyState,
  InfoPill,
  PanelHeader,
  ProgressBar,
  SelectField,
  StatusBadge,
  TextField,
} from '../components/ui';
import { percentage, titleCase } from '../lib/format';

type NodePosition = { readonly x: number; readonly y: number };

export function BuilderView({
  state,
  setState,
  workflow,
  selectedStepKey,
  setSelectedStepKey,
  onCreate,
  onSelectWorkflow,
  onSave,
  onPublish,
  onRun,
  onTest,
}: {
  readonly state: AppState;
  readonly setState: Dispatch<SetStateAction<AppState>>;
  readonly workflow: Workflow | null;
  readonly selectedStepKey: string | null;
  readonly setSelectedStepKey: (key: string) => void;
  readonly onCreate: () => Promise<void>;
  readonly onSelectWorkflow: (workflowId: string) => Promise<void>;
  readonly onSave: (workflow: Workflow) => Promise<void>;
  readonly onPublish: (workflow: Workflow) => Promise<void>;
  readonly onRun: (workflow: Workflow) => Promise<void>;
  readonly onTest: (workflow: Workflow) => Promise<void>;
}): ReactElement {
  const workflowLimit = state.usage?.plan.limits.workflows ?? 2;
  const workflowUsed = state.usage?.plan.used.workflows ?? state.workflows.length;
  const workflowRemaining = Math.max(0, workflowLimit - workflowUsed);
  const canCreateWorkflow = workflowRemaining > 0 || state.workflows.length < workflowLimit;
  const workflowPercent = percentage(workflowUsed, workflowLimit);
  const selectedStep =
    workflow?.definition.steps.find((step) => step.key === selectedStepKey) ??
    workflow?.definition.steps[0] ??
    null;

  function updateWorkflow(nextWorkflow: Workflow): void {
    setState((current) => ({
      ...current,
      workflows: current.workflows.map((item) =>
        item.id === nextWorkflow.id ? nextWorkflow : item,
      ),
    }));
  }

  function updateWorkflowName(name: string): void {
    if (!workflow || workflow.status !== 'draft') return;
    updateWorkflow({ ...workflow, name });
  }

  function updateTrigger(triggerType: WorkflowTrigger): void {
    if (!workflow || workflow.status !== 'draft') return;
    updateWorkflow({
      ...workflow,
      triggerType,
      definition: {
        ...workflow.definition,
        trigger: { ...workflow.definition.trigger, type: triggerType },
      },
    });
  }

  function appendStep(type: WorkflowStepType, _position: NodePosition): string | null {
    if (!workflow || workflow.status !== 'draft') return null;
    const step = createVisualStep(type, workflow.definition.steps.length + 1);
    const previous = workflow.definition.steps[workflow.definition.steps.length - 1] ?? null;
    const steps = previous
      ? workflow.definition.steps.map((item) =>
          item.key === previous.key
            ? { ...item, transitions: { ...(item.transitions ?? {}), onSuccess: step.key } }
            : item,
        )
      : workflow.definition.steps;
    updateWorkflow({
      ...workflow,
      definition: {
        ...workflow.definition,
        steps: [...steps, step],
        entryStepKey: workflow.definition.entryStepKey || step.key,
      },
    });
    setSelectedStepKey(step.key);
    return step.key;
  }

  function updateStep(nextStep: WorkflowStep): void {
    if (!workflow || workflow.status !== 'draft') return;
    updateWorkflow({
      ...workflow,
      definition: {
        ...workflow.definition,
        steps: workflow.definition.steps.map((step) =>
          step.key === nextStep.key ? nextStep : step,
        ),
      },
    });
  }

  function deleteStep(key: string): void {
    if (!workflow || workflow.status !== 'draft' || workflow.definition.steps.length <= 1) return;
    const remainingSteps = workflow.definition.steps
      .filter((step) => step.key !== key)
      .map((step) => ({
        ...step,
        transitions: sanitizeTransitions(step.transitions, key),
      }));
    const nextSelected = remainingSteps[0]?.key ?? null;
    updateWorkflow({
      ...workflow,
      definition: {
        ...workflow.definition,
        entryStepKey:
          workflow.definition.entryStepKey === key
            ? (remainingSteps[0]?.key ?? workflow.definition.entryStepKey)
            : workflow.definition.entryStepKey,
        steps: remainingSteps,
      },
    });
    if (nextSelected) setSelectedStepKey(nextSelected);
  }

  function duplicateStep(key: string): void {
    if (!workflow || workflow.status !== 'draft') return;
    const source = workflow.definition.steps.find((step) => step.key === key);
    if (!source) return;
    const nextKey = uniqueStepKey(source.type, workflow.definition.steps);
    const nextStep: WorkflowStep = {
      ...source,
      key: nextKey,
      name: `${source.name} copy`,
      transitions: {},
    };
    updateWorkflow({
      ...workflow,
      definition: {
        ...workflow.definition,
        steps: [...workflow.definition.steps, nextStep],
      },
    });
    setSelectedStepKey(nextKey);
  }

  async function createAndFocusBuilder(): Promise<void> {
    await onCreate();
    focusBuilder();
  }

  async function selectAndFocusBuilder(workflowId: string): Promise<void> {
    await onSelectWorkflow(workflowId);
    focusBuilder();
  }

  function focusBuilder(): void {
    window.requestAnimationFrame(() => {
      document
        .querySelector('.builder-canvas-card-v2')
        ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
  }

  return (
    <div className="builder-page final builder-page-composed">
      <Card className="builder-hero-card builder-hero-card-v2">
        <div>
          <span className="eyebrow">Visual builder</span>
          <h1>{workflow?.name ?? 'Workflow canvas'}</h1>
          <p>
            Build the workflow in guided panels, keep edits inside draft versions, and run the
            selected flow without writing raw configuration by hand.
          </p>
        </div>
        <div className="builder-hero-actions">
          {workflow ? <StatusBadge value={workflow.status} /> : null}
          {workflow ? (
            <Button tone="primary" onClick={() => void onRun(workflow)}>
              Run execution
            </Button>
          ) : (
            <Button
              tone="primary"
              disabled={!canCreateWorkflow}
              onClick={() => void createAndFocusBuilder()}
            >
              Create workflow
            </Button>
          )}
          {workflow ? (
            <Button onClick={() => void onSave(workflow)}>
              {workflow.status === 'draft' ? 'Save workflow' : 'Create editable draft'}
            </Button>
          ) : null}
        </div>
      </Card>

      <div className="builder-main-grid builder-command-layout">
        <Card className="workflow-rail builder-workflow-console">
          <div className="workflow-console-header">
            <PanelHeader
              eyebrow="Workflows"
              title="Workspace flows"
              caption="Create within plan capacity, pick a flow, then edit its draft safely."
              actions={
                <Button
                  size="sm"
                  tone="primary"
                  disabled={!canCreateWorkflow}
                  onClick={() => void createAndFocusBuilder()}
                >
                  New flow
                </Button>
              }
            />
            <CapacityPanel
              used={workflowUsed}
              limit={workflowLimit}
              percent={workflowPercent}
              remaining={workflowRemaining}
              onClick={canCreateWorkflow ? () => void createAndFocusBuilder() : undefined}
            />
          </div>

          <div className="workflow-console-grid">
            <div className="flow-editor-card flow-create-card">
              <div className="flow-card-title">
                <span>New workflow</span>
                <strong>{canCreateWorkflow ? 'Ready to create' : 'Plan capacity reached'}</strong>
              </div>
              <TextField
                label="Flow name"
                value={state.draftName}
                disabled={!canCreateWorkflow}
                onChange={(event) =>
                  setState((current) => ({ ...current, draftName: event.target.value }))
                }
              />
              <SelectField
                label="Trigger"
                value={state.draftTriggerType}
                disabled={!canCreateWorkflow}
                onChange={(event) =>
                  setState((current) => ({ ...current, draftTriggerType: event.target.value }))
                }
              >
                <option value="automation">Automation bridge</option>
                <option value="webhook">Signed webhook</option>
              </SelectField>
              <p>
                {canCreateWorkflow
                  ? 'This creates a saved draft and consumes one workflow slot.'
                  : 'Workflow slots are allocated by saved workflow records. Reuse an existing draft or choose a larger plan for more slots.'}
              </p>
            </div>

            {workflow ? (
              <div className="flow-editor-card selected-flow-editor selected-flow-card-v2">
                <div className="flow-card-title">
                  <span>Selected flow</span>
                  <strong>{workflow.name}</strong>
                </div>
                <div className="selected-flow-form-grid">
                  <TextField
                    label="Selected flow name"
                    value={workflow.name}
                    disabled={workflow.status !== 'draft'}
                    onChange={(event) => updateWorkflowName(event.target.value)}
                  />
                  <SelectField
                    label="Trigger"
                    value={workflow.triggerType}
                    disabled={workflow.status !== 'draft'}
                    onChange={(event) => updateTrigger(event.target.value)}
                  >
                    <option value="automation">Automation bridge</option>
                    <option value="webhook">Signed webhook</option>
                  </SelectField>
                </div>
                <div className="endpoint-preview endpoint-preview-v2">
                  <span>
                    {workflow.triggerType === 'automation' ? 'Bridge path' : 'Webhook path'}
                  </span>
                  <strong>
                    {workflow.publicId
                      ? `/v1/${workflow.triggerType === 'automation' ? 'automation/execute' : 'hooks'}/${workflow.publicId}`
                      : 'Publish to receive a public id'}
                  </strong>
                </div>
                <div className="flow-action-strip">
                  <Button size="sm" tone="primary" onClick={() => void onRun(workflow)}>
                    Run
                  </Button>
                  <Button size="sm" onClick={() => void onSave(workflow)}>
                    {workflow.status === 'draft' ? 'Save' : 'Draft copy'}
                  </Button>
                  <Button size="sm" onClick={() => void onTest(workflow)}>
                    Validate
                  </Button>
                  <Button
                    size="sm"
                    disabled={workflow.status !== 'draft'}
                    onClick={() => void onPublish(workflow)}
                  >
                    Publish
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flow-editor-card selected-flow-editor selected-flow-card-v2 empty-selected-flow-card">
                <EmptyState
                  title="Select a workflow"
                  caption="Pick an existing flow or create a new draft to open the canvas."
                />
              </div>
            )}

            <div className="workflow-library-card">
              <div className="flow-card-title">
                <span>Flow library</span>
                <strong>{state.workflows.length} saved flows</strong>
              </div>
              <div className="workflow-list workflow-list-v2">
                {state.workflows.map((item, index) => (
                  <WorkflowLibraryItem
                    key={item.id}
                    workflow={item}
                    index={index}
                    active={item.id === workflow?.id}
                    onSelect={() => void selectAndFocusBuilder(item.id)}
                  />
                ))}
                {state.workflows.length === 0 ? (
                  <EmptyState
                    title="No workflows yet"
                    caption="Create the first workflow when the workspace has capacity."
                  />
                ) : null}
              </div>
            </div>
          </div>
        </Card>

        <div className="builder-workspace-row">
          <Card className="canvas-card final builder-canvas-card-v2">
            <WorkflowCanvas
              workflow={workflow}
              selectedKey={selectedStepKey}
              onSelect={setSelectedStepKey}
              onAppendStep={appendStep}
              onDeleteStep={deleteStep}
              onDuplicateStep={duplicateStep}
            />
          </Card>

          <Card className="control-card final builder-control-card-v2">
            <StepInspector
              workflow={workflow}
              selectedKey={selectedStepKey}
              onUpdate={updateStep}
              onDelete={deleteStep}
            />
            <div className="control-section runner-card-v2">
              <PanelHeader
                title="Runner"
                caption="Run the current flow, validate the payload, or save draft changes."
              />
              {workflow ? (
                <div className="button-stack runner-actions-v2">
                  <Button tone="primary" onClick={() => void onRun(workflow)}>
                    Run execution
                  </Button>
                  <Button onClick={() => void onSave(workflow)}>
                    {workflow.status === 'draft' ? 'Save workflow' : 'Create editable draft'}
                  </Button>
                  <Button onClick={() => void onTest(workflow)}>Validate payload</Button>
                  <Button
                    onClick={() => void onPublish(workflow)}
                    disabled={workflow.status !== 'draft'}
                  >
                    {workflow.status === 'draft' ? 'Publish workflow' : 'Published snapshot'}
                  </Button>
                </div>
              ) : (
                <Button
                  tone="primary"
                  disabled={!canCreateWorkflow}
                  onClick={() => void createAndFocusBuilder()}
                >
                  Create workflow
                </Button>
              )}
            </div>
            <div className="control-section payload-card-v2">
              <PanelHeader title="Payload" caption="Readable test values for the selected run." />
              <div className="payload-form-grid-v2">
                <TextField
                  label="Lead name"
                  value={state.payloadName}
                  onChange={(event) =>
                    setState((current) => ({ ...current, payloadName: event.target.value }))
                  }
                />
                <TextField
                  label="Email"
                  value={state.payloadEmail}
                  onChange={(event) =>
                    setState((current) => ({ ...current, payloadEmail: event.target.value }))
                  }
                />
                <TextField
                  label="Score"
                  type="number"
                  min="0"
                  max="100"
                  value={state.payloadScore}
                  onChange={(event) =>
                    setState((current) => ({
                      ...current,
                      payloadScore: Number(event.target.value),
                    }))
                  }
                />
              </div>
            </div>
            {workflow ? (
              <div className="mini-grid builder-state-grid-v2">
                <InfoPill label="Steps" value={workflow.definition.steps.length.toString()} />
                <InfoPill label="Trigger" value={titleCase(workflow.triggerType)} />
                <InfoPill label="Version" value={workflow.version.toString()} />
                <InfoPill label="Selected node" value={selectedStep?.name ?? 'None'} />
              </div>
            ) : null}
          </Card>
        </div>
      </div>
    </div>
  );
}

function CapacityPanel({
  used,
  limit,
  percent,
  remaining,
  onClick,
}: {
  readonly used: number;
  readonly limit: number;
  readonly percent: number;
  readonly remaining: number;
  readonly onClick?: () => void;
}): ReactElement {
  return (
    <button type="button" className="flow-capacity-card" onClick={onClick}>
      <div>
        <span>Workflow slots</span>
        <strong>
          {used} / {limit}
        </strong>
      </div>
      <ProgressBar value={percent} />
      <p>
        {remaining > 0
          ? `${remaining} slot${remaining === 1 ? '' : 's'} available on the current plan.`
          : 'Existing saved flows fill the current plan capacity.'}
      </p>
    </button>
  );
}

function WorkflowLibraryItem({
  workflow,
  index,
  active,
  onSelect,
}: {
  readonly workflow: Workflow;
  readonly index: number;
  readonly active: boolean;
  readonly onSelect: () => void;
}): ReactElement {
  return (
    <button
      className={
        active ? 'workflow-item active workflow-item-v2' : 'workflow-item workflow-item-v2'
      }
      onClick={onSelect}
    >
      <div>
        <strong>{workflow.name}</strong>
        <span>{`Flow ${index + 1} · ${workflow.definition.steps.length} steps · ${titleCase(workflow.triggerType)}`}</span>
      </div>
      <div className="workflow-item-meta-v2">
        <StatusBadge value={workflow.status} />
        <small>v{workflow.version}</small>
      </div>
    </button>
  );
}

function uniqueStepKey(type: WorkflowStepType, steps: readonly WorkflowStep[]): string {
  const base = type.replace(/[^a-z0-9]/g, '_');
  const existing = new Set(steps.map((step) => step.key));
  for (let index = steps.length + 1; index < steps.length + 100; index += 1) {
    const key = `${base}_${index}`;
    if (!existing.has(key)) return key;
  }
  return `${base}_${Date.now()}`;
}

function sanitizeTransitions(
  value: WorkflowStep['transitions'],
  removedKey: string,
): WorkflowStep['transitions'] {
  if (!value) return undefined;
  const branches =
    typeof value.branches === 'object' && value.branches !== null && !Array.isArray(value.branches)
      ? Object.fromEntries(
          Object.entries(value.branches).filter(([, target]) => target !== removedKey),
        )
      : undefined;
  return {
    ...(value.onSuccess !== removedKey ? { onSuccess: value.onSuccess } : {}),
    ...(value.onFailure !== removedKey ? { onFailure: value.onFailure } : {}),
    ...(branches && Object.keys(branches).length > 0 ? { branches } : {}),
  };
}
