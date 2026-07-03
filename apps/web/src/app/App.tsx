import { useEffect, useMemo, useState } from 'react';
import type { Dispatch, ReactElement, SetStateAction } from 'react';
import {
  ApiClient,
  defaultDefinition,
  isAuthenticationError,
  isUuid,
  readApiBaseUrl,
} from '../api';
import type {
  AppState,
  AppTab,
  ConnectorCredential,
  JsonRecord,
  ToastTone,
  Workflow,
  WorkflowDefinition,
  WorkflowSecret,
  WorkflowStep,
  WorkflowTrigger,
} from '../types';
import {
  clearSession,
  readDemoSessionId,
  readSession,
  readTheme,
  writeSession,
  writeTheme,
} from '../lib/session';
import type { ThemeMode } from '../lib/session';
import { Shell } from '../components/shell';
import { ToastViewport } from '../components/ui';
import { LoginView } from '../views/LoginView';
import { OverviewView } from '../views/OverviewView';
import { BuilderView } from '../views/BuilderView';
import { ExecutionsView } from '../views/ExecutionsView';
import { IntegrationsView } from '../views/IntegrationsView';
import { UsageView } from '../views/UsageView';
import { PlansView } from '../views/PlansView';
import { AuditView } from '../views/AuditView';

const tabRoutes: Record<AppTab, string> = {
  home: '/overview',
  workflows: '/builder',
  executions: '/runs',
  integrations: '/integrations',
  usage: '/usage',
  plans: '/plans',
  audit: '/audit',
};

const routeTabs: Record<string, AppTab> = {
  '/': 'home',
  '/overview': 'home',
  '/builder': 'workflows',
  '/runs': 'executions',
  '/integrations': 'integrations',
  '/usage': 'usage',
  '/plans': 'plans',
  '/audit': 'audit',
};

const initialState: AppState = {
  apiBaseUrl: readApiBaseUrl(),
  activeTab: readActiveTabFromPath(),
  session: readSession(),
  health: { api: 'offline', ready: 'offline', queue: 'offline' },
  workflows: [],
  workspaces: [],
  executions: [],
  executionSteps: [],
  apiKeys: [],
  secrets: [],
  credentials: [],
  auditLogs: [],
  usage: null,
  automationContract: null,
  automationRunResult: null,
  latestApiKeyToken: null,
  selectedWorkflowId: null,
  selectedExecutionId: null,
  isBusy: false,
  error: null,
  toast: null,
  draftName: 'Lead routing workflow',
  draftTriggerType: 'automation',
  payloadName: 'Ava Morgan',
  payloadEmail: 'ava@example.com',
  payloadScore: 86,
};

const TOAST_TIMEOUT_MS = 5200;

