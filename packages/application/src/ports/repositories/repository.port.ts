export interface ReadRepositoryPort<Aggregate, Identifier> {
  findById(identifier: Identifier): Promise<Aggregate | null>;
  existsById(identifier: Identifier): Promise<boolean>;
}

export interface WriteRepositoryPort<Aggregate, Identifier> {
  add(aggregate: Aggregate): Promise<void>;
  update(aggregate: Aggregate): Promise<void>;
  removeById(identifier: Identifier): Promise<void>;
}

export interface RepositoryPort<Aggregate, Identifier>
  extends ReadRepositoryPort<Aggregate, Identifier>, WriteRepositoryPort<Aggregate, Identifier> {}
