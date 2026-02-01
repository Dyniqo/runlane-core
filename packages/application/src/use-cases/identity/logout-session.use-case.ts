import type { LogoutSessionResponseDto } from '@runlane/contracts';
import type {
  AuditLogRepositoryPort,
  AuthTokenServicePort,
  SessionRepositoryPort,
  TransactionBoundary,
  WorkspaceRepositoryPort,
} from '../../ports';
import type { UseCase } from '../use-case';

export interface LogoutSessionInput {
  readonly refreshToken: string;
  readonly userAgent: string | null;
  readonly ip: string | null;
}

export class LogoutSessionUseCase implements UseCase<LogoutSessionInput, LogoutSessionResponseDto> {
  constructor(
    private readonly sessions: SessionRepositoryPort,
    private readonly tokens: AuthTokenServicePort,
    private readonly workspaces: WorkspaceRepositoryPort,
    private readonly auditLogs: AuditLogRepositoryPort,
    private readonly transactionBoundary: TransactionBoundary,
  ) {}

  execute(input: LogoutSessionInput): Promise<LogoutSessionResponseDto> {
    return this.transactionBoundary.execute(async () => {
      const sessionId = this.tokens.readRefreshSessionId(input.refreshToken);
      const refreshTokenHash = await this.tokens.hashRefreshToken(input.refreshToken);
      const session = await this.sessions.findById(sessionId);
      const revoked = await this.sessions.revoke({
        id: sessionId,
        refreshTokenHash,
        revokedAt: new Date(),
      });

      if (session && revoked) {
        const workspace = await this.workspaces.findPrimaryWorkspaceForUser(session.userId);

        if (workspace) {
          await this.auditLogs.create({
            workspaceId: workspace.id,
            actorUserId: session.userId,
            action: 'identity.session_logged_out',
            entityType: 'session',
            entityId: session.id,
            metadata: {
              workspaceRole: workspace.role,
            },
            ip: input.ip,
            userAgent: input.userAgent,
          });
        }
      }

      return { revoked: true };
    });
  }
}
