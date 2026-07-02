import type {
  ApiKeyRecord,
  AuditLog,
  AutomationContract,
  AutomationRunResult,
  ConnectorCredential,
  Execution,
  ExecutionStep,
  HealthSnapshot,
  JsonRecord,
  Session,
  UsageSummary,
  Workflow,
  WorkflowDefinition,
  WorkflowSecret,
  WorkflowStep,
  WorkspaceSummary,
} from '../types';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class ApiRequestError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
  }
}

export function isAuthenticationError(error: unknown): boolean {
  return error instanceof ApiRequestError && (error.status === 401 || error.status === 403);
}

export function readApiBaseUrl(): string {
  const meta = import.meta as ImportMeta & {
    readonly env?: { readonly VITE_RUNLANE_API_URL?: unknown };
  };
  const envValue = meta.env?.VITE_RUNLANE_API_URL;
  return typeof envValue === 'string' && envValue.length > 0
    ? envValue.replace(/\/$/, '')
    : 'http://127.0.0.1:4600';
}

export function isUuid(value: string): boolean {
  return uuidPattern.test(value);
}

export function defaultDefinition(triggerType: string = 'automation'): WorkflowDefinition {
  return {
    schemaVersion: 1,
    trigger: { type: triggerType, config: {} },
    entryStepKey: 'qualify_lead',
    steps: [
      {
        key: 'qualify_lead',
        name: 'Qualify lead',
        type: 'condition',
        config: { pass: true, branch: 'success' },
        transitions: { onSuccess: 'notify_team' },
      },
      {
        key: 'notify_team',
        name: 'Notify team',
        type: 'notification',
        config: {
          provider: 'slack',
          message: 'Qualified lead accepted for review',
          severity: 'info',
          includeExecutionContext: true,
        },
      },
    ],
  };
}

