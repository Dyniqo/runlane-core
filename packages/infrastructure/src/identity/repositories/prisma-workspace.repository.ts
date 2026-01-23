import { Inject, Injectable } from '@nestjs/common';
import type {
  CreateWorkspaceWithOwnerInput,
  WorkspaceRepositoryPort,
  WorkspaceWithOwnerMembershipRecord,
} from '@runlane/application';
import { DomainError } from '@runlane/domain';
import { PrismaPersistenceContext } from '../../prisma';

@Injectable()
export class PrismaWorkspaceRepository implements WorkspaceRepositoryPort {
  constructor(
    @Inject(PrismaPersistenceContext) private readonly persistence: PrismaPersistenceContext,
  ) {}

  async createDefaultWorkspaceForOwner(
    input: CreateWorkspaceWithOwnerInput,
  ): Promise<WorkspaceWithOwnerMembershipRecord> {
    const workspace = await this.persistence.client.workspace.create({
      data: {
        name: input.name,
        ownerId: input.ownerId,
        plan: 'FREE',
        members: {
          create: {
            userId: input.ownerId,
            role: 'OWNER',
          },
        },
      },
      select: {
        id: true,
        name: true,
        members: {
          where: { userId: input.ownerId },
          select: { role: true },
          take: 1,
        },
      },
    });
    const ownerMembership = workspace.members[0];

    if (!ownerMembership) {
      throw new DomainError({
        code: 'WORKSPACE_OWNER_MEMBERSHIP_MISSING',
        category: 'business_rule',
        message: 'Workspace owner membership was not created',
        details: { workspaceId: workspace.id, ownerId: input.ownerId },
      });
    }

    return {
      id: workspace.id,
      name: workspace.name,
      role: mapWorkspaceRole(ownerMembership.role),
    };
  }
}

function mapWorkspaceRole(role: string): 'owner' {
  if (role !== 'OWNER') {
    throw new DomainError({
      code: 'WORKSPACE_OWNER_ROLE_INVALID',
      category: 'business_rule',
      message: 'Workspace owner membership has an invalid role',
      details: { role },
    });
  }

  return 'owner';
}
