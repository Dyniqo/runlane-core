import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

loadLocalEnvironment();

const email = process.env.RUNLANE_VALIDATE_AUTH_EMAIL;

if (!email) {
  throw new Error('RUNLANE_VALIDATE_AUTH_EMAIL is required');
}

const prisma = new PrismaClient();

try {
  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      workspaceMemberships: { select: { id: true } },
      sessions: { select: { id: true, revokedAt: true } },
    },
  });

  if (!user) {
    throw new Error(`User was not persisted for ${email}`);
  }

  if (user.workspaceMemberships.length !== 1) {
    throw new Error(`Expected one workspace membership for ${email}`);
  }

  if (user.sessions.length !== 1) {
    throw new Error(`Expected one session for ${email}`);
  }

  if (user.sessions[0].revokedAt === null) {
    throw new Error(`Expected session to be revoked for ${email}`);
  }
} finally {
  await prisma.$disconnect();
}

function loadLocalEnvironment() {
  const envPath = resolve(process.cwd(), '.env');
  const content = readFileSync(envPath, 'utf8');

  for (const line of content.split(/\r?\n/)) {
    const trimmedLine = line.trim();

    if (!trimmedLine || trimmedLine.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmedLine.indexOf('=');

    if (separatorIndex < 1) {
      continue;
    }

    const key = trimmedLine.slice(0, separatorIndex).trim();
    const value = trimmedLine.slice(separatorIndex + 1).trim();

    process.env[key] ??= value;
  }
}
