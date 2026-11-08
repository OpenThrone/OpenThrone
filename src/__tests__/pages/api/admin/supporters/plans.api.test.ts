import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import {
  installMockPrisma,
  mockPrisma,
  resetMockPrisma,
} from 'test/utils/mockPrisma';
import { installRateLimitStore } from 'test/utils/rateLimitStore';
import {
  installSessionSpy,
  sessionRequestFields,
} from 'test/utils/sessionCookie';

installMockPrisma(vi);
installSessionSpy(vi);
const { authOptions } = await import('@/pages/api/auth/[...nextauth]');
const { default: handler } = await import('@/pages/api/admin/supporters/plans');
const savedUrl = process.env.NEXTAUTH_URL;
const savedSecret = process.env.NEXTAUTH_SECRET;
afterEach(() => {
  if (savedUrl === undefined) delete process.env.NEXTAUTH_URL;
  else process.env.NEXTAUTH_URL = savedUrl;
  if (savedSecret === undefined) delete process.env.NEXTAUTH_SECRET;
  else process.env.NEXTAUTH_SECRET = savedSecret;
});
beforeEach(() => {
  resetMockPrisma();
  installRateLimitStore(mockPrisma, vi);
  process.env.NEXTAUTH_URL = 'http://localhost:3000';
  mockPrisma.users.findUnique = vi.fn(async () => ({
    email: 'prices@example.test',
  }));
  mockPrisma.users.findMany = vi.fn(async () => []);
  mockPrisma.staffRoleAssignment.findMany = vi.fn(async () => []);
  mockPrisma.permissionGrant.findMany = vi.fn(async () => []);
  mockPrisma.accountStatusHistory.findFirst = vi.fn(async () => null);
  mockPrisma.supporterPlanPrice.upsert = vi.fn();
});
async function call(method: string, body?: unknown, userId: number | null = 7) {
  const res: any = {
    status: vi.fn(() => res),
    json: vi.fn(() => res),
    setHeader: vi.fn(),
    getHeader: vi.fn(),
  };
  await handler(
    {
      method,
      body,
      query: {},
      headers: { host: 'localhost:3000' },
      url: '/api/admin/supporters/plans',
      ...(await sessionRequestFields(
        authOptions,
        userId ? { id: userId, email: 'prices@example.test' } : null,
      )),
    } as any,
    res,
  );
  return res;
}
describe('supporter plan price API permission', () => {
  it('rejects anonymous writes', async () => {
    const res = await call(
      'POST',
      { planId: 'gift_1m', priceCents: 699, currency: 'usd' },
      null,
    );
    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockPrisma.supporterPlanPrice.upsert).not.toHaveBeenCalled();
  });
  it('rejects a logged-in player and unrelated staff permissions', async () => {
    for (const grants of [[], [{ type: 'MANAGE_USERS' }]]) {
      mockPrisma.permissionGrant.findMany.mockResolvedValue(grants);
      const res = await call('POST', {
        planId: 'gift_1m',
        priceCents: 699,
        currency: 'usd',
      });
      expect(res.status).toHaveBeenCalledWith(403);
    }
    expect(mockPrisma.supporterPlanPrice.upsert).not.toHaveBeenCalled();
  });
  it('permits MANAGE_SUPPORTERS to read the catalog and rejects malformed writes', async () => {
    mockPrisma.permissionGrant.findMany.mockResolvedValue([
      { type: 'MANAGE_SUPPORTERS' },
    ]);
    const res = await call('GET');
    expect(res.json.mock.calls[0][0].rows).toHaveLength(5);
    const invalid = await call('POST', {
      planId: 'gift_1m',
      priceCents: 1.5,
      currency: 'usd',
    });
    expect(invalid.status).toHaveBeenCalledWith(400);
    expect(invalid.json).toHaveBeenCalledWith({ error: 'invalid_price' });
    expect(mockPrisma.supporterPlanPrice.upsert).not.toHaveBeenCalled();
  });
  it('refuses a stale edit with 409 and the current prices', async () => {
    mockPrisma.permissionGrant.findMany.mockResolvedValue([
      { type: 'MANAGE_SUPPORTERS' },
    ]);
    // The stored gift_1m price is the code default (499), not the 550 the admin saw.
    mockPrisma.supporterPlanPrice.findMany = vi.fn(async () => []);
    // Keep the rate limiter's store; answer only the per-plan advisory lock.
    const limiter = mockPrisma.$queryRaw;
    mockPrisma.$queryRaw = vi.fn(
      async (strings: TemplateStringsArray, ...values: unknown[]) =>
        strings.join('?').includes('pg_advisory_xact_lock')
          ? []
          : limiter(strings, ...values),
    );
    mockPrisma.$transaction.mockImplementation(async (cb: any) =>
      cb(mockPrisma),
    );
    const res = await call(
      'POST',
      {
        planId: 'gift_1m',
        priceCents: 699,
        currency: 'usd',
        expectedCents: 550,
      },
      // A separate admin keeps this write clear of the earlier tests' rate limit.
      8,
    );
    expect(res.status).toHaveBeenCalledWith(409);
    const body = res.json.mock.calls[0][0];
    expect(body.error).toBe('price_conflict');
    expect(body.rows).toHaveLength(5);
    expect(mockPrisma.supporterPlanPrice.upsert).not.toHaveBeenCalled();
  });
});
