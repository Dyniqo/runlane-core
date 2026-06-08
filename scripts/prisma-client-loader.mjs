import prismaClientModule from '@prisma/client';

const { PrismaClient } = prismaClientModule;

if (typeof PrismaClient !== 'function') {
  throw new Error(
    'PrismaClient export is not available from @prisma/client. Run pnpm db:generate and retry.',
  );
}

export { PrismaClient };
