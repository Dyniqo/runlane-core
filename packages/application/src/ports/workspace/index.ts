export { WORKSPACE_REPOSITORY } from './workspace-repository.port';
export type {
  AuthenticatedWorkspaceRecord,
  CreateWorkspaceWithOwnerInput,
  ListWorkspacesForUserInput,
  UpdateWorkspaceNameInput,
  WorkspaceMembershipRecord,
  WorkspaceRepositoryPort,
  WorkspaceWithOwnerMembershipRecord,
} from './workspace-repository.port';
export { WORKSPACE_SCOPE_RESOLVER } from './workspace-scope-resolver.port';
export type {
  ResolveWorkspaceScopeInput,
  WorkspaceScopeRecord,
  WorkspaceScopeResolverPort,
} from './workspace-scope-resolver.port';
export type {
  WorkspaceScopedEntityQuery,
  WorkspaceScopedQuery,
  WorkspaceScopedReadRepositoryPort,
  WorkspaceScopedRepositoryPort,
  WorkspaceScopedWriteInput,
  WorkspaceScopedWriteRepositoryPort,
} from './workspace-scoped-repository.port';
