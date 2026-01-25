import type { AuthenticationResponseDto } from '@runlane/contracts';
import { normalizeUserEmail } from '@runlane/domain';
import type {
  AuthTokenServicePort,
  PasswordHasherPort,
  SessionRepositoryPort,
  TransactionBoundary,
  UserRepositoryPort,
  WorkspaceRepositoryPort,
} from '../../ports';
import type { UseCase } from '../use-case';
import { buildAuthenticationResponse } from './auth-response';
import { missingWorkspaceMembership, rejectInvalidCredentials } from './authentication-errors';

export interface LoginUserInput {
  readonly email: string;
  readonly password: string;
  readonly userAgent: string | null;
  readonly ip: string | null;
}

export class LoginUserUseCase implements UseCase<LoginUserInput, AuthenticationResponseDto> {
  constructor(
    private readonly users: UserRepositoryPort,
    private readonly workspaces: WorkspaceRepositoryPort,
    private readonly sessions: SessionRepositoryPort,
    private readonly passwordHasher: PasswordHasherPort,
    private readonly tokens: AuthTokenServicePort,
    private readonly transactionBoundary: TransactionBoundary,
  ) {}

  execute(input: LoginUserInput): Promise<AuthenticationResponseDto> {
    const email = normalizeUserEmail(input.email);

    return this.transactionBoundary.execute(async () => {
      const user = await this.users.findByEmailWithPassword(email);

      if (!user) {
        rejectInvalidCredentials();
      }

      const passwordMatches = await this.passwordHasher.verify(input.password, user.passwordHash);

      if (!passwordMatches) {
        rejectInvalidCredentials();
      }

      const workspace = await this.workspaces.findPrimaryWorkspaceForUser(user.id);

      if (!workspace) {
        throw missingWorkspaceMembership();
      }

      const now = new Date();
      const sessionId = this.tokens.createSessionId();
      const refreshToken = await this.tokens.issueRefreshToken(sessionId);
      const refreshTokenHash = await this.tokens.hashRefreshToken(refreshToken.token);
      const refreshTokenExpiresAt = this.tokens.getRefreshTokenExpiresAt(now);
      const session = await this.sessions.create({
        id: sessionId,
        userId: user.id,
        refreshTokenHash,
        userAgent: input.userAgent,
        ip: input.ip,
        expiresAt: refreshTokenExpiresAt,
      });
      const accessToken = await this.tokens.issueAccessToken(
        {
          userId: user.id,
          email: user.email,
          sessionId: session.id,
          workspaceId: workspace.id,
          workspaceRole: workspace.role,
        },
        now,
      );

      return buildAuthenticationResponse({
        user,
        workspace,
        session,
        accessToken,
        refreshToken: refreshToken.token,
      });
    });
  }
}
