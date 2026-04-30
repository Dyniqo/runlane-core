import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  GetAuthenticatedUserUseCase,
  LoginUserUseCase,
  LogoutSessionUseCase,
  RefreshSessionUseCase,
  RegisterUserUseCase,
} from '@runlane/application';
import type {
  GetAuthenticatedUserInput,
  LoginUserInput,
  LogoutSessionInput,
  RefreshSessionInput,
  RegisterUserInput,
} from '@runlane/application';
import type {
  AuthenticatedUserResponseDto,
  AuthenticationResponseDto,
  LoginUserRequestDto,
  LogoutSessionRequestDto,
  LogoutSessionResponseDto,
  RefreshSessionRequestDto,
  RegisterUserRequestDto,
  RegisterUserResponseDto,
} from '@runlane/contracts';
import { DomainError } from '@runlane/domain';

type OpenApiSchemaObject = {
  readonly type?: string;
  readonly format?: string;
  readonly example?: unknown;
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly minimum?: number;
  readonly required?: string[];
  readonly enum?: unknown[];
  readonly properties?: Record<string, OpenApiSchemaObject>;
};

const registerUserRequestSchema = {
  type: 'object',
  required: ['email', 'password', 'name'],
  properties: {
    email: { type: 'string', format: 'email', example: 'operator@example.com' },
    password: { type: 'string', minLength: 12, example: 'RunlanePassword123!' },
    name: { type: 'string', minLength: 2, maxLength: 120, example: 'Runlane Operator' },
  },
} satisfies OpenApiSchemaObject;

const loginUserRequestSchema = {
  type: 'object',
  required: ['email', 'password'],
  properties: {
    email: { type: 'string', format: 'email', example: 'operator@example.com' },
    password: { type: 'string', minLength: 12, example: 'RunlanePassword123!' },
    demoSessionId: {
      type: 'string',
      minLength: 8,
      maxLength: 128,
      example: 'browser-demo-session-001',
    },
  },
} satisfies OpenApiSchemaObject;

const refreshSessionRequestSchema = {
  type: 'object',
  required: ['refreshToken'],
  properties: {
    refreshToken: { type: 'string' },
  },
} satisfies OpenApiSchemaObject;

const logoutSessionRequestSchema = refreshSessionRequestSchema;

const userSchema = {
  type: 'object',
  required: ['id', 'email', 'name'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    email: { type: 'string', format: 'email' },
    name: { type: 'string' },
  },
} satisfies OpenApiSchemaObject;

const workspaceSchema = {
  type: 'object',
  required: ['id', 'name', 'role'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'string' },
    role: { type: 'string', enum: ['owner', 'member'] },
  },
} satisfies OpenApiSchemaObject;

const sessionSchema = {
  type: 'object',
  required: ['id', 'expiresAt'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    expiresAt: { type: 'string', format: 'date-time' },
  },
} satisfies OpenApiSchemaObject;

const tokensSchema = {
  type: 'object',
  required: [
    'tokenType',
    'accessToken',
    'refreshToken',
    'accessTokenExpiresAt',
    'refreshTokenExpiresAt',
    'expiresIn',
  ],
  properties: {
    tokenType: { type: 'string', enum: ['Bearer'] },
    accessToken: { type: 'string' },
    refreshToken: { type: 'string' },
    accessTokenExpiresAt: { type: 'string', format: 'date-time' },
    refreshTokenExpiresAt: { type: 'string', format: 'date-time' },
    expiresIn: { type: 'integer', minimum: 1 },
  },
} satisfies OpenApiSchemaObject;

const registerUserResponseSchema = {
  type: 'object',
  required: ['user', 'workspace'],
  properties: {
    user: userSchema,
    workspace: {
      ...workspaceSchema,
      properties: {
        ...workspaceSchema.properties,
        role: { type: 'string', enum: ['owner'] },
      },
    },
  },
} satisfies OpenApiSchemaObject;