export function App(): ReactElement {
  const [state, setState] = useState<AppState>(initialState);
  const [theme, setTheme] = useState<ThemeMode>(() => readTheme());
  const [selectedStepKey, setSelectedStepKey] = useState<string | null>(null);
  const api = useMemo(() => {
    const client = new ApiClient(state.apiBaseUrl);
    client.setToken(state.session?.accessToken ?? null);
    return client;
  }, [state.apiBaseUrl, state.session?.accessToken]);

  const selectedWorkflow =
    state.workflows.find((workflow) => workflow.id === state.selectedWorkflowId) ??
    state.workflows[0] ??
    null;
  const selectedExecution =
    state.executions.find((execution) => execution.id === state.selectedExecutionId) ??
    state.executions[0] ??
    null;

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    writeTheme(theme);
  }, [theme]);

  useEffect(() => {
    const onPopState = (): void => {
      setState((current) => ({ ...current, activeTab: readActiveTabFromPath() }));
      scrollToPageStart();
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    if (window.location.pathname === '/')
      window.history.replaceState({}, '', tabRoutes[state.activeTab]);
  }, []);

  useEffect(() => {
    void refreshHealth(api, setState);
  }, [api]);

  useEffect(() => {
    if (!state.session) return;
    void loadWorkspace(api, setState).catch((error: unknown) => {
      if (isAuthenticationError(error)) handleAuthenticationFailure(setState, theme);
    });
  }, [api, state.session?.accessToken, theme]);

  useEffect(() => {
    if (state.session && selectedWorkflow?.id)
      void loadWorkflowIntegrations(api, setState, selectedWorkflow.id);
  }, [api, selectedWorkflow?.id, state.session?.accessToken]);

  useEffect(() => {
    if (!state.session || state.activeTab !== 'executions') return undefined;

    const hasOpenRun = state.executions.some((execution) =>
      ['queued', 'running', 'retrying'].includes(execution.status),
    );

    const refresh = (): void => {
      void refreshExecutionData(api, setState, state.selectedExecutionId);
    };

    window.addEventListener('focus', refresh);

    if (!hasOpenRun) {
      return () => window.removeEventListener('focus', refresh);
    }

    const timer = window.setInterval(refresh, 4500);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
    };
  }, [api, state.activeTab, state.executions, state.selectedExecutionId, state.session]);

  useEffect(() => {
    if (!state.session || state.activeTab !== 'executions' || !selectedExecution?.id) return;
    void refreshSelectedExecutionSteps(api, setState, selectedExecution.id);
  }, [api, selectedExecution?.id, selectedExecution?.status, state.activeTab, state.session]);

  useEffect(() => {
    setSelectedStepKey(selectedWorkflow?.definition.steps[0]?.key ?? null);
  }, [selectedWorkflow?.id]);

  useEffect(() => {
    if (!state.toast) return undefined;
    const toastId = state.toast.id;
    const timeout = window.setTimeout(() => {
      setState((current) =>
        current.toast?.id === toastId ? { ...current, toast: null } : current,
      );
    }, TOAST_TIMEOUT_MS);
    return () => window.clearTimeout(timeout);
  }, [state.toast?.id]);

  function navigate(activeTab: AppTab): void {
    const targetPath = tabRoutes[activeTab];
    if (window.location.pathname !== targetPath) window.history.pushState({}, '', targetPath);
    setState((current) => ({ ...current, activeTab }));
    scrollToPageStart();
  }

  async function guarded(action: () => Promise<void>, success?: string): Promise<void> {
    setState((current) => ({ ...current, isBusy: true, error: null }));
    try {
      await action();
      if (success) pushToast(setState, 'success', success, 'The workspace is up to date.');
    } catch (error) {
      if (isAuthenticationError(error)) {
        handleAuthenticationFailure(setState, theme);
        return;
      }
      const message =
        error instanceof Error ? error.message : 'The request could not be completed.';
      pushToast(setState, 'danger', 'Action needs attention', message);
    } finally {
      setState((current) => ({ ...current, isBusy: false }));
    }
  }

  async function login(email: string, password: string): Promise<void> {
    await guarded(async () => {
      const session = await api.login(
        email,
        password,
        shouldUseBrowserScopedDemoSession(email) ? readDemoSessionId() : undefined,
      );
      writeSession(session);
      setState((current) => ({ ...current, session, activeTab: readActiveTabFromPath() }));
      await loadWorkspace(api, setState);
    }, 'Signed in');
  }

  async function register(name: string, email: string, password: string): Promise<void> {
    await guarded(async () => {
      await api.register(name, email, password);
      const session = await api.login(email, password);
      writeSession(session);
      navigate('home');
      setState((current) => ({ ...current, session, activeTab: 'home' }));
      await loadWorkspace(api, setState);
    }, 'Workspace created');
  }

  async function demoLogin(): Promise<void> {
    await guarded(async () => {
      const credentials = await api.seedDemo();
      const session = await api.login(credentials.email, credentials.password, readDemoSessionId());
      writeSession(session);
      navigate('home');
      setState((current) => ({ ...current, session, activeTab: 'home' }));
      await loadWorkspace(api, setState);
    }, 'Demo workspace is ready');
  }

  async function createWorkflow(): Promise<void> {
    await guarded(async () => {
      const workflow = await api.createWorkflow(
        state.draftName,
        defaultDefinition(state.draftTriggerType),
      );
      const workflows = await api.listWorkflows();
      navigate('workflows');
      setState((current) => ({
        ...current,
        workflows,
        selectedWorkflowId: workflow.id || workflows[0]?.id || null,
        activeTab: 'workflows',
      }));
    }, 'Draft workflow created');
  }

  async function selectWorkflow(workflowId: string): Promise<void> {
    setState((current) => ({ ...current, selectedWorkflowId: workflowId }));
    await guarded(async () => {
      const [workflow, secrets, credentials] = await Promise.all([
        api.getWorkflow(workflowId),
        safeValue(() => api.listSecrets(workflowId), []),
        safeValue(() => api.listCredentials(workflowId), []),
      ]);
      if (!workflow) return;
      setState((current) => ({
        ...current,
        workflows: current.workflows.map((item) => (item.id === workflow.id ? workflow : item)),
        selectedWorkflowId: workflow.id,
        secrets,
        credentials,
      }));
    });
  }

  async function saveWorkflow(workflow: Workflow): Promise<void> {
    await guarded(
      async () => {
        const saved = await api.updateDraftWorkflow(
          workflow,
          workflow.name,
          withSafeVisualTouch(workflow.definition),
        );
        const workflows = await api.listWorkflows();
        setState((current) => ({
          ...current,
          workflows,
          selectedWorkflowId: saved.id || workflow.id,
        }));
      },
      workflow.status === 'draft' ? 'Workflow saved' : 'Editable draft created',
    );
  }

  async function publishWorkflow(workflow: Workflow): Promise<void> {
    await guarded(async () => {
      const published = await api.publishWorkflow(workflow);
      const workflows = await api.listWorkflows();
      setState((current) => ({ ...current, workflows, selectedWorkflowId: published.id }));
    }, 'Workflow published');
  }

  async function validateWorkflow(workflow: Workflow): Promise<void> {
    await guarded(async () => {
      const mode = await api.testWorkflow(workflow, consolePayloadForWorkflow(workflow, state));
      pushToast(setState, 'success', 'Workflow contract ready', `Validation mode: ${mode}.`);
    });
  }

  async function runWorkflowCheck(workflow: Workflow): Promise<void> {
    await guarded(async () => {
      const prepared = await prepareRunnableWorkflow(api, workflow);
      const token = state.latestApiKeyToken ?? (await api.createApiKey('Console execution key'));
      const result = await api.executeAutomation(
        prepared,
        token,
        consolePayloadForWorkflow(prepared, state),
      );
      await waitForQueueSnapshot();
      const [executions, usage, auditLogs, steps] = await Promise.all([
        api.listExecutions(),
        safeValue(() => api.usage(), state.usage),
        safeValue(() => api.audit(), state.auditLogs),
        result.executionId ? safeValue(() => api.listExecutionSteps(result.executionId), []) : [],
      ]);
      navigate('executions');
      setState((current) => ({
        ...current,
        workflows: current.workflows.map((item) => (item.id === prepared.id ? prepared : item)),
        latestApiKeyToken: token,
        automationRunResult: result,
        executions,
        usage,
        auditLogs,
        executionSteps: steps,
        selectedExecutionId: result.executionId || executions[0]?.id || current.selectedExecutionId,
        activeTab: 'executions',
      }));
    }, 'Execution accepted');
  }

  async function selectExecution(execution: (typeof state.executions)[number]): Promise<void> {
    setState((current) => ({ ...current, selectedExecutionId: execution.id, executionSteps: [] }));
    if (!isUuid(execution.id)) return;
    await guarded(async () => {
      const steps = await api.listExecutionSteps(execution.id);
      setState((current) => ({ ...current, executionSteps: steps }));
    });
  }

  async function retryExecution(execution: (typeof state.executions)[number]): Promise<void> {
    await guarded(async () => {
      await api.retryExecution(execution);
      await refreshExecutionData(api, setState, execution.id);
    }, 'Retry requested');
  }

  async function refreshRuns(): Promise<void> {
    await guarded(async () => {
      await refreshExecutionData(api, setState, state.selectedExecutionId);
    }, 'Runs refreshed');
  }

  async function createApiKey(): Promise<void> {
    await guarded(async () => {
      const token = await api.createApiKey('Console operator key');
      const apiKeys = await api.listApiKeys();
      setState((current) => ({ ...current, apiKeys, latestApiKeyToken: token }));
    }, 'API key created');
  }

  async function revokeApiKey(id: string): Promise<void> {
    await guarded(async () => {
      await api.revokeApiKey(id);
      const apiKeys = await api.listApiKeys();
      setState((current) => ({ ...current, apiKeys }));
    }, 'API key revoked');
  }

  async function renameWorkspace(name: string): Promise<void> {
    await guarded(async () => {
      const workspace = await api.updateWorkspaceName(name);
      if (!workspace) return;
      setState((current) => ({
        ...current,
        session: current.session ? { ...current.session, workspace } : current.session,
      }));
    }, 'Workspace updated');
  }

  async function saveSecret(
    secret: Pick<WorkflowSecret, 'key'> & { readonly value: string },
  ): Promise<void> {
    if (!selectedWorkflow) return;
    await guarded(async () => {
      await api.saveSecret(selectedWorkflow.id, secret.key, secret.value);
      const secrets = await api.listSecrets(selectedWorkflow.id);
      setState((current) => ({ ...current, secrets }));
    }, 'Secret saved');
  }

  async function deleteSecret(key: string): Promise<void> {
    if (!selectedWorkflow) return;
    await guarded(async () => {
      await api.deleteSecret(selectedWorkflow.id, key);
      const secrets = await api.listSecrets(selectedWorkflow.id);
      setState((current) => ({ ...current, secrets }));
    }, 'Secret deleted');
  }

  async function saveCredential(
    credential: Pick<ConnectorCredential, 'name' | 'type'> & { readonly value: string },
  ): Promise<void> {
    if (!selectedWorkflow) return;
    await guarded(async () => {
      await api.saveCredential(
        selectedWorkflow.id,
        credential.name,
        credential.type,
        credential.value,
      );
      const credentials = await api.listCredentials(selectedWorkflow.id);
      setState((current) => ({ ...current, credentials }));
    }, 'Credential saved');
  }

  async function deleteCredential(name: string): Promise<void> {
    if (!selectedWorkflow) return;
    await guarded(async () => {
      await api.deleteCredential(selectedWorkflow.id, name);
      const credentials = await api.listCredentials(selectedWorkflow.id);
      setState((current) => ({ ...current, credentials }));
    }, 'Credential deleted');
  }

  async function loadAutomationContract(workflow: Workflow): Promise<void> {
    await guarded(async () => {
      const prepared = await prepareRunnableWorkflow(api, workflow);
      const token = state.latestApiKeyToken ?? (await api.createApiKey('Console contract key'));
      const contract = await api.automationContract(prepared, token);
      const workflows = await api.listWorkflows();
      setState((current) => ({
        ...current,
        workflows,
        selectedWorkflowId: prepared.id,
        latestApiKeyToken: token,
        automationContract: contract,
      }));
    }, 'Bridge contract loaded');
  }

  async function openBilling(plan: string): Promise<void> {
    await guarded(async () => {
      const url = await api.checkout(plan);
      if (url.length === 0) throw new Error('Billing provider did not return a checkout link.');
      window.location.assign(url);
    });
  }

  async function openPortal(): Promise<void> {
    await guarded(async () => {
      const url = await api.portal();
      if (url.length === 0) throw new Error('Billing provider did not return a portal link.');
      window.location.assign(url);
    });
  }

  async function resetDemo(): Promise<void> {
    await guarded(async () => {
      await api.resetDemo();
      await loadWorkspace(api, setState);
    }, 'Demo reset completed');
  }

  async function signOut(): Promise<void> {
    const refreshToken = state.session?.refreshToken ?? null;
    if (refreshToken) await safeValue(() => api.logout(refreshToken), undefined);
    clearSession();
    navigate('home');
    setState((current) => ({
      ...initialState,
      activeTab: 'home',
      health: current.health,
      session: null,
    }));
  }

  if (!state.session) {
    return (
      <div data-theme={theme}>
        <LoginView
          state={state}
          theme={theme}
          onTheme={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
          onLogin={login}
          onRegister={register}
          onDemo={demoLogin}
        />
        {state.isBusy ? <div className="busy-line" /> : null}
        <ToastViewport
          toast={state.toast}
          timeoutMs={TOAST_TIMEOUT_MS}
          onClose={() => setState((current) => ({ ...current, toast: null }))}
        />
      </div>
    );
  }

  return (
    <Shell
      state={state}
      theme={theme}
      onNavigate={navigate}
      onTheme={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
      onSignOut={() => void signOut()}
    >
      {state.activeTab === 'home' ? (
        <OverviewView
          state={state}
          workflow={selectedWorkflow}
          onCreate={createWorkflow}
          onRun={runWorkflowCheck}
          onReset={resetDemo}
          onNavigate={navigate}
        />
      ) : null}
      {state.activeTab === 'workflows' ? (
        <BuilderView
          state={state}
          setState={setState}
          workflow={selectedWorkflow}
          selectedStepKey={selectedStepKey}
          setSelectedStepKey={setSelectedStepKey}
          onCreate={createWorkflow}
          onSelectWorkflow={selectWorkflow}
          onSave={saveWorkflow}
          onPublish={publishWorkflow}
          onRun={runWorkflowCheck}
          onTest={validateWorkflow}
        />
      ) : null}
      {state.activeTab === 'executions' ? (
        <ExecutionsView
          state={state}
          selectedExecution={selectedExecution}
          onSelect={selectExecution}
          onRetry={retryExecution}
          onRefresh={refreshRuns}
        />
      ) : null}
      {state.activeTab === 'integrations' ? (
        <IntegrationsView
          state={state}
          workflow={selectedWorkflow}
          onCreateKey={createApiKey}
          onRevokeKey={revokeApiKey}
          onSecret={saveSecret}
          onDeleteSecret={deleteSecret}
          onCredential={saveCredential}
          onDeleteCredential={deleteCredential}
          onRenameWorkspace={renameWorkspace}
          onLoadContract={loadAutomationContract}
          onRun={runWorkflowCheck}
        />
      ) : null}
      {state.activeTab === 'usage' ? <UsageView state={state} /> : null}
      {state.activeTab === 'plans' ? (
        <PlansView state={state} onCheckout={openBilling} onPortal={openPortal} />
      ) : null}
      {state.activeTab === 'audit' ? <AuditView state={state} /> : null}
      <ToastViewport
        toast={state.toast}
        timeoutMs={TOAST_TIMEOUT_MS}
        onClose={() => setState((current) => ({ ...current, toast: null }))}
      />
    </Shell>
  );
}

function handleAuthenticationFailure(
  setState: Dispatch<SetStateAction<AppState>>,
  theme: ThemeMode,
): void {
  clearSession();
  window.history.replaceState({}, '', tabRoutes.home);
  scrollToPageStart();
  setState((current) => ({
    ...initialState,
    apiBaseUrl: current.apiBaseUrl,
    health: current.health,
    activeTab: 'home',
    session: null,
    toast: {
      id: `${Date.now()}`,
      tone: 'warning',
      title: 'Session expired',
      message: 'Please sign in again to continue.',
    },
  }));
  document.documentElement.dataset.theme = theme;
}

async function refreshHealth(
  api: ApiClient,
  setState: Dispatch<SetStateAction<AppState>>,
): Promise<void> {
  const health = await api.health();
  setState((current) => ({ ...current, health }));
}

async function loadWorkspace(
  api: ApiClient,
  setState: Dispatch<SetStateAction<AppState>>,
): Promise<void> {
  const [workspace, workspaces, workflows, executions, apiKeys, usage, auditLogs] =
    await Promise.all([
      safeValue(() => api.currentWorkspace(), null),
      safeValue(() => api.listWorkspaces(), []),
      safeValue(() => api.listWorkflows(), []),
      safeValue(() => api.listExecutions(), []),
      safeValue(() => api.listApiKeys(), []),
      safeValue(() => api.usage(), null),
      safeValue(() => api.audit(), []),
    ]);
  const firstWorkflowId = workflows[0]?.id ?? null;
  const [secrets, credentials] = firstWorkflowId
    ? await Promise.all([
        safeValue(() => api.listSecrets(firstWorkflowId), []),
        safeValue(() => api.listCredentials(firstWorkflowId), []),
      ])
    : ([[], []] as const);
  setState((current) => {
    const selectedWorkflowId =
      current.selectedWorkflowId &&
      workflows.some((workflow) => workflow.id === current.selectedWorkflowId)
        ? current.selectedWorkflowId
        : firstWorkflowId;
    return {
      ...current,
      session: workspace && current.session ? { ...current.session, workspace } : current.session,
      workspaces,
      workflows,
      executions,
      apiKeys,
      usage,
      auditLogs,
      secrets: selectedWorkflowId === firstWorkflowId ? secrets : current.secrets,
      credentials: selectedWorkflowId === firstWorkflowId ? credentials : current.credentials,
      selectedWorkflowId,
      selectedExecutionId: current.selectedExecutionId ?? executions[0]?.id ?? null,
    };
  });
}

async function loadWorkflowIntegrations(
  api: ApiClient,
  setState: Dispatch<SetStateAction<AppState>>,
  workflowId: string,
): Promise<void> {
  const [secrets, credentials] = await Promise.all([
    safeValue(() => api.listSecrets(workflowId), []),
    safeValue(() => api.listCredentials(workflowId), []),
  ]);
  setState((current) =>
    current.selectedWorkflowId === workflowId ? { ...current, secrets, credentials } : current,
  );
}

async function refreshExecutionData(
  api: ApiClient,
  setState: Dispatch<SetStateAction<AppState>>,
  selectedExecutionId: string | null,
): Promise<void> {
  const [executions, usage, auditLogs] = await Promise.all([
    safeValue(() => api.listExecutions(), []),
    safeValue(() => api.usage(), null),
    safeValue(() => api.audit(), []),
  ]);
  const nextSelectedId =
    selectedExecutionId && executions.some((execution) => execution.id === selectedExecutionId)
      ? selectedExecutionId
      : (executions[0]?.id ?? null);
  const steps = nextSelectedId
    ? await safeValue(() => api.listExecutionSteps(nextSelectedId), [])
    : [];
  setState((current) => ({
    ...current,
    executions,
    usage,
    auditLogs,
    executionSteps: steps,
    selectedExecutionId: nextSelectedId,
  }));
}

async function refreshSelectedExecutionSteps(
  api: ApiClient,
  setState: Dispatch<SetStateAction<AppState>>,
  executionId: string,
): Promise<void> {
  if (!isUuid(executionId)) return;
  const [execution, steps] = await Promise.all([
    safeValue(() => api.getExecution(executionId), null),
    safeValue(() => api.listExecutionSteps(executionId), []),
  ]);
  setState((current) => ({
    ...current,
    executions: execution
      ? current.executions.map((item) => (item.id === execution.id ? execution : item))
      : current.executions,
    executionSteps: current.selectedExecutionId === executionId ? steps : current.executionSteps,
  }));
}

async function safeValue<T>(loader: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await loader();
  } catch (error) {
    if (isAuthenticationError(error)) throw error;
    return fallback;
  }
}