export class ApiClient {
  private readonly baseUrl: string;
  private token: string | null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
    this.token = null;
  }

  setToken(token: string | null): void {
    this.token = token;
  }

  async health(): Promise<HealthSnapshot> {
    const [api, ready, queue] = await Promise.all([
      this.ping('/health'),
      this.ping('/health/ready'),
      this.ping('/health/queue'),
    ]);
    return { api, ready, queue };
  }

  async seedDemo(): Promise<{ readonly email: string; readonly password: string }> {
    const data = await this.request<JsonRecord>('/v1/demo/seed', { method: 'POST', auth: false });
    const demo = readObject(data.demo);
    const credentials = readObject(demo.credentials);
    return {
      email: readString(credentials.email, 'demo@runlane.local'),
      password: readString(credentials.password, 'RunlaneDemoPassword123!'),
    };
  }

  async register(name: string, email: string, password: string): Promise<void> {
    await this.request<JsonRecord>('/v1/auth/register', {
      method: 'POST',
      auth: false,
      body: { name, email, password },
    });
  }

  async logout(refreshToken: string): Promise<void> {
    await this.request<JsonRecord>('/v1/auth/logout', {
      method: 'POST',
      body: { refreshToken },
    });
  }

  async login(email: string, password: string, demoSessionId?: string): Promise<Session> {
    const body: JsonRecord = demoSessionId
      ? { email, password, demoSessionId }
      : { email, password };
    const data = await this.request<JsonRecord>('/v1/auth/login', {
      method: 'POST',
      auth: false,
      body,
    });
    const tokens = readObject(data.tokens);
    const user = readObject(data.user);
    const workspace = readObject(data.workspace);
    const accessToken = readString(tokens.accessToken, '');
    if (accessToken.length === 0) {
      throw new Error('The API returned a login response without an access token.');
    }
    this.token = accessToken;
    return {
      accessToken,
      refreshToken: readNullableString(tokens.refreshToken),
      expiresAt: readNullableString(tokens.accessTokenExpiresAt),
      user: {
        id: readString(user.id, ''),
        email: readString(user.email, email),
        name: readString(user.name, email),
      },
      workspace: {
        id: readString(workspace.id, ''),
        name: readString(workspace.name, 'Workspace'),
        role: readString(workspace.role, 'owner'),
        isDemo: Boolean(workspace.isDemo),
      },
    };
  }

  async me(): Promise<Session['workspace'] | null> {
    const data = await this.request<JsonRecord>('/v1/auth/me');
    const workspace = readObject(data.workspace);
    if (Object.keys(workspace).length === 0) return null;
    return {
      id: readString(workspace.id, ''),
      name: readString(workspace.name, 'Workspace'),
      role: readString(workspace.role, 'owner'),
    };
  }

  async listWorkspaces(): Promise<readonly WorkspaceSummary[]> {
    const data = await this.request<JsonRecord>('/v1/workspaces');
    return readArray(data.items).map(toWorkspaceSummary).filter(isPresent);
  }

  async currentWorkspace(): Promise<Session['workspace'] | null> {
    const data = await this.request<JsonRecord>('/v1/workspaces/current');
    return toWorkspaceProfile(readObject(data.workspace));
  }

  async updateWorkspaceName(name: string): Promise<Session['workspace'] | null> {
    const data = await this.request<JsonRecord>('/v1/workspaces/current', {
      method: 'PATCH',
      body: { name },
    });
    return toWorkspaceProfile(readObject(data.workspace));
  }

  async resetDemo(): Promise<void> {
    await this.request<JsonRecord>('/v1/demo/reset', { method: 'POST' });
  }

  async listWorkflows(): Promise<readonly Workflow[]> {
    const data = await this.request<JsonRecord>('/v1/workflows');
    return readArray(data.items).map(toWorkflow).filter(isPresent);
  }

  async getWorkflow(workflowId: string): Promise<Workflow | null> {
    if (!isUuid(workflowId)) return null;
    const data = await this.request<JsonRecord>(`/v1/workflows/${workflowId}`);
    return toWorkflow(readObject(data.workflow));
  }

  async createWorkflow(
    name: string,
    definition: WorkflowDefinition = defaultDefinition(),
  ): Promise<Workflow> {
    const data = await this.request<JsonRecord>('/v1/workflows', {
      method: 'POST',
      body: { name, triggerType: definition.trigger.type, definition },
    });
    return toWorkflow(readObject(data.workflow)) ?? createEmptyWorkflow(name, definition);
  }

  async updateDraftWorkflow(
    workflow: Workflow,
    name: string,
    definition: WorkflowDefinition,
  ): Promise<Workflow> {
    if (workflow.status !== 'draft') {
      return this.createWorkflow(`${name} draft`, definition);
    }
    const data = await this.request<JsonRecord>(`/v1/workflows/${workflow.id}`, {
      method: 'PATCH',
      body: { name, triggerType: definition.trigger.type, definition },
    });
    return toWorkflow(readObject(data.workflow)) ?? workflow;
  }

  async publishWorkflow(workflow: Workflow): Promise<Workflow> {
    if (workflow.status !== 'draft') return workflow;
    const data = await this.request<JsonRecord>(`/v1/workflows/${workflow.id}/publish`, {
      method: 'POST',
    });
    return toWorkflow(readObject(data.workflow)) ?? workflow;
  }

  async testWorkflow(workflow: Workflow, payload: JsonRecord): Promise<string> {
    const data = await this.request<JsonRecord>(`/v1/workflows/${workflow.id}/test`, {
      method: 'POST',
      body: { payload, source: 'console', idempotencyKey: `console-${Date.now()}` },
    });
    const contract = readObject(data.contract);
    return readString(contract.mode, 'accepted');
  }

  async listExecutions(): Promise<readonly Execution[]> {
    const executions: Execution[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 4; page += 1) {
      const query = cursor
        ? `/v1/executions?limit=100&cursor=${encodeURIComponent(cursor)}`
        : '/v1/executions?limit=100';
      const data = await this.request<JsonRecord>(query);
      executions.push(...readArray(data.items).map(toExecution).filter(isPresent));
      if (!data.hasMore) break;
      cursor = readNullableString(data.nextCursor);
      if (!cursor) break;
    }
    return executions;
  }

  async getExecution(executionId: string): Promise<Execution | null> {
    if (!isUuid(executionId)) return null;
    const data = await this.request<JsonRecord>(`/v1/executions/${executionId}`);
    return toExecution(readObject(data.execution));
  }

  async listExecutionSteps(executionId: string): Promise<readonly ExecutionStep[]> {
    if (!isUuid(executionId)) return [];
    const data = await this.request<JsonRecord>(`/v1/executions/${executionId}/steps`);
    return readArray(data.items).map(toExecutionStep).filter(isPresent);
  }

  async retryExecution(execution: Execution): Promise<void> {
    if (
      !isUuid(execution.id) ||
      (execution.status !== 'dead_letter' && execution.status !== 'failed')
    )
      return;
    await this.request<JsonRecord>(`/v1/executions/${execution.id}/retry`, { method: 'POST' });
  }

  async listApiKeys(): Promise<readonly ApiKeyRecord[]> {
    const data = await this.request<JsonRecord>('/v1/api-keys');
    return readArray(data.items).map(toApiKey).filter(isPresent);
  }

  async createApiKey(name: string): Promise<string> {
    const data = await this.request<JsonRecord>('/v1/api-keys', { method: 'POST', body: { name } });
    return readString(data.token, 'Created');
  }

  async revokeApiKey(id: string): Promise<void> {
    if (!isUuid(id)) return;
    await this.request<JsonRecord>(`/v1/api-keys/${id}`, { method: 'DELETE' });
  }

  async listSecrets(workflowId: string): Promise<readonly WorkflowSecret[]> {
    if (!isUuid(workflowId)) return [];
    const data = await this.request<JsonRecord>(`/v1/workflows/${workflowId}/secrets`);
    return readArray(data.items).map(toSecret).filter(isPresent);
  }

  async saveSecret(workflowId: string, key: string, value: string): Promise<void> {
    if (!isUuid(workflowId)) return;
    await this.request<JsonRecord>(`/v1/workflows/${workflowId}/secrets`, {
      method: 'POST',
      body: { key, value },
    });
  }

  async deleteSecret(workflowId: string, key: string): Promise<void> {
    if (!isUuid(workflowId) || key.length === 0) return;
    await this.request<JsonRecord>(
      `/v1/workflows/${workflowId}/secrets/${encodeURIComponent(key)}`,
      { method: 'DELETE' },
    );
  }

  async listCredentials(workflowId: string): Promise<readonly ConnectorCredential[]> {
    if (!isUuid(workflowId)) return [];
    const data = await this.request<JsonRecord>(
      `/v1/workflows/${workflowId}/connector-credentials`,
    );
    return readArray(data.items).map(toCredential).filter(isPresent);
  }

  async saveCredential(
    workflowId: string,
    name: string,
    type: string,
    value: string,
  ): Promise<void> {
    if (!isUuid(workflowId)) return;
    await this.request<JsonRecord>(`/v1/workflows/${workflowId}/connector-credentials`, {
      method: 'POST',
      body: { name, type, value, metadata: {} },
    });
  }

  async deleteCredential(workflowId: string, name: string): Promise<void> {
    if (!isUuid(workflowId) || name.length === 0) return;
    await this.request<JsonRecord>(
      `/v1/workflows/${workflowId}/connector-credentials/${encodeURIComponent(name)}`,
      { method: 'DELETE' },
    );
  }

  async usage(): Promise<UsageSummary | null> {
    const data = await this.request<JsonRecord>('/v1/usage/current');
    const plan = readObject(data.plan);
    if (Object.keys(plan).length === 0) return null;
    return {
      plan: {
        name: readString(plan.name, 'free'),
        limits: readNumberMap(plan.limits),
        used: readNumberMap(plan.used),
        remaining: readNumberMap(plan.remaining),
      },
      totals: readNumberMap(data.totals),
      metrics: readArray(data.metrics).map((item) => ({
        type: readString(readObject(item).type, 'metric'),
        quantity: readNumber(readObject(item).quantity, 0),
      })),
    };
  }

  async audit(): Promise<readonly AuditLog[]> {
    const logs: AuditLog[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 4; page += 1) {
      const query = cursor
        ? `/v1/audit-logs?limit=100&cursor=${encodeURIComponent(cursor)}`
        : '/v1/audit-logs?limit=100';
      const data = await this.request<JsonRecord>(query);
      logs.push(...readArray(data.items).map(toAuditLog).filter(isPresent));
      if (!data.hasMore) break;
      cursor = readNullableString(data.nextCursor);
      if (!cursor) break;
    }
    return logs;
  }

  async automationContract(workflow: Workflow, apiKeyToken: string): Promise<AutomationContract> {
    const data = await this.request<JsonRecord>(`/v1/automation/contracts/${workflow.publicId}`, {
      auth: false,
      apiKeyToken,
    });
    return toAutomationContract(readObject(data.contract));
  }

  async executeAutomation(
    workflow: Workflow,
    apiKeyToken: string,
    payload: JsonRecord,
  ): Promise<AutomationRunResult> {
    const data = await this.request<JsonRecord>(`/v1/automation/execute/${workflow.publicId}`, {
      method: 'POST',
      auth: false,
      apiKeyToken,
      headers: {
        'X-Runlane-Source': 'console',
        'X-Runlane-Idempotency-Key': `console-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      },
      body: { payload, source: 'console', metadata: { surface: 'web_console' } },
    });
    const automationRequest = readObject(data.automationRequest);
    const execution = readObject(data.execution);
    return {
      requestId: readString(automationRequest.id, ''),
      executionId: readString(execution.id, ''),
      status: readString(execution.status, 'queued'),
      source: readString(automationRequest.source, 'console'),
      acceptedAt: readString(automationRequest.acceptedAt, new Date().toISOString()),
    };
  }

  async checkout(plan: string): Promise<string> {
    const data = await this.request<JsonRecord>('/v1/billing/checkout', {
      method: 'POST',
      body: { plan },
    });
    return readString(data.url, '');
  }

  async portal(): Promise<string> {
    const data = await this.request<JsonRecord>('/v1/billing/portal', { method: 'POST' });
    return readString(data.url, '');
  }

  private async ping(path: string): Promise<'online' | 'offline'> {
    try {
      const response = await fetch(`${this.baseUrl}${path}`, { method: 'GET' });
      return response.ok ? 'online' : 'offline';
    } catch {
      return 'offline';
    }
  }

  private async request<T>(
    path: string,
    options: {
      readonly method?: string;
      readonly body?: JsonRecord;
      readonly auth?: boolean;
      readonly apiKeyToken?: string;
      readonly headers?: Record<string, string>;
    } = {},
  ): Promise<T> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...(options.headers ?? {}),
    };
    if (options.body) headers['Content-Type'] = 'application/json';
    if (options.apiKeyToken) headers['X-Runlane-Api-Key'] = options.apiKeyToken;
    if (options.auth !== false && this.token) headers.Authorization = `Bearer ${this.token}`;
    const requestInit: RequestInit = {
      method: options.method ?? 'GET',
      headers,
    };
    if (options.body) {
      requestInit.body = JSON.stringify(options.body);
    }
    const response = await fetch(`${this.baseUrl}${path}`, requestInit);
    const text = await response.text();
    const data = parseJson(text);
    if (!response.ok) {
      const message = readString(
        readObject(data).message,
        `Request failed with status ${response.status}`,
      );
      throw new ApiRequestError(message, response.status);
    }
    return data as T;
  }
}

function parseJson(text: string): unknown {
  if (text.length === 0) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return {};
  }
}

function readObject(value: unknown): JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function readArray(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function readString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function readNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function readNumberMap(value: unknown): Record<string, number> {
  return Object.fromEntries(
    Object.entries(readObject(value)).map(([key, item]) => [key, readNumber(item, 0)]),
  );
}

function toWorkspaceProfile(value: JsonRecord): Session['workspace'] | null {
  if (Object.keys(value).length === 0) return null;
  return {
    id: readString(value.id, ''),
    name: readString(value.name, 'Workspace'),
    role: readString(value.role, 'owner'),
    isDemo: Boolean(value.isDemo),
  };
}

function toWorkspaceSummary(value: unknown): WorkspaceSummary | null {
  const item = readObject(value);
  const id = readString(item.id, '');
  if (id.length === 0) return null;
  return {
    id,
    name: readString(item.name, 'Workspace'),
    role: readString(item.role, 'owner'),
  };
}

function toWorkflow(value: unknown): Workflow | null {
  const item = readObject(value);
  const definition = readObject(item.definition);
  return {
    id: readString(item.id, ''),
    publicId: readString(item.publicId, ''),
    workspaceId: readString(item.workspaceId, ''),
    name: readString(item.name, 'Workflow'),
    status: readString(item.status, 'draft'),
    version: readNumber(item.version, 1),
    triggerType: readString(item.triggerType, 'webhook'),
    definition: toDefinition(definition),
    publishedAt: readNullableString(item.publishedAt),
    createdAt: readString(item.createdAt, new Date().toISOString()),
    updatedAt: readString(item.updatedAt, new Date().toISOString()),
  };
}

function toDefinition(value: JsonRecord): WorkflowDefinition {
  const trigger = readObject(value.trigger);
  const steps = readArray(value.steps).map(toWorkflowStep).filter(isPresent);
  return {
    schemaVersion: readNumber(value.schemaVersion, 1),
    trigger: { type: readString(trigger.type, 'webhook'), config: readObject(trigger.config) },
    entryStepKey: readString(value.entryStepKey, steps[0]?.key ?? 'qualify_lead'),
    steps: steps.length > 0 ? steps : defaultDefinition().steps,
  };
}

function toWorkflowStep(value: unknown): WorkflowStep | null {
  const item = readObject(value);
  const key = readString(item.key, '');
  if (key.length === 0) return null;
  const step: WorkflowStep = {
    key,
    name: readString(item.name, key),
    type: readString(item.type, 'condition'),
    config: readObject(item.config),
    transitions: readObject(item.transitions),
  };
  return typeof item.timeoutMs === 'number' ? { ...step, timeoutMs: item.timeoutMs } : step;
}

function toExecution(value: unknown): Execution | null {
  const item = readObject(value);
  const id = readString(item.id, '');
  if (id.length === 0) return null;
  return {
    id,
    workflowId: readString(item.workflowId, ''),
    workflowPublicId: readString(item.workflowPublicId, ''),
    workflowVersion: readNumber(item.workflowVersion, 1),
    status: readString(item.status, 'queued'),
    attempts: readNumber(item.attempts, 0),
    input: readObject(item.input),
    output: Object.keys(readObject(item.output)).length > 0 ? readObject(item.output) : null,
    errorCode: readNullableString(item.errorCode),
    errorMessage: readNullableString(item.errorMessage),
    durationMs: typeof item.durationMs === 'number' ? item.durationMs : null,
    queuedAt: readString(item.queuedAt, readString(item.createdAt, new Date().toISOString())),
    startedAt: readNullableString(item.startedAt),
    finishedAt: readNullableString(item.finishedAt),
    createdAt: readString(item.createdAt, new Date().toISOString()),
  };
}

function toExecutionStep(value: unknown): ExecutionStep | null {
  const item = readObject(value);
  const id = readString(item.id, '');
  if (id.length === 0) return null;
  return {
    id,
    stepKey: readString(item.stepKey, 'step'),
    type: readString(item.type, 'condition'),
    status: readString(item.status, 'running'),
    durationMs: typeof item.durationMs === 'number' ? item.durationMs : null,
    errorMessage: readNullableString(item.errorMessage),
    startedAt: readString(item.startedAt, new Date().toISOString()),
    finishedAt: readNullableString(item.finishedAt),
  };
}

function toApiKey(value: unknown): ApiKeyRecord | null {
  const item = readObject(value);
  const id = readString(item.id, '');
  if (id.length === 0) return null;
  return {
    id,
    name: readString(item.name, 'API key'),
    prefix: readString(item.prefix, ''),
    lastUsedAt: readNullableString(item.lastUsedAt),
    revokedAt: readNullableString(item.revokedAt),
    createdAt: readString(item.createdAt, new Date().toISOString()),
  };
}

function toSecret(value: unknown): WorkflowSecret | null {
  const item = readObject(value);
  const key = readString(item.key, '');
  if (key.length === 0) return null;
  const secret: WorkflowSecret = { key };
  const createdAt = readNullableString(item.createdAt);
  const updatedAt = readNullableString(item.updatedAt);
  return {
    ...secret,
    ...(createdAt ? { createdAt } : {}),
    ...(updatedAt ? { updatedAt } : {}),
  };
}

function toCredential(value: unknown): ConnectorCredential | null {
  const item = readObject(value);
  const name = readString(item.name, '');
  if (name.length === 0) return null;
  const credential: ConnectorCredential = {
    name,
    type: readString(item.type, 'http'),
    metadata: readObject(item.metadata),
  };
  const createdAt = readNullableString(item.createdAt);
  const updatedAt = readNullableString(item.updatedAt);
  return {
    ...credential,
    ...(createdAt ? { createdAt } : {}),
    ...(updatedAt ? { updatedAt } : {}),
  };
}

function toAuditLog(value: unknown): AuditLog | null {
  const item = readObject(value);
  const id = readString(item.id, '');
  if (id.length === 0) return null;
  return {
    id,
    action: readString(item.action, 'activity'),
    entityType: readString(item.entityType, 'entity'),
    entityId: readNullableString(item.entityId),
    metadata: readObject(item.metadata),
    ip: readNullableString(item.ip),
    userAgent: readNullableString(item.userAgent),
    createdAt: readString(item.createdAt, new Date().toISOString()),
  };
}

function toAutomationContract(value: JsonRecord): AutomationContract {
  const request = readObject(value.request);
  const response = readObject(value.response);
  const responseBody = readObject(response.body);
  return {
    mode: readString(value.mode, 'automation_bridge'),
    workflowId: readString(value.workflowId, ''),
    workflowPublicId: readString(value.workflowPublicId, ''),
    workflowVersion: readNumber(value.workflowVersion, 1),
    triggerType: readString(value.triggerType, 'automation'),
    workflowStatus: readString(value.workflowStatus, 'published'),
    entryStepKey: readString(value.entryStepKey, ''),
    stepCount: readNumber(value.stepCount, 0),
    requestPath: readString(request.path, ''),
    responseStatusCode: readNumber(
      response.statusCode,
      readArray(responseBody.required).length > 0 ? 202 : 202,
    ),
  };
}

function createEmptyWorkflow(name: string, definition: WorkflowDefinition): Workflow {
  const now = new Date().toISOString();
  return {
    id: '',
    publicId: '',
    workspaceId: '',
    name,
    status: 'draft',
    version: 1,
    triggerType: definition.trigger.type,
    definition,
    publishedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

function isPresent<T>(value: T | null): value is T {
  return value !== null;
}
