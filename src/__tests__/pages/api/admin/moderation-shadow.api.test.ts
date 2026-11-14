import { beforeEach, describe, expect, it, mock, vi } from 'bun:test';
import { installMockPrisma, mockPrisma } from 'test/utils/mockPrisma';

installMockPrisma(vi);

const guards: Array<{ options: any }> = [];
mock.module('@/middleware/apiGuard', () => ({
  withApiGuard: (options: any) => (handler: any) => {
    guards.push({ options });
    return async (req: any, res: any) =>
      handler(req, res, { body: req.body, query: req.query });
  },
}));
const logActionStrict = vi.fn(async () => undefined);
mock.module('@/utils/auditLogger', () => ({
  logAction: vi.fn(),
  logActionStrict,
  getRequestIp: () => '192.0.2.1',
}));
const list = vi.fn(async () => ({
  total: 0,
  limit: 25,
  offset: 0,
  verdicts: [{ id: 1 }],
}));
const summary = vi.fn(async () => ({ counts: {} }));
const review = vi.fn();
class ShadowReviewError extends Error {}
mock.module('@/services/ChatModerationShadow.service', () => ({
  ChatModerationShadowService: { list, summary, review },
  ShadowReviewError,
  SHADOW_LIST_MAX_LIMIT: 100,
  SHADOW_LIST_MAX_OFFSET: 10000,
  SHADOW_VERDICT_ACTIONS: ['allow', 'flag', 'would_block', 'error'],
  SHADOW_REVIEW_OUTCOMES: ['correct', 'false_positive', 'false_negative'],
}));

const listHandler =
  require('../../../../pages/api/admin/moderation/shadow').default;

const listGuard = guards[guards.length - 1].options;
const reviewHandler =
  require('../../../../pages/api/admin/moderation/shadow/review').default;

const reviewGuard = guards[guards.length - 1].options;

const makeRes = () => {
  const res: any = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
};
const req = (over: Record<string, unknown> = {}) => ({
  method: 'GET',
  query: {},
  session: { user: { id: '3' } },
  ...over,
});

beforeEach(() => {
  logActionStrict.mockClear();
  list.mockClear();
  review.mockReset();
  mockPrisma.$transaction = vi.fn(async (fn: any) => fn({ tx: true }));
});

describe('shadow moderation admin routes are staff-only', () => {
  it('requires chat-log permission to read and chat moderation to review', () => {
    expect(listGuard.authMode).toBe('permission');
    expect(listGuard.requiredAnyPermissions).toEqual(['VIEW_CHAT_LOGS']);
    expect(listGuard.methods).toEqual(['GET']);
    expect(reviewGuard.authMode).toBe('permission');
    expect(reviewGuard.requiredAnyPermissions).toEqual(['MODERATE_CHAT']);
    expect(reviewGuard.methods).toEqual(['POST']);
  });

  it('caps pagination in the query schema', () => {
    const schema = listGuard.querySchema;
    expect(schema.safeParse({ limit: '100' }).success).toBe(true);
    expect(schema.safeParse({ limit: '101' }).success).toBe(false);
    expect(schema.safeParse({ offset: '10001' }).success).toBe(false);
    expect(schema.safeParse({ policyAction: 'ban' }).success).toBe(false);
    expect(schema.parse({}).limit).toBe(25);
  });
});

describe('shadow moderation list route', () => {
  it('returns verdicts with the summary and audits the read', async () => {
    const res = makeRes();
    await listHandler(
      req({ query: { policyAction: 'flag', limit: 10, offset: 5 } }),
      res,
    );
    expect(list).toHaveBeenCalledWith({
      policyAction: 'flag',
      limit: 10,
      offset: 5,
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].summary).toEqual({ counts: {} });
    expect(logActionStrict).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ADMIN_CHAT_MODERATION_SHADOW_READ' }),
    );
  });
});

describe('shadow moderation review route', () => {
  it('records the review and writes an audit entry in the same transaction', async () => {
    review.mockResolvedValue({ id: 5, policyAction: 'flag' });
    const res = makeRes();
    await reviewHandler(
      req({
        method: 'POST',
        body: { verdictId: 5, outcome: 'false_positive' },
      }),
      res,
    );
    expect(review).toHaveBeenCalledWith(5, 'false_positive', 3, { tx: true });
    expect(logActionStrict).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 3,
        action: 'ADMIN_CHAT_MODERATION_SHADOW_REVIEW',
        entityType: 'ChatModerationVerdict',
        entityId: 5,
      }),
      { tx: true },
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 404 for an unknown verdict and 400 for a misfit outcome', async () => {
    review.mockResolvedValueOnce(null);
    const missing = makeRes();
    await reviewHandler(
      req({ method: 'POST', body: { verdictId: 9, outcome: 'correct' } }),
      missing,
    );
    expect(missing.status).toHaveBeenCalledWith(404);
    expect(logActionStrict).not.toHaveBeenCalled();

    review.mockRejectedValueOnce(new ShadowReviewError('nope'));
    const misfit = makeRes();
    await reviewHandler(
      req({
        method: 'POST',
        body: { verdictId: 5, outcome: 'false_positive' },
      }),
      misfit,
    );
    expect(misfit.status).toHaveBeenCalledWith(400);
  });

  it('validates the review body', () => {
    const schema = reviewGuard.bodySchema;
    expect(schema.safeParse({ verdictId: 1, outcome: 'correct' }).success).toBe(
      true,
    );
    expect(schema.safeParse({ verdictId: 1, outcome: 'ban' }).success).toBe(
      false,
    );
    expect(
      schema.safeParse({ verdictId: -1, outcome: 'correct' }).success,
    ).toBe(false);
  });
});
