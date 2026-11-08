import { expect, test } from 'bun:test';

import prisma from '@/lib/prisma';

test('every public table has row level security after migrations', async () => {
  const rows = await prisma.$queryRaw<{ relname: string }[]>`
    SELECT c.relname FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
      AND NOT c.relrowsecurity`;
  expect(rows.map((row) => row.relname)).toEqual([]);
});

test('the app role still reads and writes with RLS on and no policies', async () => {
  const [owner] = await prisma.$queryRaw<{ owns: boolean }[]>`
    SELECT bool_and(pg_get_userbyid(c.relowner) = current_user) AS owns
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')`;
  expect(owner.owns).toBe(true);
  const setting = await prisma.serverSetting.upsert({
    where: { key: 'RLS_CHECK' },
    create: {
      key: 'RLS_CHECK',
      label: 'RLS_CHECK',
      type: 'BOOLEAN',
      value: true,
    },
    update: { value: true },
  });
  expect(setting.key).toBe('RLS_CHECK');
  await prisma.serverSetting.delete({ where: { key: 'RLS_CHECK' } });
});
