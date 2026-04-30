import { Inject, Injectable } from '@nestjs/common';
import type {
  AuthenticatedWorkspaceRecord,
  CreateWorkspaceWithOwnerInput,
  ListWorkspacesForUserInput,
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
        isDemo: false,
        demoSessionId: null,
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
        isDemo: true,
        demoSessionId: true,
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
      isDemo: workspace.isDemo,
      demoSessionId: workspace.demoSessionId,
    };
  }

  async findPrimaryWorkspaceForUser(userId: string): Promise<AuthenticatedWorkspaceRecord | null> {
    const membership = await this.persistence.client.workspaceMember.findFirst({
      where: {
        userId,
        workspace: {
          demoSessionId: null,
        },
      },
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

  async listWorkspacesForUser(
    input: ListWorkspacesForUserInput,
  ): Promise<readonly AuthenticatedWorkspaceRecord[]> {
    const current = await this.findWorkspaceForUser({
      userId: input.userId,
      workspaceId: input.currentWorkspaceId,
    });

    if (!current) {
      return [];
    }

    if (current.isDemo || current.demoSessionId !== null) {
      return [current];
    }

    const memberships = await this.persistence.client.workspaceMember.findMany({
      where: {
        userId: input.userId,
        workspace: {
          isDemo: false,
          demoSessionId: null,
        },
      },
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
        isDemo: true,
        demoSessionId: true,
      },
    });

    return {
      id: workspace.id,
      name: workspace.name,
      role: membership.role,
      isDemo: workspace.isDemo,
      demoSessionId: workspace.demoSessionId,
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
      isDemo: true,
      demoSessionId: true,
    },
  },
} as const;

interface PrismaWorkspaceMembershipRecord {
  readonly userId: string;
  readonly role: string;
  readonly workspace: {
    readonly id: string;
    readonly name: string;
    readonly isDemo: boolean;
    readonly demoSessionId: string | null;
  };
}

function mapWorkspaceMembership(
  membership: PrismaWorkspaceMembershipRecord,
): WorkspaceMembershipRecord {
  return {
    userId: membership.userId,
    id: membership.workspace.id,
    name: membership.workspace.name,
    role: mapWorkspaceRole(membership.role),
    isDemo: membership.workspace.isDemo,
    demoSessionId: membership.workspace.demoSessionId,
  };
}

function mapWorkspaceRole(role: string): 'owner' | 'member' {
  if (role === 'OWNER') {
    return 'owner';
  }

  return 'member';
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
