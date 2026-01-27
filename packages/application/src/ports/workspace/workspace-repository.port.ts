export const WORKSPACE_REPOSITORY = Symbol('WORKSPACE_REPOSITORY');

export interface WorkspaceWithOwnerMembershipRecord {
  readonly id: string;
  readonly name: string;
  readonly role: 'owner';
}

export interface AuthenticatedWorkspaceRecord {
  readonly id: string;
  readonly name: string;
  readonly role: 'owner' | 'member';
}

export interface WorkspaceMembershipRecord extends AuthenticatedWorkspaceRecord {
  readonly userId: string;
}

export interface CreateWorkspaceWithOwnerInput {
  readonly ownerId: string;
  readonly name: string;
}

export interface UpdateWorkspaceNameInput {
  readonly workspaceId: string;
  readonly actorUserId: string;
  readonly name: string;
}

export interface WorkspaceRepositoryPort {
  createDefaultWorkspaceForOwner(
    input: CreateWorkspaceWithOwnerInput,
  ): Promise<WorkspaceWithOwnerMembershipRecord>;
  findPrimaryWorkspaceForUser(userId: string): Promise<AuthenticatedWorkspaceRecord | null>;
  findWorkspaceForUser(
    input: Readonly<{ userId: string; workspaceId: string }>,
  ): Promise<WorkspaceMembershipRecord | null>;
  listWorkspacesForUser(userId: string): Promise<readonly AuthenticatedWorkspaceRecord[]>;
  updateWorkspaceName(
    input: UpdateWorkspaceNameInput,
  ): Promise<AuthenticatedWorkspaceRecord | null>;
}
