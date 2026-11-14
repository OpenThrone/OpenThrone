import { beforeEach, describe, expect, it, vi } from 'bun:test';
import { installMockPrisma, mockPrisma } from 'test/utils/mockPrisma';

import * as guard from '@/middleware/apiGuard';
import { getOTDayKey } from '@/utils/timefunctions';

installMockPrisma(vi);

const guardSpy = vi
  .spyOn(guard, 'withApiGuard')
  .mockImplementation(
    (options: any) => (handler: any) => async (req: any, res: any) => {
      let { body } = req;
      if (options.bodySchema && ['POST', 'PUT'].includes(req.method)) {
        const parsed = options.bodySchema.safeParse(req.body);
        if (!parsed.success)
          return res.status(422).json({ message: 'Invalid request body' });
        body = parsed.data;
      }
      return handler(req, res, { body, query: req.query ?? {} });
    },
  );
const consentRoute = require('@/pages/api/consent/index');

const consentGuard = (guardSpy.mock.calls[0] as any[])[0] as any;
guardSpy.mockRestore();

const response = () => {
  const res: any = {
    setHeader: vi.fn(),
    status: vi.fn(),
    json: vi.fn(),
  };
  res.status.mockReturnValue(res);
  return res;
};
const request = (method: string, body?: unknown) => ({
  method,
  body,
  headers: {},
});

beforeEach(() => {
  mockPrisma.consentTally.upsert.mockReset().mockResolvedValue({});
});

describe('POST /api/consent', () => {
  it('is a public, rate-limited POST with a strict body schema', () => {
    expect(consentGuard).toEqual(
      expect.objectContaining({
        methods: ['POST'],
        authMode: 'none',
        rateLimitProfile: 'public_read',
      }),
    );
    expect(consentGuard.bodySchema).toBeDefined();
  });

  it('rejects anything but a known choice before touching the database', async () => {
    for (const bad of [
      undefined,
      {},
      { choice: 'maybe' },
      { choice: 'granted', extra: 1 },
    ]) {
      const res = response();
      await consentRoute.default(request('POST', bad), res);
      expect(res.status).toHaveBeenCalledWith(422);
    }
    expect(mockPrisma.consentTally.upsert).not.toHaveBeenCalled();
  });

  it('upserts count + 1 for today (OT day) and the given choice', async () => {
    const res = response();
    await consentRoute.default(request('POST', { choice: 'granted' }), res);
    const call = mockPrisma.consentTally.upsert.mock.calls[0][0];
    // Buckets follow the OT calendar day.
    expect(call.where).toEqual({
      day_choice: { day: expect.any(Date), choice: 'granted' },
    });
    expect(getOTDayKey(call.where.day_choice.day)).toBe(getOTDayKey());
    expect(call.update).toEqual({ count: { increment: 1 } });
    expect(call.create).toEqual({
      day: expect.any(Date),
      choice: 'granted',
      count: 1,
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });

  it('stores no IP, user id or user agent anywhere in the upsert', async () => {
    await consentRoute.default(
      {
        ...request('POST', { choice: 'denied' }),
        headers: { 'user-agent': 'ua' },
      },
      response(),
    );
    const call = JSON.stringify(
      mockPrisma.consentTally.upsert.mock.calls[0][0],
    );
    expect(call).not.toContain('ua');
    expect(call).not.toContain('ip');
    expect(call).not.toContain('userId');
  });

  it('answers softly when the tally write fails (choice is client-side)', async () => {
    mockPrisma.consentTally.upsert.mockRejectedValue(new Error('db down'));
    const res = response();
    await consentRoute.default(request('POST', { choice: 'granted' }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ ok: false });
  });
});
