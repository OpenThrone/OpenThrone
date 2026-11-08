import { describe, expect, it } from 'bun:test';

import { fetchUserDataWithRetry } from '@/utils/userDataFetch';

const json = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), { status });
const noWait = async () => {};

const sequence = (...steps: Array<Response | Error>) => {
  let calls = 0;
  const doFetch = async () => {
    const step = steps[Math.min(calls, steps.length - 1)];
    calls += 1;
    if (step instanceof Error) throw step;
    return step;
  };
  return { doFetch, calls: () => calls };
};

describe('fetchUserDataWithRetry (#362)', () => {
  it('recovers from a dropped connection on retry', async () => {
    const { doFetch, calls } = sequence(
      new TypeError('Failed to fetch'),
      json(200, { id: 7 }),
    );
    const result = await fetchUserDataWithRetry(doFetch, { wait: noWait });
    expect(result).toEqual({ kind: 'ok', data: { id: 7 } });
    expect(calls()).toBe(2);
  });

  it('recovers from a 502 from the proxy on retry', async () => {
    const { doFetch } = sequence(json(502), json(200, { id: 7 }));
    const result = await fetchUserDataWithRetry(doFetch, { wait: noWait });
    expect(result.kind).toBe('ok');
  });

  it('reports failed, not signed out, when hiccups persist', async () => {
    const { doFetch, calls } = sequence(new TypeError('Failed to fetch'));
    const result = await fetchUserDataWithRetry(doFetch, {
      retries: 2,
      wait: noWait,
    });
    expect(result.kind).toBe('failed');
    expect(calls()).toBe(3);
  });

  it('treats only 401 as an ended session, without retrying', async () => {
    const { doFetch, calls } = sequence(json(401));
    const result = await fetchUserDataWithRetry(doFetch, { wait: noWait });
    expect(result).toEqual({ kind: 'unauthorized' });
    expect(calls()).toBe(1);
  });

  it('does not retry a non-transient client error', async () => {
    const { doFetch, calls } = sequence(json(400));
    const result = await fetchUserDataWithRetry(doFetch, { wait: noWait });
    expect(result.kind).toBe('failed');
    expect(calls()).toBe(1);
  });
});
