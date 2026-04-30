export const WORKSPACE_SCOPE_RESOLVER = Symbol('WORKSPACE_SCOPE_RESOLVER');

export interface WorkspaceScopeRecord {
  readonly userId: string;
  readonly email: string;
  readonly sessionId: string;
  readonly workspaceId: string;
  readonly workspaceRole: 'owner' | 'member';
  readonly isDemo: boolean;
  readonly demoSessionId: string | null;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
}

export interface ResolveWorkspaceScopeInput {
  readonly authorizationHeader: string | undefined;
  readonly now?: Date;
}

export interface WorkspaceScopeResolverPort {
  resolve(input: ResolveWorkspaceScopeInput): Promise<WorkspaceScopeRecord>;
}