function pushToast(
  setState: Dispatch<SetStateAction<AppState>>,
  tone: ToastTone,
  title: string,
  message: string,
): void {
  setState((current) => ({ ...current, toast: { id: `${Date.now()}`, tone, title, message } }));
}

function consolePayloadForWorkflow(workflow: Workflow, state: AppState): JsonRecord {
  const issuedAt = new Date().toISOString();
  const requestId = `console-${Date.now()}`;
  const payload = mergeJsonRecords(
    buildConsolePayloadProfile(state, issuedAt, requestId),
    readConfiguredConsolePayload(workflow.definition.trigger.config),
  );

  for (const path of collectPayloadTemplatePaths(workflow.definition)) {
    ensurePayloadPath(payload, path, defaultConsolePayloadValue(path, state, issuedAt, requestId));
  }

  refreshConsoleRuntimeFields(payload, issuedAt, requestId, state);

  return payload;
}

function buildConsolePayloadProfile(
  state: AppState,
  issuedAt: string,
  requestId: string,
): JsonRecord {
  const urgency = state.payloadScore >= 80 ? 'high' : 'standard';
  return {
    name: state.payloadName,
    email: state.payloadEmail,
    score: state.payloadScore,
    source: 'console',
    company: 'Northstar Digital',
    companyDomain: 'northstar.example',
    title: `${state.payloadName} requested workflow automation`,
    urgency: urgency,
    notes:
      'Inbound automation request from the console with webhook, queue, integration and routing context.',
    receivedAt: issuedAt,
    requestId: requestId,
    event: 'lead.created',
    externalId: `lead-${state.payloadScore}-${Date.now()}`,
    id: `evt_${requestId.replace(/[^a-zA-Z0-9]/g, '_')}`,
    type: 'customer.subscription.updated',
    data: {
      object: {
        customer: 'cus_runlane_demo',
        id: 'sub_runlane_demo',
        status: 'active',
      },
    },
  };
}

