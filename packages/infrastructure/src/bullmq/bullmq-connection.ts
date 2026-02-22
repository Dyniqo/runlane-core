import type { QueueOptions } from 'bullmq';

export type BullMqRedisConnectionOptions = NonNullable<QueueOptions['connection']>;

export function createBullMqRedisConnectionOptions(redisUrl: string): BullMqRedisConnectionOptions {
  const parsedUrl = new URL(redisUrl);
  const database = Number.parseInt(parsedUrl.pathname.replace(/^\//, '') || '0', 10);
  const options: Record<string, unknown> = {
    host: parsedUrl.hostname,
    port: Number.parseInt(parsedUrl.port || '6379', 10),
    db: Number.isInteger(database) && database >= 0 ? database : 0,
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  };

  if (parsedUrl.username) {
    options.username = decodeURIComponent(parsedUrl.username);
  }

  if (parsedUrl.password) {
    options.password = decodeURIComponent(parsedUrl.password);
  }

  if (parsedUrl.protocol === 'rediss:') {
    options.tls = {};
  }

  return options as BullMqRedisConnectionOptions;
}
