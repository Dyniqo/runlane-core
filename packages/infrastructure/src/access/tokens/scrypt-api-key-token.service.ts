import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { ApiKeyTokenServicePort, GeneratedApiKeyToken } from '@runlane/application';
import { apiKeyInvalid } from '@runlane/domain';

const API_KEY_HASH_VERSION = 'api-key:scrypt:v1';
const API_KEY_TOKEN_PATTERN = /^(rln_[A-Za-z0-9_-]{11})_[A-Za-z0-9_-]{43}$/;
const SCRYPT_COST = 32768;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;
const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_MAX_MEMORY = 64 * 1024 * 1024;
const PREFIX_BYTES = 8;
const SECRET_BYTES = 32;
const SALT_BYTES = 16;

@Injectable()
export class ScryptApiKeyTokenService implements ApiKeyTokenServicePort {
  generate(): GeneratedApiKeyToken {
    const prefix = `rln_${randomBytes(PREFIX_BYTES).toString('base64url')}`;
    const secret = randomBytes(SECRET_BYTES).toString('base64url');

    return {
      prefix,
      token: `${prefix}_${secret}`,
    };
  }

  readPrefix(apiKey: string): string {
    const match = API_KEY_TOKEN_PATTERN.exec(apiKey.trim());

    if (!match?.[1]) {
      throw apiKeyInvalid();
    }

    return match[1];
  }

  async hash(apiKey: string): Promise<string> {
    this.readPrefix(apiKey);
    const salt = randomBytes(SALT_BYTES);
    const derivedKey = await deriveKey(apiKey, salt, SCRYPT_KEY_LENGTH);

    return [
      API_KEY_HASH_VERSION,
      SCRYPT_COST,
      SCRYPT_BLOCK_SIZE,
      SCRYPT_PARALLELIZATION,
      SCRYPT_KEY_LENGTH,
      salt.toString('base64url'),
      derivedKey.toString('base64url'),
    ].join('$');
  }

  async verify(apiKey: string, expectedHash: string): Promise<boolean> {
    const parsedHash = parseApiKeyHash(expectedHash);

    if (!parsedHash) {
      return false;
    }

    try {
      this.readPrefix(apiKey);
    } catch {
      return false;
    }

    const derivedKey = await deriveKey(apiKey, parsedHash.salt, parsedHash.keyLength);

    if (derivedKey.byteLength !== parsedHash.derivedKey.byteLength) {
      return false;
    }

    return timingSafeEqual(derivedKey, parsedHash.derivedKey);
  }
}

interface ParsedApiKeyHash {
  readonly salt: Buffer;
  readonly derivedKey: Buffer;
  readonly keyLength: number;
}

function parseApiKeyHash(apiKeyHash: string): ParsedApiKeyHash | null {
  const parts = apiKeyHash.split('$');

  if (parts.length !== 7 || parts[0] !== API_KEY_HASH_VERSION) {
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

function deriveKey(secret: string, salt: Buffer, keyLength: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      secret,
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
