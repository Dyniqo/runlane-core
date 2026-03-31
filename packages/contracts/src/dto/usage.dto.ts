export type UsageMetricTypeDto =
  | 'execution'
  | 'ai_call'
  | 'http_call'
  | 'webhook_request'
  | 'retry';

export interface UsageMetricDto {
  readonly type: UsageMetricTypeDto;
  readonly quantity: number;
}

export interface UsageTotalsDto {
  readonly executions: number;
  readonly aiCalls: number;
  readonly httpCalls: number;
  readonly webhookRequests: number;
  readonly retries: number;
}

export interface CurrentUsageResponseDto {
  readonly workspaceId: string;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly totals: UsageTotalsDto;
  readonly metrics: readonly UsageMetricDto[];
}
