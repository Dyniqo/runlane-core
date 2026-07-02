export type JsonRecord = Record<string, unknown>;

export type Session = {
  readonly accessToken: string;
  readonly refreshToken: string | null;
  readonly user: UserProfile;
  readonly workspace: WorkspaceProfile;
  readonly expiresAt: string | null;
};

export type UserProfile = {
  readonly id: string;
  readonly email: string;
  readonly name: string;
};

export type WorkspaceProfile = {
  readonly id: string;
  readonly name: string;
  readonly role: string;
  readonly isDemo?: boolean;
};

export type WorkspaceSummary = {
  readonly id: string;
  readonly name: string;
  readonly role: string;
};

export type WorkflowStatus = 'draft' | 'published' | 'archived' | string;
export type WorkflowTrigger = 'webhook' | 'automation' | 'manual' | string;
export type WorkflowStepType = 'http' | 'ai_decision' | 'notification' | 'condition' | string;

export type WorkflowDefinition = {
  readonly schemaVersion: number;
  readonly trigger: {
    readonly type: WorkflowTrigger;
    readonly config: JsonRecord;
  };
  readonly entryStepKey: string;
  readonly steps: readonly WorkflowStep[];
};

export type WorkflowStep = {
  readonly key: string;
  readonly name: string;
  readonly type: WorkflowStepType;
  readonly config: JsonRecord;
  readonly timeoutMs?: number;
  readonly transitions?: JsonRecord;
};

export type Workflow = {
  readonly id: string;
  readonly publicId: string;
  readonly workspaceId: string;
  readonly name: string;
  readonly status: WorkflowStatus;
  readonly version: number;
  readonly triggerType: WorkflowTrigger;
  readonly definition: WorkflowDefinition;
  readonly publishedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type ExecutionStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'retrying'
  | 'dead_letter'
  | 'cancelled'
  | string;

export type Execution = {
  readonly id: string;
  readonly workflowId: string;
  readonly workflowPublicId: string;
  readonly workflowVersion: number;
  readonly status: ExecutionStatus;
  readonly attempts: number;
  readonly input: JsonRecord;
  readonly output: JsonRecord | null;
  readonly errorCode: string | null;
  readonly errorMessage: string | null;
  readonly durationMs: number | null;
  readonly queuedAt: string;
  readonly startedAt: string | null;
  readonly finishedAt: string | null;
  readonly createdAt: string;
};

export type ExecutionStep = {
  readonly id: string;
  readonly stepKey: string;
  readonly type: WorkflowStepType;
  readonly status: string;
  readonly durationMs: number | null;
  readonly errorMessage: string | null;
  readonly startedAt: string;
  readonly finishedAt: string | null;
};

export type ApiKeyRecord = {
  readonly id: string;
  readonly name: string;
  readonly prefix: string;
  readonly lastUsedAt: string | null;
  readonly revokedAt: string | null;
  readonly createdAt: string;
};

export type WorkflowSecret = {
  readonly key: string;
  readonly createdAt?: string;
  readonly updatedAt?: string;
};

export type ConnectorCredential = {
  readonly name: string;
  readonly type: string;
  readonly metadata?: JsonRecord;
  readonly createdAt?: string;
  readonly updatedAt?: string;
};

export type AuditLog = {
  readonly id: string;
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string | null;
  readonly metadata?: JsonRecord;
  readonly ip?: string | null;
  readonly userAgent?: string | null;
  readonly createdAt: string;
};

export type AutomationContract = {
  readonly mode: string;
  readonly workflowId: string;
  readonly workflowPublicId: string;
  readonly workflowVersion: number;
  readonly triggerType: string;
  readonly workflowStatus: string;
  readonly entryStepKey: string;
  readonly stepCount: number;
  readonly requestPath: string;
  readonly responseStatusCode: number;
};

export type AutomationRunResult = {
  readonly requestId: string;
  readonly executionId: string;
  readonly status: string;
  readonly source: string;
  readonly acceptedAt: string;
};

export type UsageSummary = {
  readonly plan: {
    readonly name: string;
    readonly limits: Record<string, number>;
    readonly used: Record<string, number>;
    readonly remaining: Record<string, number>;
  };
  readonly totals: Record<string, number>;
  readonly metrics: readonly { readonly type: string; readonly quantity: number }[];
};

export type HealthSnapshot = {
  readonly api: 'online' | 'offline';
  readonly ready: 'online' | 'offline';
  readonly queue: 'online' | 'offline';
};

export type ToastTone = 'success' | 'info' | 'warning' | 'danger';

export type Toast = {
  readonly id: string;
  readonly tone: ToastTone;
  readonly title: string;
  readonly message: string;
};

export type AppTab =
  | 'home'
  | 'workflows'
  | 'executions'
  | 'integrations'
  | 'usage'
  | 'plans'
  | 'audit';

export type AppState = {
  readonly apiBaseUrl: string;
  readonly activeTab: AppTab;
  readonly session: Session | null;
  readonly health: HealthSnapshot;
  readonly workflows: readonly Workflow[];
  readonly workspaces: readonly WorkspaceSummary[];
  readonly executions: readonly Execution[];
  readonly executionSteps: readonly ExecutionStep[];
  readonly apiKeys: readonly ApiKeyRecord[];
  readonly secrets: readonly WorkflowSecret[];
  readonly credentials: readonly ConnectorCredential[];
  readonly auditLogs: readonly AuditLog[];
  readonly usage: UsageSummary | null;
  readonly automationContract: AutomationContract | null;
  readonly automationRunResult: AutomationRunResult | null;
  readonly latestApiKeyToken: string | null;
  readonly selectedWorkflowId: string | null;
  readonly selectedExecutionId: string | null;
  readonly isBusy: boolean;
  readonly error: string | null;
  readonly toast: Toast | null;
  readonly draftName: string;
  readonly draftTriggerType: WorkflowTrigger;
  readonly payloadName: string;
  readonly payloadEmail: string;
  readonly payloadScore: number;
};
