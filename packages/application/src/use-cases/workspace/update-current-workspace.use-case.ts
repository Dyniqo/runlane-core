import type { CurrentWorkspaceResponseDto } from '@runlane/contracts';
import {
  assertWorkspaceRole,
  assertWorkspaceScopeMatches,
  normalizeWorkspaceName,
} from '@runlane/domain';
import type { WorkspaceRepositoryPort, WorkspaceScopeRecord } from '../../ports';
import type { UseCase } from '../use-case';
import { missingWorkspaceMembership } from './workspace-errors';
import { buildCurrentWorkspaceResponse } from './workspace-response';

export interface UpdateCurrentWorkspaceInput {
  readonly scope: WorkspaceScopeRecord;
  readonly name: string;
}

export class UpdateCurrentWorkspaceUseCase implements UseCase<
  UpdateCurrentWorkspaceInput,
  CurrentWorkspaceResponseDto
> {
  constructor(private readonly workspaces: WorkspaceRepositoryPort) {}

  async execute(input: UpdateCurrentWorkspaceInput): Promise<CurrentWorkspaceResponseDto> {
    assertWorkspaceRole(input.scope, ['owner']);

    const workspace = await this.workspaces.updateWorkspaceName({
      workspaceId: input.scope.workspaceId,
      actorUserId: input.scope.userId,
      name: normalizeWorkspaceName(input.name),
    });

    if (!workspace) {
      throw missingWorkspaceMembership();
    }

    assertWorkspaceScopeMatches(input.scope, workspace.id);

    return buildCurrentWorkspaceResponse({ workspace, scope: input.scope });
  }
}