function refreshConsoleRuntimeFields(
  payload: JsonRecord,
  issuedAt: string,
  requestId: string,
  state: AppState,
): void {
  payload.receivedAt = issuedAt;
  payload.requestId = requestId;
  payload.externalId = `lead-${state.payloadScore}-${Date.now()}`;

  if (payload.type === 'customer.subscription.updated') {
    payload.id = `evt_${requestId.replace(/[^a-zA-Z0-9]/g, '_')}`;
  }
}

function readConfiguredConsolePayload(config: JsonRecord): JsonRecord {
  const consolePayload = config.consolePayload;
  if (isJsonRecord(consolePayload)) return cloneJsonRecord(consolePayload);

  const samplePayload = config.samplePayload;
  if (isJsonRecord(samplePayload)) return cloneJsonRecord(samplePayload);

  return {};
}

function collectPayloadTemplatePaths(definition: WorkflowDefinition): readonly string[] {
  const paths = new Set<string>();
  const templatePattern = /{{\s*payload\.([a-zA-Z0-9_.-]+)\s*}}/g;
  const serializedDefinition = JSON.stringify(definition);
  let match = templatePattern.exec(serializedDefinition);

  while (match) {
    const path = match[1]?.trim();
    if (path) paths.add(path);
    match = templatePattern.exec(serializedDefinition);
  }

  return [...paths];
}

