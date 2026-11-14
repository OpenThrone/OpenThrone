import type { PrismaPg } from '@prisma/adapter-pg';

/** The adapter PrismaPg's factory hands Prisma: one pg pool. */
export type PgDriverAdapter = Awaited<ReturnType<PrismaPg['connect']>>;

type ForwardedMethods = Pick<
  PgDriverAdapter,
  'queryRaw' | 'executeRaw' | 'executeScript' | 'startTransaction'
>;

export type RequestScopedAdapterOptions = {
  /** The current Workers request context, or undefined outside a request. */
  getRequestContext: () => object | undefined;
  /** Builds a pg adapter (and its pool) for one request context. */
  createAdapter: (context: object) => Promise<ForwardedMethods>;
  /** Called with the running count each time a request's adapter is built. */
  onAdapterCreated?: (count: number) => void;
};

/** Adapter name Prisma sees; matches `@prisma/adapter-pg`. */
export const PG_ADAPTER_NAME = '@prisma/adapter-pg';

/**
 * Driver adapter factory for one PrismaClient shared by a whole Workers
 * isolate.
 *
 * workerd binds every socket to the request that opened it, so a pg
 * connection reused by a later request either throws "Cannot perform I/O on
 * behalf of a different request" (error 1101) or never resolves (the
 * 2026-10-15 hang). Building a whole PrismaClient per request avoided that
 * but set the memory ceiling: each client compiles the full schema into its
 * own QueryCompiler (plus a plan cache) inside the isolate's shared WASM
 * memory, and ~20 concurrent DB-bound requests exceeded the 128 MiB isolate
 * limit (docs/realtime-pilot.md §8).
 *
 * This factory's adapter keeps the compiler shared and sends every call to a
 * pg adapter owned by the calling request, so sockets never cross requests.
 * The WeakMap lets a finished request's pool go with its context.
 *
 * Prisma batches same-shape findUnique calls issued in one tick into one
 * query. With a shared client a batch can hold calls from two requests: it
 * runs on the first caller's connection, and workerd delivers the result to
 * the other request's promise, which is safe while both requests are
 * awaiting it (they are, until the batch settles).
 */
export const createRequestScopedAdapterFactory = ({
  getRequestContext,
  createAdapter,
  onAdapterCreated,
}: RequestScopedAdapterOptions) => {
  const requestAdapters = new WeakMap<object, Promise<ForwardedMethods>>();
  let createdAdapters = 0;

  // Must run synchronously at the top of each forwarded method, while
  // AsyncLocalStorage still holds the caller's request context.
  const currentRequestAdapter = (): Promise<ForwardedMethods> => {
    const context = getRequestContext();
    if (!context) {
      return Promise.reject(
        new Error('[prisma] Worker database call outside a request context'),
      );
    }
    let adapter = requestAdapters.get(context);
    if (!adapter) {
      adapter = createAdapter(context);
      requestAdapters.set(context, adapter);
      createdAdapters += 1;
      onAdapterCreated?.(createdAdapters);
    }
    return adapter;
  };

  const forward: ForwardedMethods = {
    queryRaw: (query) => currentRequestAdapter().then((a) => a.queryRaw(query)),
    executeRaw: (query) =>
      currentRequestAdapter().then((a) => a.executeRaw(query)),
    executeScript: (script) =>
      currentRequestAdapter().then((a) => a.executeScript(script)),
    startTransaction: (isolationLevel) =>
      currentRequestAdapter().then((a) => a.startTransaction(isolationLevel)),
  };

  return {
    provider: 'postgres' as const,
    adapterName: PG_ADAPTER_NAME,
    connect: async () => ({
      provider: 'postgres' as const,
      adapterName: PG_ADAPTER_NAME,
      ...forward,
      // Same answer PrismaPgAdapter gives when built without options.
      getConnectionInfo: () => ({
        schemaName: undefined,
        supportsRelationJoins: true,
      }),
      // Per-request pools are released with their request context.
      dispose: async () => {},
    }),
  };
};
