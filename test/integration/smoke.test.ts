import { expect, test } from 'bun:test';

import prisma from '@/lib/prisma';

test('integration database is migrated and reachable', async () => {
  const [row] = await prisma.$queryRaw<
    { n: number }[]
  >`SELECT count(*)::int AS n FROM _prisma_migrations`;
  expect(row.n).toBeGreaterThan(0);
});
