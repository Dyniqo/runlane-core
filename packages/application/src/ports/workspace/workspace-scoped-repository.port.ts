export interface WorkspaceScopedQuery {
  readonly workspaceId: string;
}

export interface WorkspaceScopedEntityQuery extends WorkspaceScopedQuery {
  readonly id: string;
}

export interface WorkspaceScopedWriteInput extends WorkspaceScopedQuery {
  readonly actorUserId: string | null;
}

export interface WorkspaceScopedReadRepositoryPort<EntityRecord> {
  findByWorkspaceId(input: WorkspaceScopedEntityQuery): Promise<EntityRecord | null>;
}

export interface WorkspaceScopedWriteRepositoryPort<CreateInput, EntityRecord> {
  createForWorkspace(input: CreateInput & WorkspaceScopedWriteInput): Promise<EntityRecord>;
}

export interface WorkspaceScopedRepositoryPort<EntityRecord, CreateInput>
  extends
    WorkspaceScopedReadRepositoryPort<EntityRecord>,
    WorkspaceScopedWriteRepositoryPort<CreateInput, EntityRecord> {}
