import type {
  AuthenticatedUserResponseDto,
  AuthenticationResponseDto,
  AuthTokensDto,
} from '@runlane/contracts';
import type {
  AuthenticatedWorkspaceRecord,
  IssuedAccessToken,
  StoredSessionRecord,
  StoredUserRecord,
} from '../../ports';

export interface AuthenticationResponseInput {
  readonly user: StoredUserRecord;
  readonly workspace: AuthenticatedWorkspaceRecord;
  readonly session: StoredSessionRecord;
  readonly accessToken: IssuedAccessToken;
  readonly refreshToken: string;
}

export function buildAuthenticationResponse(
  input: AuthenticationResponseInput,
): AuthenticationResponseDto {
  return {
    user: input.user,
    workspace: input.workspace,
    session: {
      id: input.session.id,
      expiresAt: input.session.expiresAt.toISOString(),
    },
    tokens: buildTokens(input.accessToken, input.refreshToken, input.session.expiresAt),
  };
}

export function buildAuthenticatedUserResponse(input: {
  readonly user: StoredUserRecord;
  readonly workspace: AuthenticatedWorkspaceRecord;
  readonly session: StoredSessionRecord;
}): AuthenticatedUserResponseDto {
  return {
    user: input.user,
    workspace: input.workspace,
    session: {
      id: input.session.id,
      expiresAt: input.session.expiresAt.toISOString(),
    },
  };
}

function buildTokens(
  accessToken: IssuedAccessToken,
  refreshToken: string,
  refreshTokenExpiresAt: Date,
): AuthTokensDto {
  return {
    tokenType: 'Bearer',
    accessToken: accessToken.token,
    refreshToken,
    accessTokenExpiresAt: accessToken.expiresAt.toISOString(),
    refreshTokenExpiresAt: refreshTokenExpiresAt.toISOString(),
    expiresIn: accessToken.expiresInSeconds,
  };
}
