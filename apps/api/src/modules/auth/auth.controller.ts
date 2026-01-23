import { Body, Controller, HttpCode, HttpStatus, Inject, Post } from '@nestjs/common';
import {
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { RegisterUserUseCase } from '@runlane/application';
import type { RegisterUserInput } from '@runlane/application';
import type { RegisterUserRequestDto, RegisterUserResponseDto } from '@runlane/contracts';
import { DomainError } from '@runlane/domain';

@ApiTags('Identity')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(@Inject(RegisterUserUseCase) private readonly registerUser: RegisterUserUseCase) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ operationId: 'registerUser', summary: 'Register a user and default workspace' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['email', 'password', 'name'],
      properties: {
        email: { type: 'string', format: 'email', example: 'operator@example.com' },
        password: { type: 'string', minLength: 12, example: 'RunlanePassword123!' },
        name: { type: 'string', minLength: 2, maxLength: 120, example: 'Runlane Operator' },
      },
    },
  })
  @ApiCreatedResponse({
    schema: {
      type: 'object',
      required: ['user', 'workspace'],
      properties: {
        user: {
          type: 'object',
          required: ['id', 'email', 'name'],
          properties: {
            id: { type: 'string', format: 'uuid' },
            email: { type: 'string', format: 'email' },
            name: { type: 'string' },
          },
        },
        workspace: {
          type: 'object',
          required: ['id', 'name', 'role'],
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            role: { type: 'string', enum: ['owner'] },
          },
        },
      },
    },
  })
  @ApiConflictResponse({ description: 'Email address is already registered' })
  register(@Body() body: unknown): Promise<RegisterUserResponseDto> {
    return this.registerUser.execute(parseRegisterUserRequest(body));
  }
}

function parseRegisterUserRequest(body: unknown): RegisterUserInput {
  if (!isRecord(body)) {
    throw invalidRegistrationPayload('Registration payload must be an object');
  }

  return {
    email: readString(body, 'email'),
    password: readString(body, 'password'),
    name: readString(body, 'name'),
  };
}

function readString(
  body: Readonly<Record<string, unknown>>,
  key: keyof RegisterUserRequestDto,
): string {
  const value = body[key];

  if (typeof value !== 'string') {
    throw invalidRegistrationPayload(`Registration ${key} must be a string`);
  }

  return value;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalidRegistrationPayload(message: string): DomainError {
  return new DomainError({
    code: 'REGISTRATION_PAYLOAD_INVALID',
    category: 'validation',
    message,
  });
}
