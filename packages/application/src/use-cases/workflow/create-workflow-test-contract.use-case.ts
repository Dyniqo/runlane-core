import type { JsonValue, WorkflowTestResponseDto } from '@runlane/contracts';
import {
  assertWorkspaceRole,
  DomainError,
  readWorkflowDefinition,
  readWorkflowTestPayload,
} from '@runlane/domain';
import type {
  AuditLogRepositoryPort,
  TransactionBoundary,
  WorkflowRepositoryPort,
  WorkspaceScopeRecord,
} from '../../ports';
import type { UseCase } from '../use-case';
import { workflowNotFound } from './workflow-errors';

const DEFAULT_TEST_SOURCE = 'manual_test';
const WORKFLOW_TEST_SOURCE_MAX_LENGTH = 64;
const WORKFLOW_TEST_IDEMPOTENCY_KEY_MAX_LENGTH = 160;
const WORKFLOW_TEST_SOURCE_PATTERN = /^[a-z][a-z0-9_.:-]*$/;

export interface CreateWorkflowTestContractUseCaseInput {
  readonly scope: WorkspaceScopeRecord;
  readonly id: string;
  readonly payload: unknown;
  readonly source: string | null | undefined;
  readonly idempotencyKey: string | null | undefined;
  readonly userAgent: string | null;
  readonly ip: string | null;
}

export class CreateWorkflowTestContractUseCase implements UseCase<
  CreateWorkflowTestContractUseCaseInput,
  WorkflowTestResponseDto
> {
  constructor(
    private readonly workflows: WorkflowRepositoryPort,
    private readonly auditLogs: AuditLogRepositoryPort,
    private readonly transactionBoundary: TransactionBoundary,
  ) {}

  execute(input: CreateWorkflowTestContractUseCaseInput): Promise<WorkflowTestResponseDto> {
    assertWorkspaceRole(input.scope, ['owner']);
    const source = normalizeWorkflowTestSource(input.source);
    const idempotencyKey = normalizeWorkflowTestIdempotencyKey(input.idempotencyKey);
    const payload = readWorkflowTestPayload(input.payload);

    return this.transactionBoundary.execute(async () => {
      const workflow = await this.workflows.findByWorkspaceId({
        workspaceId: input.scope.workspaceId,
        id: input.id,
      });

      if (!workflow) {
        throw workflowNotFound();
      }

      const definition = readWorkflowDefinition(workflow.definition, {
        triggerType: workflow.triggerType,
      });
      const acceptedAt = new Date();

      await this.auditLogs.create({
        workspaceId: input.scope.workspaceId,
        actorUserId: input.scope.userId,
        action: 'workflow.test_contract.created',
        entityType: 'workflow',
        entityId: workflow.id,
        metadata: {
          publicId: workflow.publicId,
          version: workflow.version,
          triggerType: workflow.triggerType,
          workflowStatus: workflow.status,
          source,
          hasIdempotencyKey: idempotencyKey !== null,
          acceptedAt: acceptedAt.toISOString(),
        },
        ip: input.ip,
        userAgent: input.userAgent,
      });

      return {
        contract: {
          mode: 'contract',
          workflowId: workflow.id,
          workflowPublicId: workflow.publicId,
          workspaceId: workflow.workspaceId,
          workflowVersion: workflow.version,
          triggerType: workflow.triggerType,
          workflowStatus: workflow.status,
          entryStepKey: definition.entryStepKey,
          stepCount: definition.steps.length,
          source,
          idempotencyKey,
          payload: payload as JsonValue,
          acceptedAt: acceptedAt.toISOString(),
        },
      };
    });
  }
}

function normalizeWorkflowTestSource(source: string | null | undefined): string {
  const normalizedSource = (source ?? DEFAULT_TEST_SOURCE).trim().toLowerCase();

  if (
    normalizedSource.length < 2 ||
    normalizedSource.length > WORKFLOW_TEST_SOURCE_MAX_LENGTH ||
    !WORKFLOW_TEST_SOURCE_PATTERN.test(normalizedSource)
  ) {
    throw workflowTestContractInvalid('Workflow test source is invalid');
  }

  return normalizedSource;
}

function normalizeWorkflowTestIdempotencyKey(
  idempotencyKey: string | null | undefined,
): string | null {
  if (idempotencyKey === undefined || idempotencyKey === null) {
    return null;
  }

  const normalizedKey = idempotencyKey.trim();

  if (normalizedKey.length < 8 || normalizedKey.length > WORKFLOW_TEST_IDEMPOTENCY_KEY_MAX_LENGTH) {
    throw workflowTestContractInvalid('Workflow test idempotency key is invalid');
  }

  return normalizedKey;
}

function workflowTestContractInvalid(message: string): DomainError {
  return new DomainError({
    code: 'WORKFLOW_TEST_CONTRACT_INVALID',
    category: 'validation',
    message,
  });
}
