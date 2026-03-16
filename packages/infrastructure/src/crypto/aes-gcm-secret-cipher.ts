import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type {
  DecryptSecretInput,
  EncryptSecretInput,
  SecretCipherPort,
} from '@runlane/application';
import { RuntimeConfigService } from '@runlane/config';

const CIPHER_ALGORITHM = 'aes-256-gcm';
const CIPHER_VERSION = 'v1';
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;

@Injectable()
export class AesGcmSecretCipher implements SecretCipherPort {
  private readonly key: Buffer;

  constructor(@Inject(RuntimeConfigService) config: RuntimeConfigService) {
    this.key = createHash('sha256').update(config.encryptionKey, 'utf8').digest();
  }

  encrypt(input: EncryptSecretInput): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(CIPHER_ALGORITHM, this.key, iv, {
      authTagLength: AUTH_TAG_BYTES,
    });
    cipher.setAAD(Buffer.from(input.associatedData, 'utf8'));
    const ciphertext = Buffer.concat([
      cipher.update(Buffer.from(input.plaintext, 'utf8')),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    return [
      CIPHER_VERSION,
      iv.toString('base64url'),
      authTag.toString('base64url'),
      ciphertext.toString('base64url'),
    ].join(':');
  }

  decrypt(input: DecryptSecretInput): string {
    const [version, ivEncoded, authTagEncoded, ciphertextEncoded] = input.ciphertext.split(':');

    if (
      version !== CIPHER_VERSION ||
      !ivEncoded ||
      !authTagEncoded ||
      !ciphertextEncoded ||
      input.ciphertext.split(':').length !== 4
    ) {
      throw new Error('Encrypted secret payload is invalid');
    }

    const decipher = createDecipheriv(
      CIPHER_ALGORITHM,
      this.key,
      Buffer.from(ivEncoded, 'base64url'),
      {
        authTagLength: AUTH_TAG_BYTES,
      },
    );
    decipher.setAAD(Buffer.from(input.associatedData, 'utf8'));
    decipher.setAuthTag(Buffer.from(authTagEncoded, 'base64url'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(ciphertextEncoded, 'base64url')),
      decipher.final(),
    ]);

    return plaintext.toString('utf8');
  }
}
