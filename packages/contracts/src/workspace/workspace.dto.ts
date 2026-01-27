import type { AuthenticatedWorkspaceScopeDto, WorkspaceRole } from './workspace-scope';

export interface WorkspaceSummaryDto {
  readonly id: string;
  readonly name: string;
  readonly role: WorkspaceRole;
}

export interface ListWorkspacesResponseDto {
  readonly items: readonly WorkspaceSummaryDto[];
}

export interface CurrentWorkspaceResponseDto {
  readonly workspace: WorkspaceSummaryDto;
  readonly scope: AuthenticatedWorkspaceScopeDto;
}

export interface UpdateCurrentWorkspaceRequestDto {
  readonly name: string;
}
