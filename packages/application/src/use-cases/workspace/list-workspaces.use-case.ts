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
    const workspaces = await this.workspaces.listWorkspacesForUser(input.scope.userId);

    return buildListWorkspacesResponse(workspaces);
  }
}
