import { beforeEach, describe, expect, it, vi } from 'bun:test';
import { installMockPrisma, mockPrisma } from 'test/utils/mockPrisma';

import * as guard from '@/middleware/apiGuard';

installMockPrisma(vi);

const guardSpy = vi
  .spyOn(guard, 'withApiGuard')
  .mockImplementation(
    (options: any) => (handler: any) => async (req: any, res: any) => {
      if (req.method === 'PUT') {
        const parsed = options.bodySchema.safeParse(req.body);
        if (!parsed.success)
          return res.status(422).json({ error: 'Invalid body' });
        return handler(req, res, { body: parsed.data });
      }
      return handler(req, res, {});
    },
  );
const preferencesHandler =
  require('@/pages/api/account/email-preferences').default;

const options = guardSpy.mock.calls.map((call) => call[0]);
guardSpy.mockRestore();
const response = () => {
  const res: any = {
    setHeader: vi.fn(),
    status: vi.fn(),
    json: vi.fn(),
    send: vi.fn(),
  };
  res.status.mockReturnValue(res);
  return res;
};
const request = (method: string, body?: unknown) => ({
  method,
  body,
  session: { user: { id: '9' } },
  query: { userId: 123 },
});
beforeEach(() => {
  mockPrisma.users.findUnique = vi
    .fn()
    .mockResolvedValue({ id: 9, email: 'own@example.test' });
  mockPrisma.emailPreference = {
    findUnique: vi.fn().mockResolvedValue(null),
    upsert: vi.fn(async ({ create, update }) => ({
      attackNotificationEmails: false,
      ...create,
      ...update,
    })),
  };
});
describe('self-service email preferences', () => {
  it('requires authentication and limits requests', () => {
    expect(options).toEqual([
      expect.objectContaining({
        authMode: 'required',
        rateLimitProfile: 'public_read',
        methods: ['GET', 'PUT'],
      }),
    ]);
  });
  it('defaults missing preference records to opted in', async () => {
    const res = response();
    await preferencesHandler(request('GET'), res);
    expect(res.json).toHaveBeenCalledWith({
      newsEmails: true,
      announcementEmails: true,
      attackNotificationEmails: false,
      unsubscribedAll: false,
    });
    expect(mockPrisma.emailPreference.findUnique).toHaveBeenCalledWith({
      where: { userId: 9 },
    });
  });
  it('updates only the session user and validates every boolean', async () => {
    const res = response();
    await preferencesHandler(
      request('PUT', {
        newsEmails: false,
        announcementEmails: true,
        attackNotificationEmails: true,
        unsubscribedAll: true,
      }),
      res,
    );
    expect(mockPrisma.emailPreference.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 9 },
        update: {
          newsEmails: false,
          announcementEmails: true,
          attackNotificationEmails: true,
          unsubscribedAllAt: expect.any(Date),
        },
      }),
    );
    for (const body of [
      { newsEmails: 'false', announcementEmails: true, unsubscribedAll: false },
      {
        newsEmails: true,
        announcementEmails: true,
        unsubscribedAll: false,
        userId: 123,
      },
    ]) {
      const failed = response();
      await preferencesHandler(request('PUT', body), failed);
      expect(failed.status).toHaveBeenCalledWith(422);
    }
    expect(mockPrisma.emailPreference.upsert).toHaveBeenCalledTimes(1);
  });
});

it('preserves battle opt-in when an older client omits the new preference', async () => {
  mockPrisma.emailPreference.upsert.mockResolvedValue({
    attackNotificationEmails: true,
  });
  const res = response();
  await preferencesHandler(
    request('PUT', {
      newsEmails: true,
      announcementEmails: true,
      unsubscribedAll: false,
    }),
    res,
  );
  expect(
    mockPrisma.emailPreference.upsert.mock.calls[0][0].update,
  ).not.toHaveProperty('attackNotificationEmails');
  expect(res.json).toHaveBeenCalledWith(
    expect.objectContaining({ attackNotificationEmails: true }),
  );
});
