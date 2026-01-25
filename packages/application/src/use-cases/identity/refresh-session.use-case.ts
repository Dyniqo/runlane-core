import type { AuthenticationResponseDto } from '@runlane/contracts';
import type {
  AuthTokenServicePort,
  SessionRepositoryPort,
  UserRepositoryPort,
  WorkspaceRepositoryPort,
} from '../../ports';
import type { UseCase } from '../use-case';
import { buildAuthenticationResponse } from './auth-response';
import {
  ensureActiveSession,
  missingAuthenticatedUser,
  missingWorkspaceMembership,
  rejectInvalidRefreshToken,
} from './authentication-errors';

export interface RefreshSessionInput {
  readonly refreshToken: string;
}

export class RefreshSessionUseCase implements UseCase<
  RefreshSessionInput,
  AuthenticationResponseDto
> {
  constructor(
    private readonly users: UserRepositoryPort,
    private readonly workspaces: WorkspaceRepositoryPort,
    private readonly sessions: SessionRepositoryPort,
    private readonly tokens: AuthTokenServicePort,
  ) {}

  async execute(input: RefreshSessionInput): Promise<AuthenticationResponseDto> {
    const sessionId = this.tokens.readRefreshSessionId(input.refreshToken);
    const session = await this.sessions.findById(sessionId);

    if (!session) {
      rejectInvalidRefreshToken();
    }

    ensureActiveSession(session);

    const refreshTokenMatches = await this.tokens.isRefreshTokenHashMatch(
      input.refreshToken,
      session.refreshTokenHash,
    );

    if (!refreshTokenMatches) {
      rejectInvalidRefreshToken();
    }

    const user = await this.users.findById(session.userId);

    if (!user) {
      throw missingAuthenticatedUser();
    }

    const workspace = await this.workspaces.findPrimaryWorkspaceForUser(user.id);

    if (!workspace) {
      throw missingWorkspaceMembership();
    }

    const now = new Date();
    const nextRefreshToken = await this.tokens.issueRefreshToken(session.id);
    const nextRefreshTokenHash = await this.tokens.hashRefreshToken(nextRefreshToken.token);
    const nextRefreshTokenExpiresAt = this.tokens.getRefreshTokenExpiresAt(now);
    const rotatedSession = await this.sessions.rotateRefreshToken({
      id: session.id,
      userId: session.userId,
      currentRefreshTokenHash: session.refreshTokenHash,
      nextRefreshTokenHash,
      expiresAt: nextRefreshTokenExpiresAt,
    });

    if (!rotatedSession) {
      rejectInvalidRefreshToken();
    }

    const accessToken = await this.tokens.issueAccessToken(
      {
        userId: user.id,
        email: user.email,
        sessionId: rotatedSession.id,
        workspaceId: workspace.id,
        workspaceRole: workspace.role,
      },
      now,
    );

    return buildAuthenticationResponse({
      user,
      workspace,
      session: rotatedSession,
      accessToken,
      refreshToken: nextRefreshToken.token,
    });
  }
}
