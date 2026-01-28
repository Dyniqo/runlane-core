import { Inject, Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import type { ApiKeyScopeRecord } from '@runlane/application';
import { ResolveApiKeyUseCase } from '@runlane/application';
import { readApiKeyCredential } from '@runlane/domain';

export interface ApiKeyScopedHttpRequest {
  readonly headers: Readonly<Record<string, string | readonly string[] | undefined>>;
  runlaneApiKeyScope?: ApiKeyScopeRecord;
}

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(@Inject(ResolveApiKeyUseCase) private readonly resolveApiKey: ResolveApiKeyUseCase) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ApiKeyScopedHttpRequest>();
    const apiKey = readApiKeyCredential({
      authorizationHeader: readHeader(request.headers, 'authorization'),
      apiKeyHeader: readHeader(request.headers, 'x-runlane-api-key'),
    });
    request.runlaneApiKeyScope = await this.resolveApiKey.execute({ apiKey });

    return true;
  }
}

export function readApiKeyScope(request: ApiKeyScopedHttpRequest): ApiKeyScopeRecord {
  const scope = request.runlaneApiKeyScope;

  if (!scope) {
    throw new Error('API key scope was not resolved for this request');
  }

  return scope;
}

function readHeader(
  headers: Readonly<Record<string, string | readonly string[] | undefined>>,
  name: string,
): string | undefined {
  const value = headers[name] ?? headers[name.toLowerCase()];

  if (typeof value === 'string') {
    return value;
  }

  if (!value) {
    return undefined;
  }

  return value.find((headerValue) => headerValue.length > 0);
}
