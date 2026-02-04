import type { WorkflowResponseDto } from '@runlane/contracts';
import {
  assertWorkspaceRole,
  ensureWorkflowCanBePublished,
  readWorkflowDefinition,
} from '@runlane/domain';
import type {
  AuditLogRepositoryPort,
  TransactionBoundary,
  WorkflowRepositoryPort,
  WorkspaceScopeRecord,
} from '../../ports';
import type { UseCase } from '../use-case';
import { workflowNotFound } from './workflow-errors';
import { buildWorkflowResponse } from './workflow-response';

export interface PublishWorkflowUseCaseInput {
  readonly scope: WorkspaceScopeRecord;
  readonly id: string;
  readonly userAgent: string | null;
  readonly ip: string | null;
}

export class PublishWorkflowUseCase implements UseCase<
  PublishWorkflowUseCaseInput,
  WorkflowResponseDto
> {
  constructor(
    private readonly workflows: WorkflowRepositoryPort,
    private readonly auditLogs: AuditLogRepositoryPort,
    private readonly transactionBoundary: TransactionBoundary,
  ) {}

  execute(input: PublishWorkflowUseCaseInput): Promise<WorkflowResponseDto> {
    assertWorkspaceRole(input.scope, ['owner']);

    return this.transactionBoundary.execute(async () => {
      const currentWorkflow = await this.workflows.findByWorkspaceId({
        workspaceId: input.scope.workspaceId,
        id: input.id,
      });

      if (!currentWorkflow) {
        throw workflowNotFound();
      }

      ensureWorkflowCanBePublished(currentWorkflow.status);
      readWorkflowDefinition(currentWorkflow.definition, {
        triggerType: currentWorkflow.triggerType,
      });

      if (currentWorkflow.status === 'published') {
        return buildWorkflowResponse(currentWorkflow);
      }

      const publishedAt = new Date();
      const workflow = await this.workflows.publishForWorkspace({
        workspaceId: input.scope.workspaceId,
        id: input.id,
        publishedAt,
      });

      if (!workflow) {
        throw workflowNotFound();
      }

      await this.auditLogs.create({
        workspaceId: input.scope.workspaceId,
        actorUserId: input.scope.userId,
        action: 'workflow.published',
        entityType: 'workflow',
        entityId: workflow.id,
        metadata: {
          name: workflow.name,
          version: workflow.version,
          triggerType: workflow.triggerType,
          publishedAt: workflow.publishedAt ? workflow.publishedAt.toISOString() : null,
        },
        ip: input.ip,
        userAgent: input.userAgent,
      });

      return buildWorkflowResponse(workflow);
    });
  }
}
