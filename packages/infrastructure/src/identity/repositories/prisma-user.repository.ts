import { Inject, Injectable } from '@nestjs/common';
import type { CreateUserInput, StoredUserRecord, UserRepositoryPort } from '@runlane/application';
import { DomainError } from '@runlane/domain';
import { PrismaPersistenceContext } from '../../prisma';

@Injectable()
export class PrismaUserRepository implements UserRepositoryPort {
  constructor(
    @Inject(PrismaPersistenceContext) private readonly persistence: PrismaPersistenceContext,
  ) {}

  async findByEmail(email: string): Promise<StoredUserRecord | null> {
    return this.persistence.client.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
      },
    });
  }

  async create(input: CreateUserInput): Promise<StoredUserRecord> {
    try {
      return await this.persistence.client.user.create({
        data: {
          email: input.email,
          passwordHash: input.passwordHash,
          name: input.name,
        },
        select: {
          id: true,
          email: true,
          name: true,
        },
      });
    } catch (error) {
      if (isPrismaKnownRequestError(error, 'P2002')) {
        throw new DomainError({
          code: 'USER_EMAIL_ALREADY_REGISTERED',
          category: 'conflict',
          message: 'Email address is already registered',
          cause: error,
        });
      }

      throw error;
    }
  }
}

function isPrismaKnownRequestError(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as Readonly<Record<'code', unknown>>).code === code
  );
}
