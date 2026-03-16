export const SECRET_CIPHER = Symbol('SECRET_CIPHER');

export interface EncryptSecretInput {
  readonly plaintext: string;
  readonly associatedData: string;
}

export interface DecryptSecretInput {
  readonly ciphertext: string;
  readonly associatedData: string;
}

export interface SecretCipherPort {
  encrypt(input: EncryptSecretInput): string;
  decrypt(input: DecryptSecretInput): string;
}
