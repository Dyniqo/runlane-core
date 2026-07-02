import { useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent, PointerEvent, ReactElement } from 'react';
import type { JsonRecord, Workflow, WorkflowStep, WorkflowStepType } from '../types';
import { titleCase } from '../lib/format';
import { Button, SelectField, StatusBadge, TextAreaField, TextField } from './ui';

type NodePosition = { readonly x: number; readonly y: number };
type NodeMap = Record<string, NodePosition>;
type EdgeKind = 'success' | 'failure' | 'branch' | 'next';
type WorkflowEdge = {
  readonly id: string;
  readonly sourceKey: string;
  readonly targetKey: string;
  readonly label: string;
  readonly kind: EdgeKind;
  readonly explicit: boolean;
  readonly offset: number;
};
type EdgePoint = { readonly x: number; readonly y: number };
type EdgeSide = 'left' | 'right' | 'top' | 'bottom';
type EdgeRoute = {
  readonly path: string;
  readonly label: EdgePoint;
  readonly start: EdgePoint;
  readonly end: EdgePoint;
  readonly sourceSide: EdgeSide;
  readonly targetSide: EdgeSide;
};
type EdgeCandidate = {
  readonly sourceSide: EdgeSide;
  readonly targetSide: EdgeSide;
  readonly start: EdgePoint;
  readonly end: EdgePoint;
  readonly score: number;
};
type RouteMetrics = Record<string, { readonly incoming: number; readonly outgoing: number }>;
type CanvasExtent = { readonly width: number; readonly height: number };
type DragState = {
  readonly key: string;
  readonly startX: number;
  readonly startY: number;
  readonly originX: number;
  readonly originY: number;
};
type PanState = {
  readonly startX: number;
  readonly startY: number;
  readonly originLeft: number;
  readonly originTop: number;
};

type PaletteNode = {
  readonly type: WorkflowStepType;
  readonly title: string;
  readonly caption: string;
};

const canvasSize = { width: 2240, height: 1440 };
const nodeBox = { width: 304, height: 132 };
const minZoom = 0.72;
const maxZoom = 1.08;
const zoomStep = 0.08;
const nodePalette: readonly PaletteNode[] = [
  { type: 'condition', title: 'Decision', caption: 'Branch from known payload state' },
  { type: 'http', title: 'Request', caption: 'Call a configured HTTP endpoint' },
  { type: 'ai_decision', title: 'Classifier', caption: 'Generate a structured routing result' },
  { type: 'notification', title: 'Notify', caption: 'Send a Slack or Discord message' },
];

