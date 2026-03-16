export function buildWorkflowSecretAssociatedData(input: {
  readonly workspaceId: string;
  readonly workflowId: string;
  readonly key: string;
}): string {
  return `workflow-secret:${input.workspaceId}:${input.workflowId}:${input.key}`;
}

export function buildConnectorCredentialAssociatedData(input: {
  readonly workspaceId: string;
  readonly workflowId: string;
  readonly name: string;
  readonly type: string;
}): string {
  return `connector-credential:${input.workspaceId}:${input.workflowId}:${input.name}:${input.type}`;
}