const authenticationResponseSchema = {
  type: 'object',
  required: ['user', 'workspace', 'session', 'tokens'],
  properties: {
    user: userSchema,
    workspace: workspaceSchema,
    session: sessionSchema,
    tokens: tokensSchema,
  },
} satisfies OpenApiSchemaObject;

const authenticatedUserResponseSchema = {
  type: 'object',
  required: ['user', 'workspace', 'session'],
  properties: {
    user: userSchema,
    workspace: workspaceSchema,
    session: sessionSchema,
  },
} satisfies OpenApiSchemaObject;

const logoutSessionResponseSchema = {
  type: 'object',
  required: ['revoked'],
  properties: {
    revoked: { type: 'boolean', enum: [true] },
  },
} satisfies OpenApiSchemaObject;

@ApiTags('Identity')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(
    @Inject(RegisterUserUseCase) private readonly registerUser: RegisterUserUseCase,
    @Inject(LoginUserUseCase) private readonly loginUser: LoginUserUseCase,
    @Inject(RefreshSessionUseCase) private readonly refreshSession: RefreshSessionUseCase,
    @Inject(LogoutSessionUseCase) private readonly logoutSession: LogoutSessionUseCase,
    @Inject(GetAuthenticatedUserUseCase)
    private readonly getAuthenticatedUser: GetAuthenticatedUserUseCase,
  ) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ operationId: 'registerUser', summary: 'Register a user and default workspace' })
  @ApiBody({ schema: registerUserRequestSchema })
  @ApiCreatedResponse({ schema: registerUserResponseSchema })
  @ApiConflictResponse({ description: 'Email address is already registered' })
  register(@Body() body: unknown, @Req() request: HttpRequest): Promise<RegisterUserResponseDto> {
    return this.registerUser.execute({
      ...parseRegisterUserRequest(body),
      userAgent: readHeader(request, 'user-agent', 512),
      ip: readClientIp(request),
    });
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: 'loginUser', summary: 'Create an authenticated session' })
  @ApiBody({ schema: loginUserRequestSchema })
  @ApiOkResponse({ schema: authenticationResponseSchema })
  @ApiUnauthorizedResponse({ description: 'Email address or password is invalid' })
  login(@Body() body: unknown, @Req() request: HttpRequest): Promise<AuthenticationResponseDto> {
    return this.loginUser.execute({
      ...parseLoginUserRequest(body),
      userAgent: readHeader(request, 'user-agent', 512),
      ip: readClientIp(request),
    });
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: 'refreshSession', summary: 'Rotate a refresh token' })
  @ApiBody({ schema: refreshSessionRequestSchema })
  @ApiOkResponse({ schema: authenticationResponseSchema })
  @ApiUnauthorizedResponse({ description: 'Refresh token is invalid' })
  refresh(@Body() body: unknown, @Req() request: HttpRequest): Promise<AuthenticationResponseDto> {
    return this.refreshSession.execute({
      ...parseRefreshSessionRequest(body),
      userAgent: readHeader(request, 'user-agent', 512),
      ip: readClientIp(request),
    });
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: 'logoutSession', summary: 'Revoke an authenticated session' })
  @ApiBody({ schema: logoutSessionRequestSchema })
  @ApiOkResponse({ schema: logoutSessionResponseSchema })
  logout(@Body() body: unknown, @Req() request: HttpRequest): Promise<LogoutSessionResponseDto> {
    return this.logoutSession.execute({
      ...parseLogoutSessionRequest(body),
      userAgent: readHeader(request, 'user-agent', 512),
      ip: readClientIp(request),
    });
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ operationId: 'getAuthenticatedUser', summary: 'Read the authenticated user' })
  @ApiOkResponse({ schema: authenticatedUserResponseSchema })
  @ApiUnauthorizedResponse({ description: 'Authentication is required' })
  me(
    @Headers('authorization') authorizationHeader: string | undefined,
  ): Promise<AuthenticatedUserResponseDto> {
    return this.getAuthenticatedUser.execute(parseAuthenticatedUserRequest(authorizationHeader));
  }
}

