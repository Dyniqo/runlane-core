import type { CurrentWorkspaceResponseDto } from '@runlane/contracts';
import {
  assertWorkspaceRole,
  assertWorkspaceScopeMatches,
  normalizeWorkspaceName,
} from '@runlane/domain';
import type {
  AuditLogRepositoryPort,
  TransactionBoundary,
  WorkspaceRepositoryPort,
  WorkspaceScopeRecord,
} from '../../ports';
import type { UseCase } from '../use-case';
import { missingWorkspaceMembership } from './workspace-errors';
import { buildCurrentWorkspaceResponse } from './workspace-response';

export interface UpdateCurrentWorkspaceInput {
  readonly scope: WorkspaceScopeRecord;
  readonly name: string;
  readonly userAgent: string | null;
  readonly ip: string | null;
}

export class UpdateCurrentWorkspaceUseCase implements UseCase<
  UpdateCurrentWorkspaceInput,
  CurrentWorkspaceResponseDto
> {
  constructor(
    private readonly workspaces: WorkspaceRepositoryPort,
    private readonly auditLogs: AuditLogRepositoryPort,
    private readonly transactionBoundary: TransactionBoundary,
  ) {}

  execute(input: UpdateCurrentWorkspaceInput): Promise<CurrentWorkspaceResponseDto> {
    assertWorkspaceRole(input.scope, ['owner']);
    const name = normalizeWorkspaceName(input.name);

    return this.transactionBoundary.execute(async () => {
      const currentWorkspace = await this.workspaces.findWorkspaceForUser({
        userId: input.scope.userId,
        workspaceId: input.scope.workspaceId,
      });

      if (!currentWorkspace) {
        throw missingWorkspaceMembership();
      }

      const workspace = await this.workspaces.updateWorkspaceName({
        workspaceId: input.scope.workspaceId,
        actorUserId: input.scope.userId,
        name,
      });

      if (!workspace) {
        throw missingWorkspaceMembership();
      }

      assertWorkspaceScopeMatches(input.scope, workspace.id);

      await this.auditLogs.create({
        workspaceId: input.scope.workspaceId,
        actorUserId: input.scope.userId,
        action: 'workspace.updated',
        entityType: 'workspace',
        entityId: workspace.id,
        metadata: {
          previousName: currentWorkspace.name,
          nextName: workspace.name,
        },
        ip: input.ip,
        userAgent: input.userAgent,
      });

      return buildCurrentWorkspaceResponse({ workspace, scope: input.scope });
    });
  }
}
