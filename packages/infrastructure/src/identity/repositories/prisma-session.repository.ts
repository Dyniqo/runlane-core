import { Inject, Injectable } from '@nestjs/common';
import type {
  CreateSessionInput,
  RevokeSessionInput,
  RotateSessionRefreshTokenInput,
  SessionRepositoryPort,
  StoredSessionRecord,
} from '@runlane/application';
import { PrismaPersistenceContext } from '../../prisma';

@Injectable()
export class PrismaSessionRepository implements SessionRepositoryPort {
  constructor(
    @Inject(PrismaPersistenceContext) private readonly persistence: PrismaPersistenceContext,
  ) {}

  async create(input: CreateSessionInput): Promise<StoredSessionRecord> {
    return this.persistence.client.session.create({
      data: {
        id: input.id,
        userId: input.userId,
        refreshTokenHash: input.refreshTokenHash,
        userAgent: input.userAgent,
        ip: input.ip,
        expiresAt: input.expiresAt,
      },
      select: sessionSelect,
    });
  }

  async findById(sessionId: string): Promise<StoredSessionRecord | null> {
    return this.persistence.client.session.findUnique({
      where: { id: sessionId },
      select: sessionSelect,
    });
  }

  async rotateRefreshToken(
    input: RotateSessionRefreshTokenInput,
  ): Promise<StoredSessionRecord | null> {
    const updated = await this.persistence.client.session.updateMany({
      where: {
        id: input.id,
        userId: input.userId,
        refreshTokenHash: input.currentRefreshTokenHash,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: {
        refreshTokenHash: input.nextRefreshTokenHash,
        expiresAt: input.expiresAt,
      },
    });

    if (updated.count !== 1) {
      return null;
    }

    return this.findById(input.id);
  }

  async revoke(input: RevokeSessionInput): Promise<boolean> {
    const updated = await this.persistence.client.session.updateMany({
      where: {
        id: input.id,
        refreshTokenHash: input.refreshTokenHash,
        revokedAt: null,
      },
      data: {
        revokedAt: input.revokedAt,
      },
    });

    return updated.count === 1;
  }
}

const sessionSelect = {
  id: true,
  userId: true,
  refreshTokenHash: true,
  userAgent: true,
  ip: true,
  revokedAt: true,
  expiresAt: true,
  createdAt: true,
} as const;
