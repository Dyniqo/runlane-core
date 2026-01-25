import type { AuthenticatedUserResponseDto } from '@runlane/contracts';
import { readBearerAccessToken } from '@runlane/domain';
import type {
  AuthTokenServicePort,
  SessionRepositoryPort,
  UserRepositoryPort,
  WorkspaceRepositoryPort,
} from '../../ports';
import type { UseCase } from '../use-case';
import { buildAuthenticatedUserResponse } from './auth-response';
import {
  ensureActiveSession,
  missingAuthenticatedUser,
  missingWorkspaceMembership,
  rejectInvalidRefreshToken,
} from './authentication-errors';

export interface GetAuthenticatedUserInput {
  readonly authorizationHeader: string | undefined;
}

export class GetAuthenticatedUserUseCase implements UseCase<
  GetAuthenticatedUserInput,
  AuthenticatedUserResponseDto
> {
  constructor(
    private readonly users: UserRepositoryPort,
    private readonly workspaces: WorkspaceRepositoryPort,
    private readonly sessions: SessionRepositoryPort,
    private readonly tokens: AuthTokenServicePort,
  ) {}

  async execute(input: GetAuthenticatedUserInput): Promise<AuthenticatedUserResponseDto> {
    const token = readBearerAccessToken(input.authorizationHeader);
    const principal = await this.tokens.verifyAccessToken(token, new Date());
    const session = await this.sessions.findById(principal.sessionId);

    if (!session || session.userId !== principal.userId) {
      rejectInvalidRefreshToken();
    }

    ensureActiveSession(session);

    const user = await this.users.findById(principal.userId);

    if (!user) {
      throw missingAuthenticatedUser();
    }

    const workspace = await this.workspaces.findPrimaryWorkspaceForUser(user.id);

    if (!workspace) {
      throw missingWorkspaceMembership();
    }

    if (workspace.id !== principal.workspaceId) {
      throw missingWorkspaceMembership();
    }

    return buildAuthenticatedUserResponse({ user, workspace, session });
  }
}
