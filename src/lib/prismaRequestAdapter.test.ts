import { beforeEach, describe, expect, it } from 'bun:test';

import { createRequestScopedAdapterFactory } from './prismaRequestAdapter';

type FakeRequest = { name: string };
type Call = { adapter: string; method: string };

// One fake context object per simulated Workers request; undefined = no request.
let currentContext: FakeRequest | undefined;
let built: string[];

const fakeAdapterFor = (context: object) => {
  const { name } = context as FakeRequest;
  built.push(name);
  const record = (method: string) => async (): Promise<any> =>
    ({ adapter: name, method }) satisfies Call;
  return Promise.resolve({
    queryRaw: record('queryRaw'),
    executeRaw: record('executeRaw'),
    executeScript: record('executeScript'),
    startTransaction: record('startTransaction'),
  });
};

const query = { sql: 'select 1', args: [], argTypes: [] } as any;

const connectShared = () =>
  createRequestScopedAdapterFactory({
    getRequestContext: () => currentContext,
    createAdapter: fakeAdapterFor,
  }).connect();

describe('createRequestScopedAdapterFactory (one Prisma client per isolate)', () => {
  beforeEach(() => {
    currentContext = undefined;
    built = [];
  });

  it('gives each request its own pg adapter and reuses it within the request', async () => {
    const shared = await connectShared();
    const requestA = { name: 'a' };
    const requestB = { name: 'b' };

    currentContext = requestA;
    const first = await shared.queryRaw(query);
    const second = await shared.executeRaw(query);
    currentContext = requestB;
    const third = await shared.queryRaw(query);

    expect(first).toEqual({ adapter: 'a', method: 'queryRaw' } as any);
    expect(second).toEqual({ adapter: 'a', method: 'executeRaw' } as any);
    expect(third).toEqual({ adapter: 'b', method: 'queryRaw' } as any);
    expect(built).toEqual(['a', 'b']);
  });

  it('binds a call to the request that made it, even when another request calls before it resolves', async () => {
    const shared = await connectShared();

    currentContext = { name: 'a' };
    const pendingA = shared.startTransaction();
    currentContext = { name: 'b' };
    const pendingB = shared.startTransaction();

    expect(await pendingA).toEqual({
      adapter: 'a',
      method: 'startTransaction',
    } as any);
    expect(await pendingB).toEqual({
      adapter: 'b',
      method: 'startTransaction',
    } as any);
  });

  it('refuses a Worker database call made outside any request', async () => {
    const shared = await connectShared();
    await expect(shared.executeScript('select 1')).rejects.toThrow(
      'outside a request context',
    );
    expect(built).toEqual([]);
  });

  it('reports the same provider, name and connection info as PrismaPg', async () => {
    const shared = await connectShared();
    expect(shared.provider).toBe('postgres');
    expect(shared.adapterName).toBe('@prisma/adapter-pg');
    expect(shared.getConnectionInfo()).toEqual({
      schemaName: undefined,
      supportsRelationJoins: true,
    });
  });

  it('matches the adapter name the installed @prisma/adapter-pg reports', async () => {
    const { PrismaPg } = await import('@prisma/adapter-pg');
    expect(new PrismaPg({}).adapterName).toBe('@prisma/adapter-pg');
  });
});