function ensurePayloadPath(payload: JsonRecord, path: string, value: unknown): void {
  const parts = path.split('.').filter(Boolean);
  if (parts.length === 0) return;

  let current: JsonRecord = payload;
  for (const part of parts.slice(0, -1)) {
    const next = current[part];
    if (!isJsonRecord(next)) {
      const created: JsonRecord = {};
      current[part] = created;
      current = created;
    } else {
      current = next;
    }
  }

  const last = parts.at(-1);
  if (!last || current[last] !== undefined) return;
  current[last] = value;
}

function defaultConsolePayloadValue(
  path: string,
  state: AppState,
  issuedAt: string,
  requestId: string,
): unknown {
  const last = path.split('.').filter(Boolean).at(-1) ?? path;
  const urgency = state.payloadScore >= 80 ? 'high' : 'standard';
  const values: Record<string, unknown> = {
    name: state.payloadName,
    email: state.payloadEmail,
    score: state.payloadScore,
    source: 'console',
    company: 'Northstar Digital',
    companyDomain: 'northstar.example',
    title: `${state.payloadName} requested workflow automation`,
    urgency: urgency,
    notes: 'Prepared console payload for a safe public demo execution.',
    receivedAt: issuedAt,
    requestId: requestId,
    event: 'lead.created',
    externalId: `lead-${state.payloadScore}-${Date.now()}`,
    id:
      path === 'data.object.id'
        ? 'sub_runlane_demo'
        : `evt_${requestId.replace(/[^a-zA-Z0-9]/g, '_')}`,
    type: 'customer.subscription.updated',
    customer: 'cus_runlane_demo',
    status: 'active',
  };

  return values[last] ?? `console-${last}`;
}

