import { getCloudflareContext } from '@opennextjs/cloudflare';
import { PrismaPg } from '@prisma/adapter-pg';

import type { PrismaClient } from '../../prisma/generated/prisma/client';
import { getPrismaClientClass } from '../../prisma/generated/prisma/internal/class';
import { createRequestScopedAdapterFactory } from './prismaRequestAdapter';

// The generated client.ts sets globalThis.__dirname from import.meta.url at
// import time, which is undefined in wrangler's worker.ts bundle and crashes
// startup there. The class itself has no such side effect.
const PrismaClientClass = getPrismaClientClass();

// Relative imports only: worker.ts imports this module, and wrangler's
// esbuild bundle has no @/ path aliases.

/**
 * OpenNext stores a fresh `{ env, ctx, cf }` object per request in
 * AsyncLocalStorage; outside a Workers request (Node/Bun, tests, build) this
 * returns undefined.
 */
const getWorkerRequestContext = (): object | undefined => {
  try {
    return getCloudflareContext({ async: false }) ?? undefined;
  } catch {
    return undefined;
  }
};

/**
 * On Cloudflare Workers the database is reached through the Hyperdrive
 * binding (pooled), whose connection string supersedes the raw env var.
 * node-postgres speaks workerd's TCP sockets under nodejs_compat, so the same
 * PrismaPg adapter serves both runtimes — only the connection source differs.
 */
const resolveHyperdriveConnectionString = (
  context: object | undefined,
): string | undefined =>
  (context as { env?: { HYPERDRIVE?: { connectionString?: string } } })?.env
    ?.HYPERDRIVE?.connectionString;

/** node-postgres settings shared by every pool this module creates. */
/** node-postgres settings for one Workers request's pool. */
export const workerPoolConfig = (context: object) => ({
  connectionString:
    resolveHyperdriveConnectionString(context) ??
    process.env.POSTGRES_PRISMA_URL,
  // Server-side guardrails: a canceled Worker request cannot abort its
  // in-flight query, so a request killed mid-transaction leaks a session
  // holding row locks — and every later request touching those rows piles
  // up behind it ("hung" 1101s, whole-app stall). These timeouts make the
  // database itself reap leaked work in seconds.
  statement_timeout: 15_000,
  idle_in_transaction_session_timeout: 15_000,
  connectionTimeoutMillis: 10_000,
  // On Workers each request gets its own pool (see the socket-binding note
  // below) and Hyperdrive performs the origin pooling; a request rarely
  // needs more than one connection at a time (Promise.all pages get the
  // second), so the pool stays small.
  max: 2,
});

/**
 * node-postgres settings for the Node/Bun server: one long-lived pool shared
 * by every request, exactly as before the Workers port (pg's default size
 * and no statement timeouts). The Workers guardrails above would choke it:
 * a 2-connection pool for all players, and 15 s caps on long admin queries.
 */
export const processPoolConfig = () => ({
  connectionString: process.env.POSTGRES_PRISMA_URL,
});

const LOG_LEVELS: Array<'info' | 'warn' | 'error'> = ['info', 'warn', 'error'];

type PrismaAdapterFactory = NonNullable<
  ConstructorParameters<typeof PrismaClientClass>[0]
>['adapter'];

// Per-isolate creation counter for memory forensics: with PRISMA_MEM_DEBUG=1
// (preview env only) each per-request adapter and each client logs its
// creation, so wrangler tail shows how per-request cost scales.
const logCreation = (kind: 'client' | 'adapter', count: number): void => {
  if (process.env.PRISMA_MEM_DEBUG !== '1') return;
  console.log(`[prisma-mem] ${kind} #${count}`);
};

// Workers: one PrismaClient per isolate, with each query routed to the
// calling request's own pg pool (see prismaRequestAdapter.ts for why).
const requestScopedAdapterFactory = createRequestScopedAdapterFactory({
  getRequestContext: getWorkerRequestContext,
  createAdapter: (context) => new PrismaPg(workerPoolConfig(context)).connect(),
  onAdapterCreated: (count) => logCreation('adapter', count),
});

let createdClients = 0;
const createPrismaClient = (adapter: PrismaAdapterFactory): PrismaClient => {
  createdClients += 1;
  logCreation('client', createdClients);
  return new PrismaClientClass({ adapter, log: LOG_LEVELS }) as PrismaClient;
};

// The Workers client lives on a global symbol, not module state: worker.ts
// and the OpenNext bundle each carry their own copy of this module, and
// worker.ts builds the client at isolate startup (warmWorkerPrismaClient) so
// the first request does not pay for it.
const WORKER_CLIENT_KEY = Symbol.for('openthrone.workerPrismaClient');
type WorkerClientSlot = { [WORKER_CLIENT_KEY]?: PrismaClient };
const workerSlot = globalThis as unknown as WorkerClientSlot;

const getWorkerClient = (): PrismaClient => {
  workerSlot[WORKER_CLIENT_KEY] ??= createPrismaClient(
    requestScopedAdapterFactory,
  );
  return workerSlot[WORKER_CLIENT_KEY];
};

let processClient: PrismaClient | undefined = (globalThis as any).prisma;

export const getPrismaClient = (): PrismaClient => {
  if (getWorkerRequestContext()) return getWorkerClient();

  if (!processClient) {
    processClient = createPrismaClient(new PrismaPg(processPoolConfig()));
    if (process.env.NODE_ENV === 'development')
      (globalThis as any).prisma = processClient;
  }
  return processClient;
};

/**
 * Builds the Workers client and its query compiler during isolate startup.
 *
 * A new PrismaClient deserializes the schema's parameterization graph and
 * compiles the datamodel into a QueryCompiler: CPU work with no I/O, which
 * dominated the first request on every new isolate. Called from worker.ts's
 * global scope, so it runs before (and often during the TLS handshake of)
 * the first request. Errors are swallowed: the first request retries the same
 * work through getPrismaClient().
 */
export const warmWorkerPrismaClient = (): Promise<void> => {
  try {
    return getWorkerClient()
      .$connect()
      .catch(() => {});
  } catch {
    return Promise.resolve();
  }
};
