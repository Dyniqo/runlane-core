import type { CurrentWorkspaceResponseDto } from '@runlane/contracts';
import { assertWorkspaceScopeMatches } from '@runlane/domain';
import type { WorkspaceRepositoryPort, WorkspaceScopeRecord } from '../../ports';
import type { UseCase } from '../use-case';
import { missingWorkspaceMembership } from './workspace-errors';
import { buildCurrentWorkspaceResponse } from './workspace-response';

export interface GetCurrentWorkspaceInput {
  readonly scope: WorkspaceScopeRecord;
}

export class GetCurrentWorkspaceUseCase implements UseCase<
  GetCurrentWorkspaceInput,
  CurrentWorkspaceResponseDto
> {
  constructor(private readonly workspaces: WorkspaceRepositoryPort) {}

  async execute(input: GetCurrentWorkspaceInput): Promise<CurrentWorkspaceResponseDto> {
    const workspace = await this.workspaces.findWorkspaceForUser({
      userId: input.scope.userId,
      workspaceId: input.scope.workspaceId,
    });

    if (!workspace) {
      throw missingWorkspaceMembership();
    }

    assertWorkspaceScopeMatches(input.scope, workspace.id);

    return buildCurrentWorkspaceResponse({ workspace, scope: input.scope });
  }
}
