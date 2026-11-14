import { describe, expect, it } from 'bun:test';

import { processPoolConfig, workerPoolConfig } from './prismaClients';

describe('prisma pool settings per runtime', () => {
  it('keeps the Node/Bun server pool exactly as before the Workers port', () => {
    process.env.POSTGRES_PRISMA_URL = 'postgres://node-host/db';
    // pg's default size and no statement or idle-in-transaction timeouts:
    // one shared pool serves every player request on the custom server.
    expect(processPoolConfig()).toEqual({
      connectionString: 'postgres://node-host/db',
    });
  });

  it('gives each Workers request a small pool with database-side guardrails', () => {
    const config = workerPoolConfig({
      env: { HYPERDRIVE: { connectionString: 'postgres://hyperdrive/db' } },
    });
    expect(config).toMatchObject({
      connectionString: 'postgres://hyperdrive/db',
      max: 2,
      statement_timeout: 15_000,
      idle_in_transaction_session_timeout: 15_000,
    });
  });
});
