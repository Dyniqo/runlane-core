export interface ApiErrorDto {
  readonly statusCode: number;
  readonly code?: string;
  readonly message: string | readonly string[];
  readonly timestamp: string;
  readonly path: string;
  readonly requestId?: string;
  readonly correlationId?: string;
}
