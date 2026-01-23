import type { RegisterUserResponseDto } from '@runlane/contracts';
import {
  createDefaultWorkspaceName,
  DomainError,
  normalizeUserEmail,
  normalizeUserName,
  validateRegistrationPassword,
} from '@runlane/domain';
import type {
  PasswordHasherPort,
  TransactionBoundary,
  UserRepositoryPort,
  WorkspaceRepositoryPort,
} from '../../ports';
import type { UseCase } from '../use-case';

export interface RegisterUserInput {
  readonly email: string;
  readonly password: string;
  readonly name: string;
}

export class RegisterUserUseCase implements UseCase<RegisterUserInput, RegisterUserResponseDto> {
  constructor(
    private readonly users: UserRepositoryPort,
    private readonly workspaces: WorkspaceRepositoryPort,
    private readonly passwordHasher: PasswordHasherPort,
    private readonly transactionBoundary: TransactionBoundary,
  ) {}

  execute(input: RegisterUserInput): Promise<RegisterUserResponseDto> {
    const email = normalizeUserEmail(input.email);
    const name = normalizeUserName(input.name);
    validateRegistrationPassword(input.password);

    return this.transactionBoundary.execute(
      async () => {
        const existingUser = await this.users.findByEmail(email);

        if (existingUser) {
          throw new DomainError({
            code: 'USER_EMAIL_ALREADY_REGISTERED',
            category: 'conflict',
            message: 'Email address is already registered',
          });
        }

        const passwordHash = await this.passwordHasher.hash(input.password);
        const user = await this.users.create({ email, name, passwordHash });
        const workspace = await this.workspaces.createDefaultWorkspaceForOwner({
          ownerId: user.id,
          name: createDefaultWorkspaceName(user.name),
        });

        return {
          user,
          workspace,
        };
      },
      { isolationLevel: 'serializable' },
    );
  }
}
