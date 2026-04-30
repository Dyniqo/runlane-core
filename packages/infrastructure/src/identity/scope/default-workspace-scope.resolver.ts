import { Inject, Injectable } from '@nestjs/common';
import type {
  AuthTokenServicePort,
  SessionRepositoryPort,
  UserRepositoryPort,
  WorkspaceRepositoryPort,
  WorkspaceScopeRecord,
  WorkspaceScopeResolverPort,
  ResolveWorkspaceScopeInput,
} from '@runlane/application';
import {
  AUTH_TOKEN_SERVICE,
  SESSION_REPOSITORY,
  USER_REPOSITORY,
  WORKSPACE_REPOSITORY,
} from '@runlane/application';
import {
  authenticationRequired,
  invalidRefreshToken,
  readBearerAccessToken,
  workspaceMembershipRequired,
} from '@runlane/domain';

@Injectable()
export class DefaultWorkspaceScopeResolver implements WorkspaceScopeResolverPort {
  constructor(
    @Inject(AUTH_TOKEN_SERVICE) private readonly tokens: AuthTokenServicePort,
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepositoryPort,
    @Inject(USER_REPOSITORY) private readonly users: UserRepositoryPort,
    @Inject(WORKSPACE_REPOSITORY) private readonly workspaces: WorkspaceRepositoryPort,
  ) {}

  async resolve(input: ResolveWorkspaceScopeInput): Promise<WorkspaceScopeRecord> {
    const now = input.now ?? new Date();
    const token = readBearerAccessToken(input.authorizationHeader);
    const principal = await this.tokens.verifyAccessToken(token, now);
    const session = await this.sessions.findById(principal.sessionId);

    if (!session || session.userId !== principal.userId) {
      throw invalidRefreshToken();
    }

    if (session.revokedAt !== null || session.expiresAt.getTime() <= now.getTime()) {
      throw invalidRefreshToken();
    }

    if (session.workspaceId !== null && session.workspaceId !== principal.workspaceId) {
      throw invalidRefreshToken();
    }

    const user = await this.users.findById(principal.userId);

    if (!user || user.email !== principal.email) {
      throw authenticationRequired();
    }

    const workspace = await this.workspaces.findWorkspaceForUser({
      userId: principal.userId,
      workspaceId: principal.workspaceId,
    });

    if (!workspace || workspace.role !== principal.workspaceRole) {
      throw workspaceMembershipRequired();
    }

    return {
      userId: principal.userId,
      email: principal.email,
      sessionId: principal.sessionId,
      workspaceId: workspace.id,
      workspaceRole: workspace.role,
      isDemo: workspace.isDemo,
      demoSessionId: workspace.demoSessionId,
      issuedAt: principal.issuedAt,
      expiresAt: principal.expiresAt,
    };
  }
}
