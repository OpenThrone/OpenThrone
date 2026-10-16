import { PrismaPg } from '@prisma/adapter-pg';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { lockEraLifecycle } from '@/utils/eraLifecycleLock';

import { PrismaClient } from '../../prisma/generated/prisma/client';

// Opt-in disposable PostgreSQL only; never uses the application's database URL.
const databaseUrl = process.env.ERA_LIFECYCLE_TEST_DATABASE_URL;

describe.skipIf(!databaseUrl)('Era lifecycle lock on PostgreSQL', () => {
  let client: PrismaClient;

  beforeEach(() => {
    const url = new URL(databaseUrl!);
    if (
      !['127.0.0.1', 'localhost'].includes(url.hostname) ||
      !url.pathname.endsWith('_test')
    ) {
      throw new Error(
        'Era lock integration tests require a local disposable test database.',
      );
    }
    client = new PrismaClient({
      adapter: new PrismaPg({ connectionString: databaseUrl }),
    });
  });
  afterEach(async () => {
    await client?.$disconnect();
  });

  it('decodes the lock result and excludes concurrent lifecycle changes until commit', async () => {
    await client.$transaction(async (tx) => {
      await lockEraLifecycle(tx);
      const competing = await client.$transaction(
        (other) =>
          other.$queryRaw<
            { acquired: boolean }[]
          >`SELECT pg_try_advisory_xact_lock(684731920) AS acquired`,
      );
      expect(competing[0]?.acquired).toBe(false);
    });
    const released = await client.$queryRaw<
      { acquired: boolean }[]
    >`SELECT pg_try_advisory_xact_lock(684731920) AS acquired`;
    expect(released[0]?.acquired).toBe(true);
  });

  it('releases the lifecycle lock when the transaction rolls back', async () => {
    await expect(
      client.$transaction(async (tx) => {
        await lockEraLifecycle(tx);
        throw new Error('Synthetic reset failure');
      }),
    ).rejects.toThrow('Synthetic reset failure');
    const released = await client.$queryRaw<
      { acquired: boolean }[]
    >`SELECT pg_try_advisory_xact_lock(684731920) AS acquired`;
    expect(released[0]?.acquired).toBe(true);
  });
});
