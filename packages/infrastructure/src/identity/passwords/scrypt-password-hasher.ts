import { randomBytes, scrypt } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { PasswordHasherPort } from '@runlane/application';

const PASSWORD_HASH_VERSION = 'scrypt:v1';
const SCRYPT_COST = 32768;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;
const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_MAX_MEMORY = 64 * 1024 * 1024;
const SALT_BYTES = 16;

function deriveScryptKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      SCRYPT_KEY_LENGTH,
      {
        N: SCRYPT_COST,
        r: SCRYPT_BLOCK_SIZE,
        p: SCRYPT_PARALLELIZATION,
        maxmem: SCRYPT_MAX_MEMORY,
      },
      (error, derivedKey) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(derivedKey);
      },
    );
  });
}

@Injectable()
export class ScryptPasswordHasher implements PasswordHasherPort {
  async hash(password: string): Promise<string> {
    const salt = randomBytes(SALT_BYTES);
    const derivedKey = await deriveScryptKey(password, salt);

    return [
      PASSWORD_HASH_VERSION,
      SCRYPT_COST,
      SCRYPT_BLOCK_SIZE,
      SCRYPT_PARALLELIZATION,
      SCRYPT_KEY_LENGTH,
      salt.toString('base64url'),
      derivedKey.toString('base64url'),
    ].join('$');
  }
}
