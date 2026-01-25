export const USER_REPOSITORY = Symbol('USER_REPOSITORY');

export interface StoredUserRecord {
  readonly id: string;
  readonly email: string;
  readonly name: string;
}

export interface StoredUserCredentialsRecord extends StoredUserRecord {
  readonly passwordHash: string;
}

export interface CreateUserInput {
  readonly email: string;
  readonly passwordHash: string;
  readonly name: string;
}

export interface UserRepositoryPort {
  findByEmail(email: string): Promise<StoredUserRecord | null>;
  findByEmailWithPassword(email: string): Promise<StoredUserCredentialsRecord | null>;
  findById(userId: string): Promise<StoredUserRecord | null>;
  create(input: CreateUserInput): Promise<StoredUserRecord>;
}
