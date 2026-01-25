import type { LogoutSessionResponseDto } from '@runlane/contracts';
import type { AuthTokenServicePort, SessionRepositoryPort } from '../../ports';
import type { UseCase } from '../use-case';

export interface LogoutSessionInput {
  readonly refreshToken: string;
}

export class LogoutSessionUseCase implements UseCase<LogoutSessionInput, LogoutSessionResponseDto> {
  constructor(
    private readonly sessions: SessionRepositoryPort,
    private readonly tokens: AuthTokenServicePort,
  ) {}

  async execute(input: LogoutSessionInput): Promise<LogoutSessionResponseDto> {
    const sessionId = this.tokens.readRefreshSessionId(input.refreshToken);
    const refreshTokenHash = await this.tokens.hashRefreshToken(input.refreshToken);
    await this.sessions.revoke({
      id: sessionId,
      refreshTokenHash,
      revokedAt: new Date(),
    });

    return { revoked: true };
  }
}
