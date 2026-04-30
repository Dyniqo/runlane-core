import { createHash } from 'node:crypto';

import type { AuthenticationResponseDto } from '@runlane/contracts';
import {
  DEMO_SEED_VERSION,
  normalizeDemoSessionId,
  normalizeDemoUserEmail,
  normalizeUserEmail,
} from '@runlane/domain';
import type {
  AuditLogRepositoryPort,
  AuthTokenServicePort,
  DemoRepositoryPort,
  PasswordHasherPort,
  SessionRepositoryPort,
  TransactionBoundary,
  UserRepositoryPort,
  WorkspaceRepositoryPort,
} from '../../ports';
import type { UseCase } from '../use-case';
import { buildAuthenticationResponse } from './auth-response';
import { missingWorkspaceMembership, rejectInvalidCredentials } from './authentication-errors';

export interface LoginUserOptions {
  readonly demoModeEnabled: boolean;
  readonly demoSessionEnabled: boolean;
  readonly demoUserEmail: string;
  readonly demoSessionTtlHours: number;
  readonly demoMaxSessionsPerIpPerHour: number;
}

export interface LoginUserInput {
  readonly email: string;
  readonly password: string;
  readonly demoSessionId?: string | null;
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
    private readonly auditLogs: AuditLogRepositoryPort,
    private readonly transactionBoundary: TransactionBoundary,
    private readonly demo: DemoRepositoryPort,
    private readonly options: LoginUserOptions,
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

      const now = new Date();
      const workspace = await this.resolveLoginWorkspace({
        userId: user.id,
        email: user.email,
        demoSessionId: input.demoSessionId ?? null,
        ip: input.ip,
        userAgent: input.userAgent,
        now,
      });

      if (!workspace) {
        throw missingWorkspaceMembership();
      }

      const sessionId = this.tokens.createSessionId();
      const refreshToken = await this.tokens.issueRefreshToken(sessionId);
      const refreshTokenHash = await this.tokens.hashRefreshToken(refreshToken.token);
      const refreshTokenExpiresAt = this.tokens.getRefreshTokenExpiresAt(now);
      const session = await this.sessions.create({
        id: sessionId,
        userId: user.id,
        workspaceId: workspace.id,
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

      await this.auditLogs.create({
        workspaceId: workspace.id,
        actorUserId: user.id,
        action: 'identity.user_logged_in',
        entityType: 'session',
        entityId: session.id,
        metadata: {
          workspaceRole: workspace.role,
          demoSessionScoped: workspace.isDemo && workspace.demoSessionId !== null,
        },
        ip: input.ip,
        userAgent: input.userAgent,
      });

      return buildAuthenticationResponse({
        user,
        workspace,
        session,
        accessToken,
        refreshToken: refreshToken.token,
      });
    });
  }

  private async resolveLoginWorkspace(input: {
    readonly userId: string;
    readonly email: string;
    readonly demoSessionId: string | null;
    readonly ip: string | null;
    readonly userAgent: string | null;
    readonly now: Date;
  }) {
    if (!this.shouldResolveDemoSession(input.email, input.demoSessionId)) {
      return this.workspaces.findPrimaryWorkspaceForUser(input.userId);
    }

    const demoSessionId = normalizeDemoSessionId(input.demoSessionId ?? '');
    const expiresAt = new Date(
      input.now.getTime() + this.options.demoSessionTtlHours * 60 * 60 * 1000,
    );

    return this.demo.resolveSessionWorkspace({
      ownerId: input.userId,
      sessionKeyHash: stableHash(demoSessionId),
      ipHash: input.ip ? stableHash(input.ip) : null,
      userAgentHash: input.userAgent ? stableHash(input.userAgent) : null,
      now: input.now,
      expiresAt,
      maxSessionsPerIpPerHour: this.options.demoMaxSessionsPerIpPerHour,
      seedVersion: DEMO_SEED_VERSION,
    });
  }

  private shouldResolveDemoSession(email: string, demoSessionId: string | null): boolean {
    if (!this.options.demoModeEnabled || !this.options.demoSessionEnabled || !demoSessionId) {
      return false;
    }

    return email === normalizeDemoUserEmail(this.options.demoUserEmail);
  }
}

function stableHash(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
