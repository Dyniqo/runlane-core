import { createHash } from 'node:crypto';
import { Inject, Injectable, type NestMiddleware } from '@nestjs/common';
import { RuntimeConfigService } from '@runlane/config';
import { DomainError } from '@runlane/domain';
import { RedisService } from '../../redis';

interface HttpRequestLike {
  readonly headers: Readonly<Record<string, string | readonly string[] | undefined>>;
  readonly ip?: string;
  readonly method?: string;
  readonly originalUrl?: string;
  readonly socket?: {
    readonly remoteAddress?: string;
  };
  readonly url?: string;
}

interface HttpResponseLike {
  setHeader(name: string, value: string): void;
}

const KEY_PREFIX = 'security:rate-limit';
const FORWARDED_FOR_HEADER = 'x-forwarded-for';

@Injectable()
export class RedisRateLimitMiddleware implements NestMiddleware {
  constructor(
    @Inject(RuntimeConfigService) private readonly config: RuntimeConfigService,
    @Inject(RedisService) private readonly redis: RedisService,
  ) {}

  async use(
    request: HttpRequestLike,
    response: HttpResponseLike,
    next: (error?: unknown) => void,
  ): Promise<void> {
    try {
      const routeKey = createRouteKey(request);
      const clientKey = createClientKey(request);
      const redisKey = `${KEY_PREFIX}:${routeKey}:${clientKey}`;
      const result = await this.redis.consumeRateLimitWindow(
        redisKey,
        this.config.rateLimitTtlSeconds,
      );
      const resetSeconds = Math.max(result.ttlSeconds, 1);
      const remaining = Math.max(this.config.rateLimitMaxRequests - result.count, 0);

      response.setHeader('X-RateLimit-Limit', String(this.config.rateLimitMaxRequests));
      response.setHeader('X-RateLimit-Remaining', String(remaining));
      response.setHeader('X-RateLimit-Reset', String(resetSeconds));

      if (result.count > this.config.rateLimitMaxRequests) {
        response.setHeader('Retry-After', String(resetSeconds));
        next(rateLimitExceeded(resetSeconds));
        return;
      }

      next();
    } catch (error) {
      next(error);
    }
  }
}

function createRouteKey(request: HttpRequestLike): string {
  return stableHash(
    `${request.method ?? 'UNKNOWN'}:${normalizePath(request.originalUrl ?? request.url)}`,
  );
}

function createClientKey(request: HttpRequestLike): string {
  return stableHash(
    readForwardedAddress(request) ?? request.ip ?? request.socket?.remoteAddress ?? 'unknown',
  );
}

function readForwardedAddress(request: HttpRequestLike): string | undefined {
  const value = request.headers[FORWARDED_FOR_HEADER];
  const headerValue = typeof value === 'string' ? value : value?.[0];

  return headerValue?.split(',', 1)[0]?.trim() || undefined;
}

function normalizePath(path: string | undefined): string {
  return (path ?? '/').split('?', 1)[0] || '/';
}

function stableHash(value: string): string {
  return createHash('sha256').update(value).digest('base64url').slice(0, 32);
}

function rateLimitExceeded(retryAfterSeconds: number): DomainError {
  return new DomainError({
    code: 'RATE_LIMIT_EXCEEDED',
    category: 'rate_limit',
    message: 'Request rate limit exceeded',
    details: {
      retryAfterSeconds,
    },
  });
}
