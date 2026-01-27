import { Inject, Injectable } from '@nestjs/common';
import type {
  AuthenticatedWorkspaceRecord,
  CreateWorkspaceWithOwnerInput,
  UpdateWorkspaceNameInput,
  WorkspaceMembershipRecord,
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
      role: mapOwnerWorkspaceRole(ownerMembership.role),
    };
  }

  async findPrimaryWorkspaceForUser(userId: string): Promise<AuthenticatedWorkspaceRecord | null> {
    const membership = await this.persistence.client.workspaceMember.findFirst({
      where: { userId },
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
      select: workspaceMembershipSelect,
    });

    return membership ? mapWorkspaceMembership(membership) : null;
  }

  async findWorkspaceForUser(input: {
    readonly userId: string;
    readonly workspaceId: string;
  }): Promise<WorkspaceMembershipRecord | null> {
    const membership = await this.persistence.client.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: input.workspaceId,
          userId: input.userId,
        },
      },
      select: workspaceMembershipSelect,
    });

    return membership ? mapWorkspaceMembership(membership) : null;
  }

  async listWorkspacesForUser(userId: string): Promise<readonly AuthenticatedWorkspaceRecord[]> {
    const memberships = await this.persistence.client.workspaceMember.findMany({
      where: { userId },
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
      select: workspaceMembershipSelect,
    });

    return memberships.map((membership) => mapWorkspaceMembership(membership));
  }

  async updateWorkspaceName(
    input: UpdateWorkspaceNameInput,
  ): Promise<AuthenticatedWorkspaceRecord | null> {
    const membership = await this.findWorkspaceForUser({
      userId: input.actorUserId,
      workspaceId: input.workspaceId,
    });

    if (!membership || membership.role !== 'owner') {
      return null;
    }

    const workspace = await this.persistence.client.workspace.update({
      where: { id: input.workspaceId },
      data: { name: input.name },
      select: {
        id: true,
        name: true,
      },
    });

    return {
      id: workspace.id,
      name: workspace.name,
      role: membership.role,
    };
  }
}

const workspaceMembershipSelect = {
  userId: true,
  role: true,
  workspace: {
    select: {
      id: true,
      name: true,
    },
  },
} as const;

interface PrismaWorkspaceMembershipRecord {
  readonly userId: string;
  readonly role: string;
  readonly workspace: {
    readonly id: string;
    readonly name: string;
  };
}

function mapWorkspaceMembership(
  membership: PrismaWorkspaceMembershipRecord,
): WorkspaceMembershipRecord {
  return {
    id: membership.workspace.id,
    name: membership.workspace.name,
    role: mapAuthenticatedWorkspaceRole(membership.role),
    userId: membership.userId,
  };
}

function mapOwnerWorkspaceRole(role: string): 'owner' {
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

function mapAuthenticatedWorkspaceRole(role: string): 'owner' | 'member' {
  if (role === 'OWNER') {
    return 'owner';
  }

  if (role === 'MEMBER') {
    return 'member';
  }

  throw new DomainError({
    code: 'WORKSPACE_MEMBER_ROLE_INVALID',
    category: 'business_rule',
    message: 'Workspace membership has an invalid role',
    details: { role },
  });
}