function mergeJsonRecords(base: JsonRecord, override: JsonRecord): JsonRecord {
  const merged = cloneJsonRecord(base);

  for (const [key, value] of Object.entries(override)) {
    const current = merged[key];
    if (isJsonRecord(current) && isJsonRecord(value)) {
      merged[key] = mergeJsonRecords(current, value);
    } else {
      merged[key] = cloneJsonValue(value);
    }
  }

  return merged;
}

function cloneJsonRecord(record: JsonRecord): JsonRecord {
  return cloneJsonValue(record) as JsonRecord;
}

function cloneJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cloneJsonValue);
  if (isJsonRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, cloneJsonValue(item)]),
    );
  }
  return value;
}

function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function prepareRunnableWorkflow(api: ApiClient, workflow: Workflow): Promise<Workflow> {
  const runnableDefinition = {
    ...workflow.definition,
    trigger: { ...workflow.definition.trigger, type: 'automation' as WorkflowTrigger },
  };
  const draft =
    workflow.status === 'draft'
      ? await api.updateDraftWorkflow(
          { ...workflow, triggerType: 'automation', definition: runnableDefinition },
          workflow.name,
          runnableDefinition,
        )
      : workflow;
  return draft.status === 'published' ? draft : api.publishWorkflow(draft);
}

function waitForQueueSnapshot(): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, 450);
  });
}

function withSafeVisualTouch(definition: WorkflowDefinition): WorkflowDefinition {
  return { ...definition, steps: definition.steps.map((step): WorkflowStep => ({ ...step })) };
}

function scrollToPageStart(): void {
  window.requestAnimationFrame(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    document.querySelector('.content-stage')?.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  });
}

function readActiveTabFromPath(): AppTab {
  return routeTabs[window.location.pathname] ?? 'home';
}

function shouldUseBrowserScopedDemoSession(email: string): boolean {
  return email.trim().toLowerCase() === 'demo@runlane.local';
}
