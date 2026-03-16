import type { WorkflowSecretRepositoryPort, SecretCipherPort } from '../../ports';
import { connectorCredentialSecretMissing, normalizeWorkflowSecretKey } from '@runlane/domain';
import type { SafeTemplateSecretReference } from '../execution/safe-template-resolver';
import { buildWorkflowSecretAssociatedData } from './secret-aad';

export async function resolveWorkflowSecretReferences(input: {
  readonly workspaceId: string;
  readonly workflowId: string;
  readonly references: readonly SafeTemplateSecretReference[];
  readonly secrets: WorkflowSecretRepositoryPort;
  readonly cipher: SecretCipherPort;
}): Promise<ReadonlyMap<string, string>> {
  const keys = Array.from(
    new Set(input.references.map((reference) => normalizeWorkflowSecretKey(reference.key))),
  );

  if (keys.length === 0) {
    return new Map();
  }

  const records = await input.secrets.findManyByKeys({
    workspaceId: input.workspaceId,
    workflowId: input.workflowId,
    keys,
  });
  const byKey = new Map(records.map((record) => [record.key, record]));
  const resolved = new Map<string, string>();

  for (const key of keys) {
    const record = byKey.get(key);

    if (!record) {
      throw connectorCredentialSecretMissing(key);
    }

    resolved.set(
      key,
      input.cipher.decrypt({
        ciphertext: record.encryptedValue,
        associatedData: buildWorkflowSecretAssociatedData({
          workspaceId: input.workspaceId,
          workflowId: input.workflowId,
          key,
        }),
      }),
    );
  }

  return resolved;
}
