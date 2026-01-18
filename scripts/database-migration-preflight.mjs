import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const legacyTable = '_runlane_bootstrap_migrations';
const migrationTable = '_prisma_migrations';

const readTables = async () => {
  const rows = await prisma.$queryRawUnsafe(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = current_schema()
      AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);

  return rows.map(({ table_name: tableName }) => tableName);
};

const main = async () => {
  const tables = await readTables();
  const hasLegacyTable = tables.includes(legacyTable);
  const hasMigrationHistory = tables.includes(migrationTable);
  const unmanagedTables = tables.filter(
    (tableName) => tableName !== legacyTable && tableName !== migrationTable,
  );

  if (hasLegacyTable && (hasMigrationHistory || unmanagedTables.length === 0)) {
    await prisma.$executeRawUnsafe(`DROP TABLE "${legacyTable}"`);
  }

  if (!hasMigrationHistory && unmanagedTables.length > 0) {
    throw new Error(
      `Database migration cannot continue because unmanaged tables exist: ${unmanagedTables.join(', ')}`,
    );
  }
};

try {
  await main();
} finally {
  await prisma.$disconnect();
}
