export type UsageMetricTypeDto =
  | 'execution'
  | 'ai_call'
  | 'http_call'
  | 'webhook_request'
  | 'retry';
export type WorkspacePlanDto = 'free' | 'starter' | 'pro' | 'agency';

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

export interface UsagePlanLimitsDto {
  readonly workflows: number;
  readonly executions: number;
  readonly aiCalls: number;
  readonly httpCalls: number;
  readonly webhookRequests: number;
  readonly requestsPerMinute: number;
}

export interface UsagePlanDto {
  readonly name: WorkspacePlanDto;
  readonly limits: UsagePlanLimitsDto;
  readonly used: UsageTotalsDto & { readonly workflows: number };
  readonly remaining: UsagePlanLimitsDto;
}

export interface CurrentUsageResponseDto {
  readonly workspaceId: string;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly plan: UsagePlanDto;
  readonly totals: UsageTotalsDto;
  readonly metrics: readonly UsageMetricDto[];
}
