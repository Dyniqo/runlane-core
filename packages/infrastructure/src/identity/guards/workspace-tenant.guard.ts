import { Inject, Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import type { WorkspaceScopeRecord, WorkspaceScopeResolverPort } from '@runlane/application';
import { WORKSPACE_SCOPE_RESOLVER } from '@runlane/application';

export interface WorkspaceScopedHttpRequest {
  readonly headers: Readonly<Record<string, string | readonly string[] | undefined>>;
  runlaneWorkspaceScope?: WorkspaceScopeRecord;
}

@Injectable()
export class WorkspaceTenantGuard implements CanActivate {
  constructor(
    @Inject(WORKSPACE_SCOPE_RESOLVER) private readonly scopeResolver: WorkspaceScopeResolverPort,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<WorkspaceScopedHttpRequest>();
    const authorizationHeader = readHeader(request.headers, 'authorization');
    request.runlaneWorkspaceScope = await this.scopeResolver.resolve({ authorizationHeader });

    return true;
  }
}

export function readWorkspaceScope(request: WorkspaceScopedHttpRequest): WorkspaceScopeRecord {
  const scope = request.runlaneWorkspaceScope;

  if (!scope) {
    throw new Error('Workspace scope was not resolved for this request');
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
