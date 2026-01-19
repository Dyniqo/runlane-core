import { ApiProperty } from '@nestjs/swagger';

export const HEALTH_INDICATOR_STATES = ['up', 'down'] as const;
export const LIVENESS_STATES = ['ok'] as const;
export const READINESS_STATES = ['ready', 'unavailable'] as const;

export type HealthIndicatorState = (typeof HEALTH_INDICATOR_STATES)[number];
export type LivenessState = (typeof LIVENESS_STATES)[number];
export type ReadinessState = (typeof READINESS_STATES)[number];

export class HealthIndicatorDto {
  @ApiProperty({ enum: HEALTH_INDICATOR_STATES })
  status!: HealthIndicatorState;

  @ApiProperty({ example: 1.25 })
  latencyMs!: number;
}

export class ReadinessChecksDto {
  @ApiProperty({ type: HealthIndicatorDto })
  database!: HealthIndicatorDto;

  @ApiProperty({ type: HealthIndicatorDto })
  redis!: HealthIndicatorDto;
}

export class LivenessResponseDto {
  @ApiProperty({ enum: LIVENESS_STATES })
  status!: LivenessState;

  @ApiProperty({ enum: ['api', 'worker'] })
  service!: 'api' | 'worker';

  @ApiProperty({ format: 'date-time' })
  timestamp!: string;

  @ApiProperty({ example: 42.5 })
  uptimeSeconds!: number;
}

export class ReadinessResponseDto {
  @ApiProperty({ enum: READINESS_STATES })
  status!: ReadinessState;

  @ApiProperty({ enum: ['api', 'worker'] })
  service!: 'api' | 'worker';

  @ApiProperty({ format: 'date-time' })
  timestamp!: string;

  @ApiProperty({ type: ReadinessChecksDto })
  checks!: ReadinessChecksDto;
}

export class QueueHealthResponseDto {
  @ApiProperty({ enum: READINESS_STATES })
  status!: ReadinessState;

  @ApiProperty({ enum: ['api', 'worker'] })
  service!: 'api' | 'worker';

  @ApiProperty({ format: 'date-time' })
  timestamp!: string;

  @ApiProperty({ type: HealthIndicatorDto })
  queue!: HealthIndicatorDto;
}
