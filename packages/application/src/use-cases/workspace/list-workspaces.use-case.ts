import type { ListWorkspacesResponseDto } from '@runlane/contracts';
import type { WorkspaceRepositoryPort, WorkspaceScopeRecord } from '../../ports';
import type { UseCase } from '../use-case';
import { buildListWorkspacesResponse } from './workspace-response';

export interface ListWorkspacesInput {
  readonly scope: WorkspaceScopeRecord;
}

export class ListWorkspacesUseCase implements UseCase<
  ListWorkspacesInput,
  ListWorkspacesResponseDto
> {
  constructor(private readonly workspaces: WorkspaceRepositoryPort) {}

  async execute(input: ListWorkspacesInput): Promise<ListWorkspacesResponseDto> {
    const current = await this.workspaces.findWorkspaceForUser({
      userId: input.scope.userId,
      workspaceId: input.scope.workspaceId,
    });

    if (!current) {
      return buildListWorkspacesResponse([]);
    }

    if (current.isDemo || current.demoSessionId !== null) {
      return buildListWorkspacesResponse([current]);
    }

    const workspaces = await this.workspaces.listWorkspacesForUser({
      userId: input.scope.userId,
      currentWorkspaceId: input.scope.workspaceId,
    });

    return buildListWorkspacesResponse(
      workspaces.filter((workspace) => !workspace.isDemo && workspace.demoSessionId === null),
    );
  }
}
