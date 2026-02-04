import type { JsonValue, WorkflowResponseDto } from '@runlane/contracts';
import {
  assertWorkspaceRole,
  ensureWorkflowCanBeUpdated,
  getWorkflowDefinitionTriggerType,
  normalizeWorkflowName,
  normalizeWorkflowTriggerType,
  readWorkflowDefinition,
  retargetWorkflowDefinitionTriggerType,
} from '@runlane/domain';
import type {
  AuditLogRepositoryPort,
  StoredWorkflowRecord,
  TransactionBoundary,
  WorkflowRepositoryPort,
  WorkspaceScopeRecord,
} from '../../ports';
import type { UseCase } from '../use-case';
import { workflowNotFound, workflowUpdateEmpty } from './workflow-errors';
import { buildWorkflowResponse } from './workflow-response';

export interface UpdateWorkflowUseCaseInput {
  readonly scope: WorkspaceScopeRecord;
  readonly id: string;
  readonly name: string | null | undefined;
  readonly triggerType: string | null | undefined;
  readonly definition: unknown;
  readonly hasDefinition: boolean;
  readonly userAgent: string | null;
  readonly ip: string | null;
}

export class UpdateWorkflowUseCase implements UseCase<
  UpdateWorkflowUseCaseInput,
  WorkflowResponseDto
> {
  constructor(
    private readonly workflows: WorkflowRepositoryPort,
    private readonly auditLogs: AuditLogRepositoryPort,
    private readonly transactionBoundary: TransactionBoundary,
  ) {}

  execute(input: UpdateWorkflowUseCaseInput): Promise<WorkflowResponseDto> {
    assertWorkspaceRole(input.scope, ['owner']);

    return this.transactionBoundary.execute(async () => {
      const currentWorkflow = await this.workflows.findByWorkspaceId({
        workspaceId: input.scope.workspaceId,
        id: input.id,
      });

      if (!currentWorkflow) {
        throw workflowNotFound();
      }

      ensureWorkflowCanBeUpdated(currentWorkflow.status);
      const update = buildWorkflowUpdateInput(input, currentWorkflow);

      if (
        update.name === undefined &&
        update.triggerType === undefined &&
        update.definition === undefined
      ) {
        throw workflowUpdateEmpty();
      }

      const workflow = await this.workflows.updateForWorkspace({
        workspaceId: input.scope.workspaceId,
        id: input.id,
        ...update,
        incrementVersion: true,
      });

      if (!workflow) {
        throw workflowNotFound();
      }

      await this.auditLogs.create({
        workspaceId: input.scope.workspaceId,
        actorUserId: input.scope.userId,
        action: 'workflow.updated',
        entityType: 'workflow',
        entityId: workflow.id,
        metadata: buildWorkflowUpdateMetadata(currentWorkflow, workflow, {
          hasDefinition: update.definition !== undefined,
        }),
        ip: input.ip,
        userAgent: input.userAgent,
      });

      return buildWorkflowResponse(workflow);
    });
  }
}

type NormalizedWorkflowUpdate = Readonly<{
  name?: string;
  triggerType?: string;
  definition?: JsonValue;
}>;

function buildWorkflowUpdateInput(
  input: UpdateWorkflowUseCaseInput,
  currentWorkflow: StoredWorkflowRecord,
): NormalizedWorkflowUpdate {
  const name =
    input.name === undefined || input.name === null ? undefined : normalizeWorkflowName(input.name);
  const requestedTriggerType =
    input.triggerType === undefined || input.triggerType === null
      ? undefined
      : normalizeWorkflowTriggerType(input.triggerType);

  if (input.hasDefinition) {
    const definition = readWorkflowDefinition(
      input.definition,
      requestedTriggerType === undefined ? {} : { triggerType: requestedTriggerType },
    );
    const triggerType = getWorkflowDefinitionTriggerType(definition);

    return {
      ...(name !== undefined ? { name } : {}),
      triggerType,
      definition,
    };
  }

  if (requestedTriggerType !== undefined) {
    const definition = retargetWorkflowDefinitionTriggerType(
      currentWorkflow.definition,
      requestedTriggerType,
    );

    return {
      ...(name !== undefined ? { name } : {}),
      triggerType: requestedTriggerType,
      definition,
    };
  }

  return {
    ...(name !== undefined ? { name } : {}),
  };
}

function buildWorkflowUpdateMetadata(
  before: Readonly<{ name: string; status: string; triggerType: string; version: number }>,
  after: Readonly<{ name: string; status: string; triggerType: string; version: number }>,
  changes: Readonly<{ hasDefinition: boolean }>,
): JsonValue {
  return {
    previousName: before.name,
    nextName: after.name,
    previousStatus: before.status,
    nextStatus: after.status,
    previousTriggerType: before.triggerType,
    nextTriggerType: after.triggerType,
    previousVersion: before.version,
    nextVersion: after.version,
    definitionUpdated: changes.hasDefinition,
  };
}
