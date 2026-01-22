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
