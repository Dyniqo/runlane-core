export const WORKSPACE_ROLES = ['owner', 'member'] as const;

export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export interface WorkspaceScope {
  readonly workspaceId: string;
}

export interface WorkspaceActorScope extends WorkspaceScope {
  readonly actorUserId: string | null;
}

export interface WorkspaceRuntimeScope extends WorkspaceScope {
  readonly isDemo: boolean;
  readonly demoSessionId?: string;
}

export interface WorkspaceScopedEntityReference extends WorkspaceScope {
  readonly entityId: string;
}

export interface AuthenticatedWorkspaceScopeDto extends WorkspaceScope {
  readonly userId: string;
  readonly sessionId: string;
  readonly role: WorkspaceRole;
}