interface HttpRequest {
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  readonly ip?: string;
  readonly socket?: {
    readonly remoteAddress?: string;
  };
}

function parseRegisterUserRequest(body: unknown): Omit<RegisterUserInput, 'userAgent' | 'ip'> {
  if (!isRecord(body)) {
    throw invalidPayload('REGISTRATION_PAYLOAD_INVALID', 'Registration payload must be an object');
  }

  return {
    email: readString(body, 'email', 'REGISTRATION_PAYLOAD_INVALID', 'Registration'),
    password: readString(body, 'password', 'REGISTRATION_PAYLOAD_INVALID', 'Registration'),
    name: readString(body, 'name', 'REGISTRATION_PAYLOAD_INVALID', 'Registration'),
  };
}

function parseLoginUserRequest(body: unknown): Omit<LoginUserInput, 'userAgent' | 'ip'> {
  if (!isRecord(body)) {
    throw invalidPayload('LOGIN_PAYLOAD_INVALID', 'Login payload must be an object');
  }

  return {
    email: readString(body, 'email', 'LOGIN_PAYLOAD_INVALID', 'Login'),
    password: readString(body, 'password', 'LOGIN_PAYLOAD_INVALID', 'Login'),
    demoSessionId: readOptionalString(body, 'demoSessionId', 'LOGIN_PAYLOAD_INVALID', 'Login', 128),
  };
}

function parseRefreshSessionRequest(body: unknown): Omit<RefreshSessionInput, 'userAgent' | 'ip'> {
  if (!isRecord(body)) {
    throw invalidPayload('REFRESH_PAYLOAD_INVALID', 'Refresh payload must be an object');
  }

  return {
    refreshToken: readString(body, 'refreshToken', 'REFRESH_PAYLOAD_INVALID', 'Refresh'),
  };
}

function parseLogoutSessionRequest(body: unknown): Omit<LogoutSessionInput, 'userAgent' | 'ip'> {
  if (!isRecord(body)) {
    throw invalidPayload('LOGOUT_PAYLOAD_INVALID', 'Logout payload must be an object');
  }

  return {
    refreshToken: readString(body, 'refreshToken', 'LOGOUT_PAYLOAD_INVALID', 'Logout'),
  };
}

function parseAuthenticatedUserRequest(
  authorizationHeader: string | undefined,
): GetAuthenticatedUserInput {
  return { authorizationHeader };
}

function readString(
  body: Readonly<Record<string, unknown>>,
  key:
    | keyof RegisterUserRequestDto
    | keyof LoginUserRequestDto
    | keyof RefreshSessionRequestDto
    | keyof LogoutSessionRequestDto,
  code: string,
  label: string,
): string {
  const value = body[key];

  if (typeof value !== 'string') {
    throw invalidPayload(code, `${label} ${key} must be a string`);
  }

  return value;
}

function readOptionalString(
  body: Readonly<Record<string, unknown>>,
  key: keyof LoginUserRequestDto,
  code: string,
  label: string,
  maximumLength: number,
): string | null {
  const value = body[key];

  if (value === undefined || value === null || value === '') {
    return null;
  }

  if (typeof value !== 'string') {
    throw invalidPayload(code, `${label} ${key} must be a string`);
  }

  if (value.length > maximumLength) {
    throw invalidPayload(code, `${label} ${key} is too long`);
  }

  return value;
}

function readHeader(request: HttpRequest, name: string, maximumLength: number): string | null {
  const value = request.headers[name];
  const headerValue = Array.isArray(value) ? value[0] : value;

  if (!headerValue) {
    return null;
  }

  return headerValue.slice(0, maximumLength);
}

function readClientIp(request: HttpRequest): string | null {
  return (request.ip ?? request.socket?.remoteAddress ?? null)?.slice(0, 64) ?? null;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalidPayload(code: string, message: string): DomainError {
  return new DomainError({
    code,
    category: 'validation',
    message,
  });
}