export function WorkflowCanvas({
  workflow,
  selectedKey,
  onSelect,
  onAppendStep,
  onDeleteStep,
  onDuplicateStep,
}: {
  readonly workflow: Workflow | null;
  readonly selectedKey: string | null;
  readonly onSelect: (key: string) => void;
  readonly onAppendStep: (type: WorkflowStepType, position: NodePosition) => string | null;
  readonly onDeleteStep: (key: string) => void;
  readonly onDuplicateStep: (key: string) => void;
}): ReactElement {
  const boardRef = useRef<HTMLDivElement | null>(null);
  const dragState = useRef<DragState | null>(null);
  const panState = useRef<PanState | null>(null);
  const isPointerInside = useRef(false);
  const steps = workflow?.definition.steps ?? [];
  const stepKeySignature = steps.map((step) => step.key).join('|');
  const editable = workflow?.status === 'draft';
  const [zoom, setZoom] = useState(0.84);
  const [positions, setPositions] = useState<NodeMap>(() => createPositions(steps));
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const layout = useMemo(
    () => normalizeLayout({ ...createPositions(steps), ...positions }, steps),
    [positions, steps],
  );
  const edges = useMemo(() => buildWorkflowEdges(steps), [steps]);
  const routeMetrics = useMemo(() => summarizeRouteMetrics(edges), [edges]);
  const canvasExtent = useMemo(() => buildCanvasExtent(layout, steps), [layout, steps]);

  useEffect(() => {
    const board = boardRef.current;
    if (!board) return undefined;

    const zoomFromWheel = (event: globalThis.WheelEvent): void => {
      event.preventDefault();
      event.stopPropagation();
      setZoom((current) =>
        clampZoom(Number((current + (event.deltaY > 0 ? -zoomStep : zoomStep)).toFixed(2))),
      );
    };

    const handleBoardWheel = (event: globalThis.WheelEvent): void => {
      if (!event.ctrlKey && !event.metaKey) return;
      zoomFromWheel(event);
    };

    const handleWindowWheel = (event: globalThis.WheelEvent): void => {
      if (!isPointerInside.current || (!event.ctrlKey && !event.metaKey)) return;
      zoomFromWheel(event);
    };

    board.addEventListener('wheel', handleBoardWheel, { passive: false, capture: true });
    window.addEventListener('wheel', handleWindowWheel, { passive: false, capture: true });
    return () => {
      board.removeEventListener('wheel', handleBoardWheel, { capture: true });
      window.removeEventListener('wheel', handleWindowWheel, { capture: true });
    };
  }, []);

  useEffect(() => {
    const nextPositions = createPositions(steps);
    setPositions(nextPositions);
    setSelectedEdgeId(null);
    const board = boardRef.current;
    if (!board || steps.length === 0) return;
    window.requestAnimationFrame(() =>
      centerCanvasView(board, nextPositions, steps, zoom, buildCanvasExtent(nextPositions, steps)),
    );
  }, [stepKeySignature, workflow?.id]);

  function dragPaletteNode(event: DragEvent<HTMLDivElement>, node: PaletteNode): void {
    event.dataTransfer.setData('application/runlane-node-type', node.type);
  }

  function startStepDrag(event: PointerEvent<HTMLDivElement>, step: WorkflowStep): void {
    if (event.button !== 0 || isInteractiveTarget(event.target)) return;
    const current = layout[step.key] ?? createPositions([step])[step.key] ?? { x: 32, y: 32 };
    dragState.current = {
      key: step.key,
      startX: event.clientX,
      startY: event.clientY,
      originX: current.x,
      originY: current.y,
    };
    setDraggingKey(step.key);
    setSelectedEdgeId(null);
    onSelect(step.key);
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function moveStep(event: PointerEvent<HTMLDivElement>, step: WorkflowStep): void {
    const state = dragState.current;
    if (!state || state.key !== step.key) return;
    const nextPosition = clampCanvasPosition(
      {
        x: state.originX + (event.clientX - state.startX) / zoom,
        y: state.originY + (event.clientY - state.startY) / zoom,
      },
      canvasExtent,
    );
    setPositions((current) => ({ ...current, [state.key]: nextPosition }));
  }

  function finishStepDrag(event: PointerEvent<HTMLDivElement>): void {
    if (!dragState.current) return;
    dragState.current = null;
    setDraggingKey(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function changeZoom(delta: number): void {
    setZoom((current) => clampZoom(Number((current + delta).toFixed(2))));
  }

  function arrangeSteps(): void {
    const nextPositions = createPositions(steps);
    const nextExtent = buildCanvasExtent(nextPositions, steps);
    setPositions(nextPositions);
    setSelectedEdgeId(null);
    const board = boardRef.current;
    if (!board) return;
    window.requestAnimationFrame(() =>
      centerCanvasView(board, nextPositions, steps, zoom, nextExtent),
    );
  }

  function startCanvasPan(event: PointerEvent<HTMLDivElement>): void {
    if (event.button !== 0 || !isCanvasPanTarget(event.target)) return;
    panState.current = {
      startX: event.clientX,
      startY: event.clientY,
      originLeft: event.currentTarget.scrollLeft,
      originTop: event.currentTarget.scrollTop,
    };
    setIsPanning(true);
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function moveCanvasPan(event: PointerEvent<HTMLDivElement>): void {
    const state = panState.current;
    if (!state) return;
    event.currentTarget.scrollTo({
      left: state.originLeft - (event.clientX - state.startX),
      top: state.originTop - (event.clientY - state.startY),
      behavior: 'instant',
    });
    event.preventDefault();
  }

  function finishCanvasPan(event: PointerEvent<HTMLDivElement>): void {
    if (!panState.current) return;
    panState.current = null;
    setIsPanning(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function drop(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    const bounds = event.currentTarget.getBoundingClientRect();
    const position = clampCanvasPosition(
      {
        x:
          (event.clientX - bounds.left + event.currentTarget.scrollLeft) / zoom - nodeBox.width / 2,
        y: (event.clientY - bounds.top + event.currentTarget.scrollTop) / zoom - nodeBox.height / 2,
      },
      canvasExtent,
    );
    const key = event.dataTransfer.getData('application/runlane-step');
    if (key) {
      setPositions((current) => ({ ...current, [key]: position }));
      return;
    }
    const nodeType = event.dataTransfer.getData(
      'application/runlane-node-type',
    ) as WorkflowStepType;
    if (!nodeType) return;
    const createdKey = onAppendStep(nodeType, position);
    if (createdKey) setPositions((current) => ({ ...current, [createdKey]: position }));
  }

  return (
    <section className="builder-grid redesigned final">
      <aside className="node-dock spacious final">
        <div className="dock-title">
          <span>Node library</span>
          <strong>Add workflow steps</strong>
          <p>Drag a card onto the canvas. Each card maps to a supported workflow step.</p>
        </div>
        <div className="dock-node-list">
          {nodePalette.map((node) => (
            <div
              className={`dock-node ${node.type}`}
              draggable
              key={node.type}
              onDragStart={(event) => dragPaletteNode(event, node)}
            >
              <i>{iconFor(node.type)}</i>
              <div>
                <span>{node.title}</span>
                <p>{node.caption}</p>
              </div>
            </div>
          ))}
        </div>
      </aside>
      <div
        className={`canvas-board final ${isPanning ? 'panning' : ''}`}
        ref={boardRef}
        onPointerEnter={() => {
          isPointerInside.current = true;
        }}
        onPointerLeave={() => {
          isPointerInside.current = false;
        }}
        onPointerDown={startCanvasPan}
        onPointerMove={moveCanvasPan}
        onPointerUp={finishCanvasPan}
        onPointerCancel={finishCanvasPan}
        onDragOver={(event) => event.preventDefault()}
        onDrop={drop}
      >
        <div className="canvas-tools" aria-label="Canvas zoom controls">
          <button type="button" aria-label="Zoom out" onClick={() => changeZoom(-zoomStep)}>
            −
          </button>
          <span>{Math.round(zoom * 100)}%</span>
          <button type="button" aria-label="Zoom in" onClick={() => changeZoom(zoomStep)}>
            +
          </button>
          <button type="button" aria-label="Arrange workflow steps" onClick={arrangeSteps}>
            Fit
          </button>
        </div>
        {steps.length === 0 ? (
          <div className="canvas-empty">Create a workflow to start the visual plan.</div>
        ) : null}
        <div
          className="canvas-viewport-frame"
          style={{ width: canvasExtent.width * zoom, height: canvasExtent.height * zoom }}
        >
          <div
            className="canvas-viewport"
            style={{
              width: canvasExtent.width,
              height: canvasExtent.height,
              transform: `scale(${zoom})`,
            }}
          >
            <svg
              className="edge-layer workflow-edge-layer"
              width={canvasExtent.width}
              height={canvasExtent.height}
              aria-hidden="true"
            >
              <defs>
                {(['success', 'failure', 'branch', 'next'] as const).map((kind) => (
                  <marker
                    key={kind}
                    id={`edge-arrow-${kind}`}
                    viewBox="0 0 10 10"
                    refX="8"
                    refY="5"
                    markerWidth="8"
                    markerHeight="8"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 0 L 10 5 L 0 10 z" className={`edge-arrow ${kind}`} />
                  </marker>
                ))}
              </defs>
              {edges.map((edge) => {
                const sourcePosition = layout[edge.sourceKey];
                const targetPosition = layout[edge.targetKey];
                if (!sourcePosition || !targetPosition) return null;
                const geometry = buildEdgeGeometry(sourcePosition, targetPosition, edge.offset);
                const labelWidth = Math.max(70, Math.min(190, edge.label.length * 7 + 28));
                const isEdgeSelected = selectedEdgeId === edge.id;
                const isEdgeRelated =
                  selectedKey === edge.sourceKey || selectedKey === edge.targetKey;
                const edgeClassName = [
                  'workflow-edge',
                  edge.kind,
                  edge.explicit ? 'explicit' : 'implicit',
                  isEdgeSelected ? 'selected' : '',
                  isEdgeRelated ? 'related' : '',
                  `from-${geometry.sourceSide}`,
                  `to-${geometry.targetSide}`,
                ]
                  .filter(Boolean)
                  .join(' ');
                return (
                  <g
                    key={edge.id}
                    role="button"
                    className={edgeClassName}
                    onClick={(event) => {
                      event.stopPropagation();
                      setSelectedEdgeId(edge.id);
                      onSelect(edge.sourceKey);
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter' && event.key !== ' ') return;
                      event.preventDefault();
                      setSelectedEdgeId(edge.id);
                      onSelect(edge.sourceKey);
                    }}
                  >
                    <title>{`${edge.label}: ${stepName(steps, edge.sourceKey)} to ${stepName(
                      steps,
                      edge.targetKey,
                    )}`}</title>
                    <path className="workflow-edge-hitbox" d={geometry.path} />
                    <path
                      className="workflow-edge-path"
                      d={geometry.path}
                      markerEnd={`url(#edge-arrow-${edge.kind})`}
                    />
                    <circle
                      className="workflow-edge-port workflow-edge-port-source"
                      cx={geometry.start.x}
                      cy={geometry.start.y}
                      r={isEdgeSelected ? 5.5 : isEdgeRelated ? 4.6 : 4}
                    />
                    <circle
                      className="workflow-edge-port workflow-edge-port-target"
                      cx={geometry.end.x}
                      cy={geometry.end.y}
                      r={isEdgeSelected ? 4.5 : isEdgeRelated ? 3.8 : 3.4}
                    />
                    <g
                      className="workflow-edge-label"
                      transform={`translate(${geometry.label.x - labelWidth / 2}, ${
                        geometry.label.y - 14
                      })`}
                    >
                      <rect width={labelWidth} height="28" rx="14" />
                      <text x={labelWidth / 2} y="18" textAnchor="middle">
                        {edge.label}
                      </text>
                    </g>
                  </g>
                );
              })}
            </svg>
            {steps.map((step, index) => (
              <div
                key={step.key}
                onPointerDown={(event) => startStepDrag(event, step)}
                onPointerMove={(event) => moveStep(event, step)}
                onPointerUp={finishStepDrag}
                onPointerCancel={finishStepDrag}
                onClick={() => {
                  setSelectedEdgeId(null);
                  onSelect(step.key);
                }}
                className={`canvas-node ${step.type} ${selectedKey === step.key ? 'selected' : ''} ${
                  draggingKey === step.key ? 'dragging' : ''
                }`}
                style={{
                  transform: `translate(${layout[step.key]?.x ?? 32}px, ${
                    layout[step.key]?.y ?? 32
                  }px)`,
                }}
              >
                <div className="node-icon">{iconFor(step.type)}</div>
                <div>
                  <strong>{step.name}</strong>
                  <span>{`Step ${index + 1} · ${labelFor(step.type)}`}</span>
                </div>
                <StatusBadge value={labelFor(step.type)} />
                <div className="node-route-strip">
                  {workflow?.definition.entryStepKey === step.key ? (
                    <span className="entry">Entry</span>
                  ) : null}
                  <span>{`${routeMetrics[step.key]?.incoming ?? 0} in`}</span>
                  <span>{`${routeMetrics[step.key]?.outgoing ?? 0} out`}</span>
                </div>
                {selectedKey === step.key ? (
                  <div
                    className="canvas-node-actions"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <button type="button" onClick={() => onSelect(step.key)}>
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled={!editable}
                      onClick={() => onDuplicateStep(step.key)}
                    >
                      Clone
                    </button>
                    <button
                      type="button"
                      disabled={!editable || steps.length <= 1}
                      onClick={() => onDeleteStep(step.key)}
                    >
                      Delete
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export function StepInspector({
  workflow,
  selectedKey,
  onUpdate,
  onDelete,
}: {
  readonly workflow: Workflow | null;
  readonly selectedKey: string | null;
  readonly onUpdate: (step: WorkflowStep) => void;
  readonly onDelete: (key: string) => void;
}): ReactElement {
  const stepIndex =
    workflow?.definition.steps.findIndex((candidate) => candidate.key === selectedKey) ?? -1;
  const step =
    stepIndex >= 0
      ? (workflow?.definition.steps[stepIndex] ?? null)
      : (workflow?.definition.steps[0] ?? null);
  const editable = workflow?.status === 'draft' && Boolean(step);

  if (!step) {
    return (
      <aside className="inspector-card">
        <div className="inspector-head">
          <span>Inspector</span>
          <strong>No node selected</strong>
        </div>
        <div className="inspector-list">
          <div>
            <span>Mode</span>
            <b>Select a workflow step</b>
          </div>
        </div>
      </aside>
    );
  }

  function updateField<K extends keyof WorkflowStep>(key: K, value: WorkflowStep[K]): void {
    if (!step || !editable) return;
    onUpdate({ ...step, [key]: value });
  }

  function updateConfig(config: JsonRecord): void {
    if (!step || !editable) return;
    onUpdate({ ...step, config: { ...step.config, ...config } });
  }

  return (
    <aside className="inspector-card editable">
      <div className="inspector-head">
        <span>Inspector</span>
        <strong>{step.name}</strong>
      </div>
      <div className="inspector-list">
        <div>
          <span>Node</span>
          <b>{stepIndex >= 0 ? `Step ${stepIndex + 1}` : 'Selected node'}</b>
        </div>
        <div>
          <span>Type</span>
          <b>{labelFor(step.type)}</b>
        </div>
        <div>
          <span>Timeout</span>
          <b>{step.timeoutMs ? `${Math.round(step.timeoutMs / 1000)} s` : 'Default'}</b>
        </div>
        <div>
          <span>Mode</span>
          <b>{workflow?.status === 'draft' ? 'Editable draft' : 'Protected snapshot'}</b>
        </div>
      </div>
      <div className="step-editor-form">
        <TextField
          label="Step name"
          value={step.name}
          disabled={!editable}
          onChange={(event) => updateField('name', event.target.value)}
        />
        <SelectField
          label="Step type"
          value={step.type}
          disabled={!editable}
          onChange={(event) =>
            onUpdate({
              ...step,
              type: event.target.value,
              config: defaultStepConfig(event.target.value),
              timeoutMs: event.target.value === 'http' ? 15000 : 10000,
            })
          }
        >
          <option value="condition">Decision</option>
          <option value="http">Request</option>
          <option value="ai_decision">Classifier</option>
          <option value="notification">Notify</option>
        </SelectField>
        <TextField
          label="Timeout seconds"
          type="number"
          min="1"
          max="300"
          value={Math.round((step.timeoutMs ?? 10000) / 1000)}
          disabled={!editable}
          onChange={(event) =>
            updateField('timeoutMs', Math.max(1, Number(event.target.value)) * 1000)
          }
        />
        <StepConfigFields step={step} editable={editable} onConfig={updateConfig} />
        <TransitionEditor
          step={step}
          steps={workflow?.definition.steps ?? []}
          editable={editable}
          onUpdate={onUpdate}
        />
        <AdvancedConfigEditor
          step={step}
          editable={editable}
          onConfig={(config) => onUpdate({ ...step, config })}
        />
      </div>
      <div className="inspector-actions">
        <Button
          size="sm"
          tone="danger"
          disabled={!editable || (workflow?.definition.steps.length ?? 0) <= 1}
          onClick={() => onDelete(step.key)}
        >
          Delete step
        </Button>
      </div>
    </aside>
  );
}

function TransitionEditor({
  step,
  steps,
  editable,
  onUpdate,
}: {
  readonly step: WorkflowStep;
  readonly steps: readonly WorkflowStep[];
  readonly editable: boolean;
  readonly onUpdate: (step: WorkflowStep) => void;
}): ReactElement {
  const transitions = readRecord(step.transitions);
  const options = steps.filter((candidate) => candidate.key !== step.key);
  const branches = readRecord(transitions.branches);
  const branchEntries = Object.entries(branches).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string',
  );

  function updateTransitions(nextTransitions: JsonRecord): void {
    onUpdate({ ...step, transitions: compactRecord(nextTransitions) });
  }

  function updateTransition(key: string, value: string): void {
    if (!editable) return;
    const nextTransitions = { ...transitions };
    if (value.length === 0) delete nextTransitions[key];
    else nextTransitions[key] = value;
    updateTransitions(nextTransitions);
  }

  function updateBranchTarget(branchKey: string, value: string): void {
    if (!editable) return;
    const nextBranches = { ...branches };
    if (value.length === 0) delete nextBranches[branchKey];
    else nextBranches[branchKey] = value;
    updateTransitions({ ...transitions, branches: compactRecord(nextBranches) });
  }

  function renameBranch(previousKey: string, nextKey: string): void {
    if (!editable) return;
    const normalizedKey = normalizeBranchKey(nextKey);
    if (!normalizedKey || normalizedKey === previousKey) return;
    const nextBranches = { ...branches };
    const currentTarget = nextBranches[previousKey];
    delete nextBranches[previousKey];
    if (typeof currentTarget === 'string') nextBranches[normalizedKey] = currentTarget;
    updateTransitions({ ...transitions, branches: compactRecord(nextBranches) });
  }

  function addBranchRoute(): void {
    if (!editable || options.length === 0) return;
    const nextKey = nextBranchKey(branches);
    updateTransitions({
      ...transitions,
      branches: { ...branches, [nextKey]: options[0]?.key ?? '' },
    });
  }

  return (
    <div className="transition-editor route-editor">
      <div className="route-editor-heading">
        <div>
          <span className="section-label">Routing</span>
          <strong>Execution targets</strong>
        </div>
        <Button size="sm" disabled={!editable || options.length === 0} onClick={addBranchRoute}>
          Add branch
        </Button>
      </div>
      <div className="route-target-grid">
        <SelectField
          label="Success target"
          value={readString(transitions.onSuccess, '')}
          disabled={!editable}
          onChange={(event) => updateTransition('onSuccess', event.target.value)}
        >
          <option value="">Use saved order</option>
          {options.map((option) => (
            <option key={option.key} value={option.key}>
              {option.name}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Failure target"
          value={readString(transitions.onFailure, '')}
          disabled={!editable}
          onChange={(event) => updateTransition('onFailure', event.target.value)}
        >
          <option value="">No failure route</option>
          {options.map((option) => (
            <option key={option.key} value={option.key}>
              {option.name}
            </option>
          ))}
        </SelectField>
      </div>
      <div className="branch-route-list">
        {branchEntries.length === 0 ? (
          <div className="branch-route-empty">
            Add branch routes when a step returns a branch value such as qualified, rejected, or
            review.
          </div>
        ) : null}
        {branchEntries.map(([branchKey, targetKey]) => (
          <BranchRouteRow
            key={branchKey}
            branchKey={branchKey}
            targetKey={targetKey}
            options={options}
            editable={editable}
            onRename={renameBranch}
            onTargetChange={updateBranchTarget}
          />
        ))}
      </div>
    </div>
  );
}

function BranchRouteRow({
  branchKey,
  targetKey,
  options,
  editable,
  onRename,
  onTargetChange,
}: {
  readonly branchKey: string;
  readonly targetKey: string;
  readonly options: readonly WorkflowStep[];
  readonly editable: boolean;
  readonly onRename: (previousKey: string, nextKey: string) => void;
  readonly onTargetChange: (branchKey: string, targetKey: string) => void;
}): ReactElement {
  const [draftKey, setDraftKey] = useState(branchKey);

  useEffect(() => {
    setDraftKey(branchKey);
  }, [branchKey]);

  return (
    <div className="branch-route-row">
      <TextField
        label="Branch"
        value={draftKey}
        disabled={!editable}
        onBlur={() => onRename(branchKey, draftKey)}
        onChange={(event) => setDraftKey(normalizeBranchKey(event.target.value))}
      />
      <SelectField
        label="Target"
        value={targetKey}
        disabled={!editable}
        onChange={(event) => onTargetChange(branchKey, event.target.value)}
      >
        <option value="">No target</option>
        {options.map((option) => (
          <option key={option.key} value={option.key}>
            {option.name}
          </option>
        ))}
      </SelectField>
      <Button
        size="sm"
        tone="danger"
        disabled={!editable}
        onClick={() => onTargetChange(branchKey, '')}
      >
        Remove
      </Button>
    </div>
  );
}
function AdvancedConfigEditor({
  step,
  editable,
  onConfig,
}: {
  readonly step: WorkflowStep;
  readonly editable: boolean;
  readonly onConfig: (config: JsonRecord) => void;
}): ReactElement {
  const [draft, setDraft] = useState(() => stringifyRecord(step.config));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(stringifyRecord(step.config));
    setError(null);
  }, [step.key, step.config]);

  function updateDraft(value: string): void {
    setDraft(value);
    if (!editable) return;
    try {
      const parsed = JSON.parse(value) as unknown;
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        setError('Configuration must be an object.');
        return;
      }
      setError(null);
      onConfig(parsed as JsonRecord);
    } catch {
      setError('Configuration is not valid yet.');
    }
  }

  return (
    <div className="advanced-config-editor">
      <TextAreaField
        label="Advanced configuration"
        value={draft}
        rows={7}
        disabled={!editable}
        onChange={(event) => updateDraft(event.target.value)}
      />
      {error ? <span className="field-error">{error}</span> : null}
    </div>
  );
}

function StepConfigFields({
  step,
  editable,
  onConfig,
}: {
  readonly step: WorkflowStep;
  readonly editable: boolean;
  readonly onConfig: (config: JsonRecord) => void;
}): ReactElement {
  if (step.type === 'http') {
    const request = readRecord(step.config.request);
    const auth = readRecord(step.config.auth);
    const response = readRecord(step.config.response);
    return (
      <>
        <SelectField
          label="Method"
          value={readString(request.method, 'POST')}
          disabled={!editable}
          onChange={(event) => onConfig({ request: { ...request, method: event.target.value } })}
        >
          {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((method) => (
            <option key={method} value={method}>
              {method}
            </option>
          ))}
        </SelectField>
        <TextField
          label="Request URL"
          value={readString(request.url, 'https://echo.free.beeceptor.com')}
          disabled={!editable}
          onChange={(event) => onConfig({ request: { ...request, url: event.target.value } })}
        />
        <SelectField
          label="Auth mode"
          value={readString(auth.mode, 'none')}
          disabled={!editable}
          onChange={(event) => onConfig({ auth: buildAuthConfig(event.target.value) })}
        >
          <option value="none">None</option>
          <option value="bearer">Bearer token</option>
          <option value="basic">Basic credential</option>
          <option value="api_key">API key</option>
          <option value="custom_header">Custom header</option>
        </SelectField>
        <TextField
          label="Success codes"
          value={readArray(response.successStatusCodes, [200, 201, 202, 204]).join(', ')}
          disabled={!editable}
          onChange={(event) =>
            onConfig({
              response: { ...response, successStatusCodes: readStatusCodes(event.target.value) },
            })
          }
        />
      </>
    );
  }

  if (step.type === 'ai_decision') {
    return (
      <>
        <TextAreaField
          label="Instruction"
          value={readInstruction(step.config)}
          disabled={!editable}
          rows={4}
          onChange={(event) =>
            onConfig(
              buildAiConfig(event.target.value, readString(step.config.branchPath, 'branch')),
            )
          }
        />
        <TextField
          label="Branch path"
          value={readString(step.config.branchPath, 'branch')}
          disabled={!editable}
          onChange={(event) => onConfig({ branchPath: event.target.value })}
        />
      </>
    );
  }

  if (step.type === 'notification') {
    return (
      <>
        <SelectField
          label="Provider"
          value={readString(step.config.provider, 'slack')}
          disabled={!editable}
          onChange={(event) => onConfig({ provider: event.target.value })}
        >
          <option value="slack">Slack</option>
          <option value="discord">Discord</option>
        </SelectField>
        <TextField
          label="Title"
          value={readString(step.config.title, 'Runlane workflow update')}
          disabled={!editable}
          onChange={(event) => onConfig({ title: event.target.value })}
        />
        <TextAreaField
          label="Message"
          value={readString(step.config.message, 'Workflow execution completed.')}
          disabled={!editable}
          rows={3}
          onChange={(event) => onConfig({ message: event.target.value })}
        />
        <SelectField
          label="Severity"
          value={readString(step.config.severity, 'info')}
          disabled={!editable}
          onChange={(event) => onConfig({ severity: event.target.value })}
        >
          <option value="info">Info</option>
          <option value="warning">Warning</option>
          <option value="error">Error</option>
        </SelectField>
      </>
    );
  }

  return (
    <>
      <SelectField
        label="Decision result"
        value={readString(step.config.branch, 'success')}
        disabled={!editable}
        onChange={(event) =>
          onConfig({ branch: event.target.value, pass: event.target.value !== 'failure' })
        }
      >
        <option value="success">Success branch</option>
        <option value="failure">Failure branch</option>
      </SelectField>
      <TextField
        label="Delay milliseconds"
        type="number"
        min="0"
        max="300000"
        value={readNumber(step.config.delayMs, 0)}
        disabled={!editable}
        onChange={(event) => onConfig({ delayMs: Math.max(0, Number(event.target.value)) })}
      />
    </>
  );
}

export function createVisualStep(type: WorkflowStepType, index: number): WorkflowStep {
  const key = `${type.replace(/[^a-z0-9]/g, '_')}_${index}`;
  return {
    key,
    name: titleFor(type),
    type,
    config: defaultStepConfig(type),
    timeoutMs: type === 'http' ? 15000 : 10000,
  };
}

export function defaultStepConfig(type: string): JsonRecord {
  if (type === 'http') {
    return {
      request: {
        method: 'POST',
        url: 'https://echo.free.beeceptor.com',
        bodyType: 'json',
        body: { event: 'workflow.execution' },
      },
      auth: { mode: 'none' },
      response: {
        successStatusCodes: [200, 201, 202, 204],
        retryStatusCodes: [408, 425, 429, 500, 502, 503, 504],
        includeHeaders: false,
      },
    };
  }
  if (type === 'ai_decision')
    return buildAiConfig('Classify the incoming payload and return a branch value.', 'branch');
  if (type === 'notification')
    return {
      provider: 'slack',
      title: 'Runlane workflow update',
      message: 'Workflow execution completed.',
      severity: 'info',
      includeExecutionContext: true,
    };
  return { pass: true, branch: 'success' };
}

function buildAiConfig(instruction: string, branchPath: string): JsonRecord {
  return {
    messages: [{ role: 'user', content: instruction }],
    schema: {
      type: 'object',
      required: ['branch', 'summary'],
      properties: {
        branch: { type: 'string' },
        summary: { type: 'string' },
      },
    },
    branchPath,
  };
}

function buildAuthConfig(mode: string): JsonRecord {
  if (mode === 'bearer' || mode === 'basic')
    return { mode, credentialName: 'primary_http_endpoint' };
  if (mode === 'api_key')
    return {
      mode,
      credentialName: 'primary_http_endpoint',
      location: 'header',
      name: 'X-Api-Key',
    };
  if (mode === 'custom_header')
    return { mode, credentialName: 'primary_http_endpoint', name: 'X-Credential' };
  return { mode: 'none' };
}

function buildWorkflowEdges(steps: readonly WorkflowStep[]): readonly WorkflowEdge[] {
  const stepKeys = new Set(steps.map((step) => step.key));
  const explicitTargets = new Set<string>();
  const collected: Omit<WorkflowEdge, 'offset'>[] = [];

  steps.forEach((step) => {
    const transitions = readRecord(step.transitions);
    const successTarget = readTransitionTarget(transitions.onSuccess, stepKeys);
    const branchTargets = Object.values(readRecord(transitions.branches)).filter(
      (target): target is string => typeof target === 'string' && stepKeys.has(target),
    );
    if (successTarget) explicitTargets.add(successTarget);
    branchTargets.forEach((target) => explicitTargets.add(target));
  });

  steps.forEach((step, index) => {
    const transitions = readRecord(step.transitions);
    const successTarget = readTransitionTarget(transitions.onSuccess, stepKeys);
    const failureTarget = readTransitionTarget(transitions.onFailure, stepKeys);
    const branchEntries = Object.entries(readRecord(transitions.branches)).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string' && stepKeys.has(entry[1]),
    );

    branchEntries.forEach(([branch, target]) => {
      collected.push({
        id: `${step.key}:branch:${branch}:${target}`,
        sourceKey: step.key,
        targetKey: target,
        label: `Branch ${branch}`,
        kind: 'branch',
        explicit: true,
      });
    });

    if (successTarget) {
      collected.push({
        id: `${step.key}:success:${successTarget}`,
        sourceKey: step.key,
        targetKey: successTarget,
        label: 'Success',
        kind: 'success',
        explicit: true,
      });
    }

    if (failureTarget) {
      collected.push({
        id: `${step.key}:failure:${failureTarget}`,
        sourceKey: step.key,
        targetKey: failureTarget,
        label: 'Failure',
        kind: 'failure',
        explicit: true,
      });
    }

    const nextStep = steps[index + 1];
    if (!successTarget && !explicitTargets.has(step.key) && nextStep) {
      collected.push({
        id: `${step.key}:next:${nextStep.key}`,
        sourceKey: step.key,
        targetKey: nextStep.key,
        label: 'Saved order',
        kind: 'next',
        explicit: false,
      });
    }
  });

  const grouped = new Map<string, number>();
  collected.forEach((edge) => {
    const key = `${edge.sourceKey}->${edge.targetKey}`;
    grouped.set(key, (grouped.get(key) ?? 0) + 1);
  });

  const used = new Map<string, number>();
  return collected.map((edge) => {
    const key = `${edge.sourceKey}->${edge.targetKey}`;
    const count = grouped.get(key) ?? 1;
    const current = used.get(key) ?? 0;
    used.set(key, current + 1);
    return { ...edge, offset: current - (count - 1) / 2 };
  });
}

function summarizeRouteMetrics(edges: readonly WorkflowEdge[]): RouteMetrics {
  return edges.reduce<RouteMetrics>((metrics, edge) => {
    const source = metrics[edge.sourceKey] ?? { incoming: 0, outgoing: 0 };
    const target = metrics[edge.targetKey] ?? { incoming: 0, outgoing: 0 };
    return {
      ...metrics,
      [edge.sourceKey]: { ...source, outgoing: source.outgoing + 1 },
      [edge.targetKey]: { ...target, incoming: target.incoming + 1 },
    };
  }, {});
}

function buildEdgeGeometry(source: NodePosition, target: NodePosition, offset: number): EdgeRoute {
  const candidate = chooseEdgeCandidate(source, target);
  const sourceNormal = sideNormal(candidate.sourceSide);
  const targetNormal = sideNormal(candidate.targetSide);
  const sourceTangent = sideTangent(candidate.sourceSide);
  const targetTangent = sideTangent(candidate.targetSide);
  const offsetAmount = offset * 42;
  const start = {
    x: candidate.start.x + sourceTangent.x * offsetAmount,
    y: candidate.start.y + sourceTangent.y * offsetAmount,
  };
  const end = {
    x: candidate.end.x + targetTangent.x * offsetAmount,
    y: candidate.end.y + targetTangent.y * offsetAmount,
  };
  const directDistance = pointDistance(start, end);
  const bend = Math.min(260, Math.max(78, directDistance * 0.34));
  const verticalBias =
    Math.abs(start.y - end.y) > Math.abs(start.x - end.x) ? offsetAmount * 0.25 : 0;
  const horizontalBias =
    Math.abs(start.x - end.x) >= Math.abs(start.y - end.y) ? offsetAmount * 0.25 : 0;
  const controlA = {
    x: start.x + sourceNormal.x * bend + horizontalBias * Math.abs(sourceNormal.y),
    y: start.y + sourceNormal.y * bend + verticalBias * Math.abs(sourceNormal.x),
  };
  const controlB = {
    x: end.x + targetNormal.x * bend - horizontalBias * Math.abs(targetNormal.y),
    y: end.y + targetNormal.y * bend - verticalBias * Math.abs(targetNormal.x),
  };
  const label = cubicPoint(start, controlA, controlB, end, 0.5);

  return {
    path: `M ${start.x} ${start.y} C ${controlA.x} ${controlA.y}, ${controlB.x} ${
      controlB.y
    }, ${end.x} ${end.y}`,
    label,
    start,
    end,
    sourceSide: candidate.sourceSide,
    targetSide: candidate.targetSide,
  };
}

function chooseEdgeCandidate(source: NodePosition, target: NodePosition): EdgeCandidate {
  const sourceCenter = nodeCenter(source);
  const targetCenter = nodeCenter(target);
  const vector = { x: targetCenter.x - sourceCenter.x, y: targetCenter.y - sourceCenter.y };
  const vectorLength = Math.max(1, Math.hypot(vector.x, vector.y));
  const direction = { x: vector.x / vectorLength, y: vector.y / vectorLength };
  const sides: readonly EdgeSide[] = ['right', 'left', 'bottom', 'top'];

  return sides
    .flatMap((sourceSide) =>
      sides.map((targetSide) => {
        const start = sideAnchor(source, sourceSide);
        const end = sideAnchor(target, targetSide);
        const sourceNormal = sideNormal(sourceSide);
        const targetNormal = sideNormal(targetSide);
        const sourceAlignment = dot(sourceNormal, direction);
        const targetAlignment = dot(targetNormal, { x: -direction.x, y: -direction.y });
        const distance = Math.abs(start.x - end.x) + Math.abs(start.y - end.y);
        const alignmentPenalty = (1 - sourceAlignment) * 120 + (1 - targetAlignment) * 120;
        const reversalPenalty = sourceAlignment < -0.1 || targetAlignment < -0.1 ? 140 : 0;
        const crossingPenalty = crossesThroughNode(source, target, start, end) ? 180 : 0;
        const sameAxisPenalty = sourceSide === targetSide ? 32 : 0;
        return {
          sourceSide,
          targetSide,
          start,
          end,
          score: distance + alignmentPenalty + reversalPenalty + crossingPenalty + sameAxisPenalty,
        };
      }),
    )
    .sort((a, b) => a.score - b.score)[0];
}

function nodeCenter(position: NodePosition): EdgePoint {
  return { x: position.x + nodeBox.width / 2, y: position.y + nodeBox.height / 2 };
}

function sideAnchor(position: NodePosition, side: EdgeSide): EdgePoint {
  if (side === 'left') return { x: position.x + 8, y: position.y + nodeBox.height / 2 };
  if (side === 'right')
    return { x: position.x + nodeBox.width - 8, y: position.y + nodeBox.height / 2 };
  if (side === 'top') return { x: position.x + nodeBox.width / 2, y: position.y + 8 };
  return { x: position.x + nodeBox.width / 2, y: position.y + nodeBox.height - 8 };
}

function sideNormal(side: EdgeSide): EdgePoint {
  if (side === 'left') return { x: -1, y: 0 };
  if (side === 'right') return { x: 1, y: 0 };
  if (side === 'top') return { x: 0, y: -1 };
  return { x: 0, y: 1 };
}

function sideTangent(side: EdgeSide): EdgePoint {
  if (side === 'left' || side === 'right') return { x: 0, y: 1 };
  return { x: 1, y: 0 };
}

function dot(a: EdgePoint, b: EdgePoint): number {
  return a.x * b.x + a.y * b.y;
}

function pointDistance(a: EdgePoint, b: EdgePoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function crossesThroughNode(
  source: NodePosition,
  target: NodePosition,
  start: EdgePoint,
  end: EdgePoint,
): boolean {
  const sourceBounds = nodeBounds(source, 18);
  const targetBounds = nodeBounds(target, 18);
  const midpoint = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  return pointInsideBounds(midpoint, sourceBounds) || pointInsideBounds(midpoint, targetBounds);
}

function nodeBounds(
  position: NodePosition,
  inset: number,
): {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
} {
  return {
    left: position.x + inset,
    right: position.x + nodeBox.width - inset,
    top: position.y + inset,
    bottom: position.y + nodeBox.height - inset,
  };
}

function pointInsideBounds(
  point: EdgePoint,
  bounds: {
    readonly left: number;
    readonly right: number;
    readonly top: number;
    readonly bottom: number;
  },
): boolean {
  return (
    point.x >= bounds.left &&
    point.x <= bounds.right &&
    point.y >= bounds.top &&
    point.y <= bounds.bottom
  );
}

function cubicPoint(a: EdgePoint, b: EdgePoint, c: EdgePoint, d: EdgePoint, t: number): EdgePoint {
  const mt = 1 - t;
  return {
    x: mt ** 3 * a.x + 3 * mt ** 2 * t * b.x + 3 * mt * t ** 2 * c.x + t ** 3 * d.x,
    y: mt ** 3 * a.y + 3 * mt ** 2 * t * b.y + 3 * mt * t ** 2 * c.y + t ** 3 * d.y,
  };
}

function readTransitionTarget(value: unknown, stepKeys: ReadonlySet<string>): string | null {
  return typeof value === 'string' && stepKeys.has(value) ? value : null;
}

function compactRecord(value: JsonRecord): JsonRecord {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => {
      if (item === undefined || item === null) return false;
      if (typeof item === 'object' && !Array.isArray(item)) {
        return Object.keys(item).length > 0;
      }
      return true;
    }),
  ) as JsonRecord;
}

function normalizeBranchKey(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.:-]/g, '').slice(0, 80);
}

function nextBranchKey(branches: JsonRecord): string {
  const preferred = ['success', 'failure', 'review', 'qualified', 'rejected'];
  const availablePreferred = preferred.find((candidate) => !(candidate in branches));
  if (availablePreferred) return availablePreferred;
  let index = 1;
  while (`branch_${index}` in branches) index += 1;
  return `branch_${index}`;
}

function createPositions(steps: readonly WorkflowStep[]): NodeMap {
  if (steps.length === 0) return {};
  const edges = buildWorkflowEdges(steps);
  const indexByKey = new Map(steps.map((step, index) => [step.key, index]));
  const rankByKey = new Map<string, number>();
  steps.forEach((step, index) => rankByKey.set(step.key, Math.min(index, 2)));

  for (let iteration = 0; iteration < steps.length + 3; iteration += 1) {
    let changed = false;
    edges.forEach((edge) => {
      const currentSourceRank = rankByKey.get(edge.sourceKey) ?? 0;
      const currentTargetRank = rankByKey.get(edge.targetKey) ?? 0;
      const nextTargetRank = Math.max(currentTargetRank, currentSourceRank + 1);
      if (nextTargetRank !== currentTargetRank && nextTargetRank < steps.length + 2) {
        rankByKey.set(edge.targetKey, nextTargetRank);
        changed = true;
      }
    });
    if (!changed) break;
  }

  const groups = new Map<number, WorkflowStep[]>();
  steps.forEach((step) => {
    const rank = rankByKey.get(step.key) ?? 0;
    groups.set(rank, [...(groups.get(rank) ?? []), step]);
  });

  const positions: NodeMap = {};
  const horizontalGap = 430;
  const verticalGap = 238;
  const wave = [0, 118, 42, 188, 82];
  Array.from(groups.entries())
    .sort(([rankA], [rankB]) => rankA - rankB)
    .forEach(([rank, rankSteps]) => {
      const sortedSteps = [...rankSteps].sort(
        (a, b) => (indexByKey.get(a.key) ?? 0) - (indexByKey.get(b.key) ?? 0),
      );
      const groupOffset = Math.max(0, (3 - sortedSteps.length) * 34);
      sortedSteps.forEach((step, lane) => {
        positions[step.key] = {
          x: 72 + rank * horizontalGap,
          y: 86 + groupOffset + lane * verticalGap + wave[rank % wave.length],
        };
      });
    });

  return positions;
}

function normalizeLayout(layout: NodeMap, steps: readonly WorkflowStep[]): NodeMap {
  const bounds = layoutBounds(layout, steps);
  if (!bounds) return layout;
  const shiftX = bounds.left < 56 ? 56 - bounds.left : 0;
  const shiftY = bounds.top < 56 ? 56 - bounds.top : 0;
  if (shiftX === 0 && shiftY === 0) return layout;
  return Object.fromEntries(
    Object.entries(layout).map(([key, position]) => [
      key,
      { x: position.x + shiftX, y: position.y + shiftY },
    ]),
  );
}

function buildCanvasExtent(layout: NodeMap, steps: readonly WorkflowStep[]): CanvasExtent {
  const bounds = layoutBounds(layout, steps);
  if (!bounds) return canvasSize;
  return {
    width: Math.max(canvasSize.width, bounds.right + 260),
    height: Math.max(canvasSize.height, bounds.bottom + 220),
  };
}

function clampCanvasPosition(position: NodePosition, extent: CanvasExtent): NodePosition {
  return {
    x: Math.min(extent.width - nodeBox.width - 56, Math.max(56, position.x)),
    y: Math.min(extent.height - nodeBox.height - 56, Math.max(56, position.y)),
  };
}

function centerCanvasView(
  board: HTMLDivElement,
  layout: NodeMap,
  steps: readonly WorkflowStep[],
  zoom: number,
  extent: CanvasExtent,
): void {
  const bounds = layoutBounds(layout, steps);
  if (!bounds) return;
  const centerX = Math.min(extent.width * zoom, ((bounds.left + bounds.right) / 2) * zoom);
  const centerY = Math.min(extent.height * zoom, ((bounds.top + bounds.bottom) / 2) * zoom);
  board.scrollTo({
    left: Math.max(0, centerX - board.clientWidth / 2),
    top: Math.max(0, centerY - board.clientHeight / 2),
    behavior: 'smooth',
  });
}

function layoutBounds(
  layout: NodeMap,
  steps: readonly WorkflowStep[],
): {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
} | null {
  const positions = steps.map((step) => layout[step.key]).filter(isPresent);
  if (positions.length === 0) return null;
  return {
    left: Math.min(...positions.map((position) => position.x)),
    right: Math.max(...positions.map((position) => position.x + nodeBox.width)),
    top: Math.min(...positions.map((position) => position.y)),
    bottom: Math.max(...positions.map((position) => position.y + nodeBox.height)),
  };
}

function isCanvasPanTarget(target: EventTarget): boolean {
  return target instanceof HTMLElement
    ? !target.closest(
        'button, input, textarea, select, a, .canvas-node, .workflow-edge, .canvas-tools, .canvas-node-actions',
      )
    : false;
}

function isInteractiveTarget(target: EventTarget): boolean {
  return target instanceof HTMLElement
    ? Boolean(target.closest('button, input, textarea, select, a, .canvas-node-actions'))
    : false;
}

function stepName(steps: readonly WorkflowStep[], key: string): string {
  return steps.find((step) => step.key === key)?.name ?? key;
}

function isPresent<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

function clampZoom(value: number): number {
  return Math.min(maxZoom, Math.max(minZoom, value));
}

function iconFor(type: WorkflowStepType): string {
  if (type === 'http') return '↗';
  if (type === 'ai_decision') return 'CL';
  if (type === 'notification') return '✉';
  return '◇';
}

function labelFor(type: WorkflowStepType): string {
  if (type === 'http') return 'Request';
  if (type === 'ai_decision') return 'Classifier';
  if (type === 'notification') return 'Notify';
  return titleCase(type);
}

function titleFor(type: WorkflowStepType): string {
  if (type === 'http') return 'Request';
  if (type === 'ai_decision') return 'Classifier';
  if (type === 'notification') return 'Notify team';
  return 'Decision';
}

function stringifyRecord(value: JsonRecord): string {
  return JSON.stringify(value, null, 2);
}

function readRecord(value: unknown): JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function readString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function readArray(value: unknown, fallback: readonly number[]): readonly number[] {
  return Array.isArray(value)
    ? value.filter((item): item is number => typeof item === 'number')
    : fallback;
}

function readStatusCodes(value: string): readonly number[] {
  const codes = value
    .split(',')
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isInteger(item) && item >= 100 && item <= 599);
  return codes.length > 0 ? codes : [200, 201, 202, 204];
}

function readInstruction(config: JsonRecord): string {
  const messages = Array.isArray(config.messages) ? config.messages : [];
  const first = readRecord(messages[0]);
  return readString(first.content, 'Classify the incoming payload and return a branch value.');
}
