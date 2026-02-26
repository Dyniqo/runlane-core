import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { RuntimeConfigService } from '@runlane/config';
import { workerHeartbeatRedisKey } from '@runlane/contracts';
import { StructuredLoggerService } from '../observability';
import { RedisService } from '../redis';

interface WorkerHeartbeatPayload {
  readonly workerId: string;
  readonly hostname: string;
  readonly processId: number;
  readonly heartbeatAt: string;
}

@Injectable()
export class WorkerHeartbeatService implements OnModuleInit, OnModuleDestroy {
  private readonly workerId = safeWorkerId(`${hostname()}-${process.pid}-${randomUUID()}`);
  private readonly heartbeatKey = workerHeartbeatRedisKey(this.workerId);
  private heartbeatTimer: NodeJS.Timeout | undefined;

  constructor(
    @Inject(RuntimeConfigService) private readonly config: RuntimeConfigService,
    @Inject(RedisService) private readonly redis: RedisService,
    @Inject(StructuredLoggerService) private readonly logger: StructuredLoggerService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.writeHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      void this.writeHeartbeat();
    }, this.config.workerHeartbeatIntervalMs);
    this.heartbeatTimer.unref();

    this.logger.logEvent(
      'info',
      'Worker heartbeat started',
      {
        workerId: this.workerId,
        heartbeatKey: this.heartbeatKey,
        intervalMs: this.config.workerHeartbeatIntervalMs,
        ttlSeconds: this.config.workerHeartbeatTtlSeconds,
      },
      WorkerHeartbeatService.name,
    );
  }

  async onModuleDestroy(): Promise<void> {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
  }

  private async writeHeartbeat(): Promise<void> {
    const payload: WorkerHeartbeatPayload = {
      workerId: this.workerId,
      hostname: hostname(),
      processId: process.pid,
      heartbeatAt: new Date().toISOString(),
    };

    try {
      await this.redis.set(
        this.heartbeatKey,
        JSON.stringify(payload),
        this.config.workerHeartbeatTtlSeconds,
      );
    } catch (error) {
      this.logger.logEvent(
        'error',
        'Worker heartbeat write failed',
        { error, workerId: this.workerId },
        WorkerHeartbeatService.name,
      );
    }
  }
}

function safeWorkerId(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/g, '-').slice(0, 96);
}
