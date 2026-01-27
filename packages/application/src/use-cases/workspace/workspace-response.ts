import type {
  CurrentWorkspaceResponseDto,
  ListWorkspacesResponseDto,
  WorkspaceSummaryDto,
} from '@runlane/contracts';
import type { AuthenticatedWorkspaceRecord, WorkspaceScopeRecord } from '../../ports';

export function buildWorkspaceSummary(
  workspace: AuthenticatedWorkspaceRecord,
): WorkspaceSummaryDto {
  return {
    id: workspace.id,
    name: workspace.name,
    role: workspace.role,
  };
}

export function buildCurrentWorkspaceResponse(input: {
  readonly workspace: AuthenticatedWorkspaceRecord;
  readonly scope: WorkspaceScopeRecord;
}): CurrentWorkspaceResponseDto {
  return {
    workspace: buildWorkspaceSummary(input.workspace),
    scope: {
      userId: input.scope.userId,
      sessionId: input.scope.sessionId,
      workspaceId: input.scope.workspaceId,
      role: input.scope.workspaceRole,
    },
  };
}

export function buildListWorkspacesResponse(
  workspaces: readonly AuthenticatedWorkspaceRecord[],
): ListWorkspacesResponseDto {
  return {
    items: workspaces.map((workspace) => buildWorkspaceSummary(workspace)),
  };
}
