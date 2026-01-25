export interface RegisterUserRequestDto {
  readonly email: string;
  readonly password: string;
  readonly name: string;
}

export interface RegisteredUserDto {
  readonly id: string;
  readonly email: string;
  readonly name: string;
}

export interface RegisteredWorkspaceDto {
  readonly id: string;
  readonly name: string;
  readonly role: 'owner';
}

export interface RegisterUserResponseDto {
  readonly user: RegisteredUserDto;
  readonly workspace: RegisteredWorkspaceDto;
}

export interface LoginUserRequestDto {
  readonly email: string;
  readonly password: string;
}

export interface RefreshSessionRequestDto {
  readonly refreshToken: string;
}

export interface LogoutSessionRequestDto {
  readonly refreshToken: string;
}

export interface AuthenticatedUserDto {
  readonly id: string;
  readonly email: string;
  readonly name: string;
}

export interface AuthenticatedWorkspaceDto {
  readonly id: string;
  readonly name: string;
  readonly role: 'owner' | 'member';
}

export interface AuthenticatedSessionDto {
  readonly id: string;
  readonly expiresAt: string;
}

export interface AuthTokensDto {
  readonly tokenType: 'Bearer';
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly accessTokenExpiresAt: string;
  readonly refreshTokenExpiresAt: string;
  readonly expiresIn: number;
}

export interface AuthenticationResponseDto {
  readonly user: AuthenticatedUserDto;
  readonly workspace: AuthenticatedWorkspaceDto;
  readonly session: AuthenticatedSessionDto;
  readonly tokens: AuthTokensDto;
}

export interface AuthenticatedUserResponseDto {
  readonly user: AuthenticatedUserDto;
  readonly workspace: AuthenticatedWorkspaceDto;
  readonly session: AuthenticatedSessionDto;
}

export interface LogoutSessionResponseDto {
  readonly revoked: true;
}
