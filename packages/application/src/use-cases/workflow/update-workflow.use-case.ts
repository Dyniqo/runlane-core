import type { JsonValue, WorkflowResponseDto } from '@runlane/contracts';
import {
  assertWorkspaceRole,
  normalizeWorkflowName,
  normalizeWorkflowTriggerType,
  readWorkflowDefinition,
} from '@runlane/domain';
import type {
  AuditLogRepositoryPort,
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
    const name =
      input.name === undefined || input.name === null
        ? undefined
        : normalizeWorkflowName(input.name);
    const triggerType =
      input.triggerType === undefined || input.triggerType === null
        ? undefined
        : normalizeWorkflowTriggerType(input.triggerType);
    const definition = input.hasDefinition ? readWorkflowDefinition(input.definition) : undefined;

    if (name === undefined && triggerType === undefined && definition === undefined) {
      throw workflowUpdateEmpty();
    }

    return this.transactionBoundary.execute(async () => {
      const currentWorkflow = await this.workflows.findByWorkspaceId({
        workspaceId: input.scope.workspaceId,
        id: input.id,
      });

      if (!currentWorkflow) {
        throw workflowNotFound();
      }

      const workflow = await this.workflows.updateForWorkspace({
        workspaceId: input.scope.workspaceId,
        id: input.id,
        ...(name !== undefined ? { name } : {}),
        ...(triggerType !== undefined ? { triggerType } : {}),
        ...(definition !== undefined ? { definition } : {}),
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
          hasDefinition: definition !== undefined,
        }),
        ip: input.ip,
        userAgent: input.userAgent,
      });

      return buildWorkflowResponse(workflow);
    });
  }
}

function buildWorkflowUpdateMetadata(
  before: Readonly<{ name: string; triggerType: string; version: number }>,
  after: Readonly<{ name: string; triggerType: string; version: number }>,
  changes: Readonly<{ hasDefinition: boolean }>,
): JsonValue {
  return {
    previousName: before.name,
    nextName: after.name,
    previousTriggerType: before.triggerType,
    nextTriggerType: after.triggerType,
    previousVersion: before.version,
    nextVersion: after.version,
    definitionUpdated: changes.hasDefinition,
  };
}
