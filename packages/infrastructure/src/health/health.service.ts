import { Inject, Injectable } from '@nestjs/common';
import { RuntimeConfigService } from '@runlane/config';
import type { RunlaneServiceName } from '@runlane/contracts';
import { StructuredLoggerService, RUNLANE_SERVICE_NAME } from '../observability';
import { PrismaService } from '../prisma';
import { RedisService } from '../redis';
import type {
  HealthIndicatorDto,
  LivenessResponseDto,
  QueueHealthResponseDto,
  ReadinessResponseDto,
} from './health.dto';

@Injectable()
export class HealthService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RedisService) private readonly redis: RedisService,
    @Inject(RuntimeConfigService) private readonly config: RuntimeConfigService,
    @Inject(StructuredLoggerService) private readonly logger: StructuredLoggerService,
    @Inject(RUNLANE_SERVICE_NAME) private readonly serviceName: RunlaneServiceName,
  ) {}

  getLiveness(): LivenessResponseDto {
    return {
      status: 'ok',
      service: this.serviceName,
      timestamp: new Date().toISOString(),
      uptimeSeconds: roundMilliseconds(process.uptime()),
    };
  }

  async getReadiness(): Promise<ReadinessResponseDto> {
    const [database, redis] = await Promise.all([
      this.checkDependency('database', () => this.prisma.ping()),
      this.checkDependency('redis', () => this.redis.ping()),
    ]);
    const status = database.status === 'up' && redis.status === 'up' ? 'ready' : 'unavailable';

    return {
      status,
      service: this.serviceName,
      timestamp: new Date().toISOString(),
      checks: {
        database,
        redis,
      },
    };
  }

  async getQueueHealth(): Promise<QueueHealthResponseDto> {
    const queue = await this.checkDependency('queue', () => this.redis.ping());

    return {
      status: queue.status === 'up' ? 'ready' : 'unavailable',
      service: this.serviceName,
      timestamp: new Date().toISOString(),
      queue,
    };
  }

  private async checkDependency(
    dependency: string,
    operation: () => Promise<void>,
  ): Promise<HealthIndicatorDto> {
    const startedAt = process.hrtime.bigint();

    try {
      await withTimeout(operation(), this.config.healthCheckTimeoutMs, dependency);

      return {
        status: 'up',
        latencyMs: elapsedMilliseconds(startedAt),
      };
    } catch (error) {
      this.logger.logEvent(
        'warn',
        'Health dependency unavailable',
        {
          dependency,
          error,
        },
        HealthService.name,
      );

      return {
        status: 'down',
        latencyMs: elapsedMilliseconds(startedAt),
      };
    }
  }
}

function withTimeout(
  operation: Promise<void>,
  timeoutMs: number,
  dependency: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`${dependency} health check timed out`));
    }, timeoutMs);

    operation.then(
      () => {
        clearTimeout(timeout);
        resolve();
      },
      (error: unknown) => {
        clearTimeout(timeout);
        reject(error instanceof Error ? error : new Error(`${dependency} health check failed`));
      },
    );
  });
}

function elapsedMilliseconds(startedAt: bigint): number {
  return roundMilliseconds(Number(process.hrtime.bigint() - startedAt) / 1_000_000);
}

function roundMilliseconds(value: number): number {
  return Math.round(value * 1000) / 1000;
}
