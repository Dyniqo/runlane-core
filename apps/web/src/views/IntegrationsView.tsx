import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import type { AppState, ConnectorCredential, Workflow, WorkflowSecret } from '../types';
import { formatDate, titleCase } from '../lib/format';
import {
  Button,
  Card,
  EmptyState,
  PanelHeader,
  SelectField,
  StatusBadge,
  TextField,
} from '../components/ui';

export function IntegrationsView({
  state,
  workflow,
  onCreateKey,
  onRevokeKey,
  onSecret,
  onDeleteSecret,
  onCredential,
  onDeleteCredential,
  onRenameWorkspace,
  onLoadContract,
  onRun,
}: {
  readonly state: AppState;
  readonly workflow: Workflow | null;
  readonly onCreateKey: () => Promise<void>;
  readonly onRevokeKey: (id: string) => Promise<void>;
  readonly onSecret: (
    secret: Pick<WorkflowSecret, 'key'> & { readonly value: string },
  ) => Promise<void>;
  readonly onDeleteSecret: (key: string) => Promise<void>;
  readonly onCredential: (
    credential: Pick<ConnectorCredential, 'name' | 'type'> & { readonly value: string },
  ) => Promise<void>;
  readonly onDeleteCredential: (name: string) => Promise<void>;
  readonly onRenameWorkspace: (name: string) => Promise<void>;
  readonly onLoadContract: (workflow: Workflow) => Promise<void>;
  readonly onRun: (workflow: Workflow) => Promise<void>;
}): ReactElement {
  const [workspaceName, setWorkspaceName] = useState(state.session?.workspace.name ?? 'Workspace');
  const [secretKey, setSecretKey] = useState('routing_token');
  const [secretValue, setSecretValue] = useState('');
  const [credentialName, setCredentialName] = useState('primary_http_endpoint');
  const [credentialType, setCredentialType] = useState('bearer_token');
  const [credentialValue, setCredentialValue] = useState('');

  useEffect(() => {
    setWorkspaceName(state.session?.workspace.name ?? 'Workspace');
  }, [state.session?.workspace.name]);

  return (
    <div className="integration-page operations-grid">
      <Card className="integration-control-card workspace-control-card">
        <PanelHeader
          eyebrow="Workspace"
          title="Workspace profile"
          caption="Update the active workspace and review accessible scopes."
          actions={
            <Button size="sm" tone="primary" onClick={() => void onRenameWorkspace(workspaceName)}>
              Save name
            </Button>
          }
        />
        <div className="integration-form-panel">
          <TextField
            label="Workspace name"
            value={workspaceName}
            onChange={(event) => setWorkspaceName(event.target.value)}
          />
          <div className="integration-support-grid">
            <div>
              <span>Role</span>
              <strong>{titleCase(state.session?.workspace.role ?? 'owner')}</strong>
            </div>
            <div>
              <span>Mode</span>
              <strong>{state.session?.workspace.isDemo ? 'Session workspace' : 'Workspace'}</strong>
            </div>
            <div>
              <span>Available workspaces</span>
              <strong>{state.workspaces.length}</strong>
            </div>
            <div>
              <span>Current id</span>
              <strong>{state.session?.workspace.id.slice(0, 8) ?? '—'}</strong>
            </div>
          </div>
        </div>
      </Card>

      <Card className="integration-control-card">
        <PanelHeader
          eyebrow="Access"
          title="API keys"
          caption="Issue and revoke workspace keys for automation callers."
          actions={
            <Button size="sm" tone="primary" onClick={() => void onCreateKey()}>
              Create key
            </Button>
          }
        />
        {state.latestApiKeyToken ? (
          <div className="token-ready-card">
            <span>One-time token ready</span>
            <strong>{state.latestApiKeyToken.slice(0, 22)}…</strong>
            <p>Use it during this browser session for automation bridge checks.</p>
          </div>
        ) : null}
        <div className="record-list bounded-scroll">
          {state.apiKeys.map((key, index) => (
            <div className="record-row action-row api-key-row" key={key.id}>
              <div>
                <strong>{key.name || `Workspace key ${index + 1}`}</strong>
                <span>
                  {key.prefix ? `${key.prefix} · ` : ''}Created {formatDate(key.createdAt)}
                  {key.lastUsedAt ? ` · used ${formatDate(key.lastUsedAt)}` : ''}
                </span>
              </div>
              <div className="row-actions">
                <StatusBadge value={key.revokedAt ? 'revoked' : 'active'} />
                <Button
                  size="sm"
                  tone="danger"
                  disabled={Boolean(key.revokedAt)}
                  onClick={() => void onRevokeKey(key.id)}
                >
                  Revoke
                </Button>
              </div>
            </div>
          ))}
          {state.apiKeys.length === 0 ? (
            <EmptyState
              title="No API keys"
              caption="Create a key when an external automation needs access."
            />
          ) : null}
        </div>
      </Card>

      <Card className="integration-control-card">
        <PanelHeader
          eyebrow="Workflow scope"
          title="Secrets"
          caption={workflow ? `Masked values for ${workflow.name}.` : 'Select a workflow first.'}
          actions={
            <Button
              size="sm"
              tone="primary"
              disabled={!workflow || secretKey.length < 2 || secretValue.length === 0}
              onClick={() => void onSecret({ key: secretKey, value: secretValue })}
            >
              Save secret
            </Button>
          }
        />
        <div className="integration-form-panel two-col-form">
          <TextField
            label="Secret key"
            value={secretKey}
            onChange={(event) => setSecretKey(event.target.value)}
          />
          <TextField
            label="Secret value"
            type="password"
            value={secretValue}
            onChange={(event) => setSecretValue(event.target.value)}
          />
        </div>
        <div className="record-list bounded-scroll">
          {state.secrets.map((secret) => (
            <div className="record-row action-row" key={secret.key}>
              <div>
                <strong>{titleCase(secret.key)}</strong>
                <span>
                  Masked at rest · updated{' '}
                  {formatDate(secret.updatedAt ?? secret.createdAt ?? null)}
                </span>
              </div>
              <Button
                size="sm"
                tone="danger"
                disabled={!workflow}
                onClick={() => void onDeleteSecret(secret.key)}
              >
                Delete
              </Button>
            </div>
          ))}
          {state.secrets.length === 0 ? (
            <EmptyState
              title="No secrets listed"
              caption="Store a workflow secret when a step needs protected runtime input."
            />
          ) : null}
        </div>
      </Card>

      <Card className="integration-control-card">
        <PanelHeader
          eyebrow="Connectors"
          title="Credentials"
          caption="Create, rotate, and delete masked connector credentials."
          actions={
            <Button
              size="sm"
              tone="primary"
              disabled={!workflow || credentialName.length < 2 || credentialValue.length === 0}
              onClick={() =>
                void onCredential({
                  name: credentialName,
                  type: credentialType,
                  value: credentialValue,
                })
              }
            >
              Save credential
            </Button>
          }
        />
        <div className="integration-form-panel credential-form-grid">
          <TextField
            label="Credential name"
            value={credentialName}
            onChange={(event) => setCredentialName(event.target.value)}
          />
          <SelectField
            label="Credential type"
            value={credentialType}
            onChange={(event) => setCredentialType(event.target.value)}
          >
            <option value="bearer_token">Bearer token</option>
            <option value="api_key">API key</option>
            <option value="basic_auth">Basic auth</option>
            <option value="custom_header">Custom header</option>
          </SelectField>
          <TextField
            label="Credential value"
            type="password"
            value={credentialValue}
            onChange={(event) => setCredentialValue(event.target.value)}
          />
        </div>
        <div className="record-list bounded-scroll">
          {state.credentials.map((credential) => (
            <div className="record-row action-row" key={credential.name}>
              <div>
                <strong>{titleCase(credential.name)}</strong>
                <span>
                  {titleCase(credential.type)} · masked credential ·{' '}
                  {formatDate(credential.updatedAt ?? credential.createdAt ?? null)}
                </span>
              </div>
              <Button
                size="sm"
                tone="danger"
                disabled={!workflow}
                onClick={() => void onDeleteCredential(credential.name)}
              >
                Delete
              </Button>
            </div>
          ))}
          {state.credentials.length === 0 ? (
            <EmptyState
              title="No credentials listed"
              caption="Save a connector credential for HTTP or notification steps."
            />
          ) : null}
        </div>
      </Card>

      <Card className="integration-control-card integration-wide-card bridge-redesign-card">
        <PanelHeader
          eyebrow="Automation bridge"
          title="Contract and execution controls"
          caption={
            workflow
              ? `Prepare the protected contract for ${workflow.name} and run it through the queue.`
              : 'Select a workflow to prepare a callable bridge contract.'
          }
          actions={
            <div className="bridge-redesign-actions">
              <Button
                size="sm"
                disabled={!workflow}
                onClick={() => (workflow ? void onLoadContract(workflow) : undefined)}
              >
                Load contract
              </Button>
              <Button
                size="sm"
                tone="primary"
                disabled={!workflow}
                onClick={() => (workflow ? void onRun(workflow) : undefined)}
              >
                Run execution
              </Button>
            </div>
          }
        />
        <div className="bridge-redesign-grid">
          <div className="bridge-route-card">
            <span>Callable route</span>
            <strong>
              {state.automationContract?.requestPath ||
                (workflow?.publicId
                  ? `/v1/automation/execute/${workflow.publicId}`
                  : 'Publish the selected workflow')}
            </strong>
            <p>
              API-key protected execution route with idempotency and queue-backed processing.
            </p>
          </div>
          <div className="bridge-stat-grid">
            <BridgeStat label="Workflow" value={workflow?.publicId || '—'} />
            <BridgeStat label="Trigger" value={workflow ? titleCase(workflow.triggerType) : '—'} />
            <BridgeStat
              label="Contract status"
              value={state.automationContract ? 'Ready' : 'Not loaded'}
            />
            <BridgeStat
              label="Last execution"
              value={
                state.automationRunResult ? state.automationRunResult.executionId.slice(0, 12) : '—'
              }
            />
          </div>
        </div>
      </Card>

      <Card className="integration-control-card integration-wide-card endpoint-redesign-card">
        <PanelHeader
          eyebrow="Endpoint coverage"
          title="Callable surfaces"
          caption="Backend surfaces are grouped by the operator action available in this console."
        />
        <div className="endpoint-redesign-grid">
          <EndpointGroup
            title="Operate"
            items={[
              ['Workflows', 'Create, read, update, publish, validate'],
              ['Executions', 'List, inspect, refresh, retry'],
              ['Automation bridge', 'Load contract, execute workflow'],
            ]}
          />
          <EndpointGroup
            title="Secure"
            items={[
              ['API keys', 'List, create, revoke'],
              ['Secrets', 'List, save, delete masked values'],
              ['Credentials', 'List, save, delete connector credentials'],
            ]}
          />
          <EndpointGroup
            title="Observe"
            items={[
              ['Usage', 'Plan meters and remaining capacity'],
              ['Audit', 'Paged workspace activity'],
              ['Health', 'API, readiness, queue status'],
            ]}
          />
          <EndpointGroup
            title="Billing"
            items={[
              ['Checkout', 'Create plan checkout session'],
              ['Portal', 'Open billing portal'],
              ['Provider webhook', 'Backend-managed provider callback'],
            ]}
          />
        </div>
      </Card>
    </div>
  );
}

function BridgeStat({ label, value }: { readonly label: string; readonly value: string }): ReactElement {
  return (
    <div className="bridge-stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function EndpointGroup({
  title,
  items,
}: {
  readonly title: string;
  readonly items: readonly (readonly [string, string])[];
}): ReactElement {
  return (
    <div className="endpoint-group-card">
      <strong>{title}</strong>
      {items.map(([name, value]) => (
        <div key={name}>
          <span>{name}</span>
          <p>{value}</p>
        </div>
      ))}
    </div>
  );
}
