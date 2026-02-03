import type { WorkflowResponseDto } from '@runlane/contracts';
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
import { buildWorkflowResponse } from './workflow-response';

export interface CreateWorkflowUseCaseInput {
  readonly scope: WorkspaceScopeRecord;
  readonly name: string;
  readonly triggerType: string | null | undefined;
  readonly definition: unknown;
  readonly userAgent: string | null;
  readonly ip: string | null;
}

export class CreateWorkflowUseCase implements UseCase<
  CreateWorkflowUseCaseInput,
  WorkflowResponseDto
> {
  constructor(
    private readonly workflows: WorkflowRepositoryPort,
    private readonly auditLogs: AuditLogRepositoryPort,
    private readonly transactionBoundary: TransactionBoundary,
  ) {}

  execute(input: CreateWorkflowUseCaseInput): Promise<WorkflowResponseDto> {
    assertWorkspaceRole(input.scope, ['owner']);
    const name = normalizeWorkflowName(input.name);
    const triggerType = normalizeWorkflowTriggerType(input.triggerType);
    const definition = readWorkflowDefinition(input.definition);

    return this.transactionBoundary.execute(async () => {
      const workflow = await this.workflows.createForWorkspace({
        workspaceId: input.scope.workspaceId,
        name,
        triggerType,
        definition,
      });

      await this.auditLogs.create({
        workspaceId: input.scope.workspaceId,
        actorUserId: input.scope.userId,
        action: 'workflow.created',
        entityType: 'workflow',
        entityId: workflow.id,
        metadata: {
          name: workflow.name,
          status: workflow.status,
          version: workflow.version,
          triggerType: workflow.triggerType,
        },
        ip: input.ip,
        userAgent: input.userAgent,
      });

      return buildWorkflowResponse(workflow);
    });
  }
}
