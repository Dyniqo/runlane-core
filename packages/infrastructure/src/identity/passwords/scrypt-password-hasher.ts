import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { PasswordHasherPort } from '@runlane/application';

const PASSWORD_HASH_VERSION = 'scrypt:v1';
const SCRYPT_COST = 32768;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;
const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_MAX_MEMORY = 64 * 1024 * 1024;
const SALT_BYTES = 16;

@Injectable()
export class ScryptPasswordHasher implements PasswordHasherPort {
  async hash(password: string): Promise<string> {
    const salt = randomBytes(SALT_BYTES);
    const derivedKey = await deriveKey(password, salt, SCRYPT_KEY_LENGTH);

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

  async verify(password: string, passwordHash: string): Promise<boolean> {
    const parsedHash = parsePasswordHash(passwordHash);

    if (!parsedHash) {
      return false;
    }

    const derivedKey = await deriveKey(password, parsedHash.salt, parsedHash.keyLength);

    if (derivedKey.byteLength !== parsedHash.derivedKey.byteLength) {
      return false;
    }

    return timingSafeEqual(derivedKey, parsedHash.derivedKey);
  }
}

interface ParsedPasswordHash {
  readonly salt: Buffer;
  readonly derivedKey: Buffer;
  readonly keyLength: number;
}

function parsePasswordHash(passwordHash: string): ParsedPasswordHash | null {
  const parts = passwordHash.split('$');

  if (parts.length !== 7 || parts[0] !== PASSWORD_HASH_VERSION) {
    return null;
  }

  const cost = Number(parts[1]);
  const blockSize = Number(parts[2]);
  const parallelization = Number(parts[3]);
  const keyLength = Number(parts[4]);
  const saltValue = parts[5];
  const derivedKeyValue = parts[6];

  if (
    cost !== SCRYPT_COST ||
    blockSize !== SCRYPT_BLOCK_SIZE ||
    parallelization !== SCRYPT_PARALLELIZATION ||
    keyLength !== SCRYPT_KEY_LENGTH ||
    !saltValue ||
    !derivedKeyValue
  ) {
    return null;
  }

  try {
    return {
      salt: Buffer.from(saltValue, 'base64url'),
      derivedKey: Buffer.from(derivedKeyValue, 'base64url'),
      keyLength,
    };
  } catch {
    return null;
  }
}

function deriveKey(password: string, salt: Buffer, keyLength: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      keyLength,
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
