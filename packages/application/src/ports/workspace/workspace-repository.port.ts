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

export interface CreateWorkspaceWithOwnerInput {
  readonly ownerId: string;
  readonly name: string;
}

export interface WorkspaceRepositoryPort {
  createDefaultWorkspaceForOwner(
    input: CreateWorkspaceWithOwnerInput,
  ): Promise<WorkspaceWithOwnerMembershipRecord>;
  findPrimaryWorkspaceForUser(userId: string): Promise<AuthenticatedWorkspaceRecord | null>;
}
