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
