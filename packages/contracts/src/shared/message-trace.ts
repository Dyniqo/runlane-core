export interface MessageTrace {
  readonly correlationId: string;
  readonly causationId?: string;
}
