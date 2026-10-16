import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import { installMockPrisma, mockPrisma } from 'test/utils/mockPrisma';

installMockPrisma(vi);
const {
  handleMassMessages,
} = require('@/pages/api/admin/content/mass-messages');
const { BroadcastSchema } = require('@/utils/broadcastPolicy');
const posts = require('@/pages/api/admin/content/posts');
const postById = require('@/pages/api/admin/content/posts/[id]');
const authorization = require('@/utils/authorization');
const email = require('@/services/Email.service');
const adminEmail = require('@/services/AdminEmail.service');
const runtime = require('@/services/RuntimeConfig.service');
const audit = require('@/utils/auditLogger');

let spies: ReturnType<typeof vi.spyOn>[];
let originals: Record<string, unknown>;
beforeEach(() => {
  originals = { ...mockPrisma };
  spies = [
    vi
      .spyOn(runtime, 'getRuntimeConfig')
      .mockResolvedValue({ emailOutboxEnabled: false }),
    vi.spyOn(audit, 'logActionStrict').mockResolvedValue(undefined),
  ];
  mockPrisma.users = {
    findUnique: vi
      .fn()
      .mockResolvedValue({ email: 'admin@example.test', locale: 'en' }),
    findMany: vi.fn(),
    count: vi.fn().mockResolvedValue(1),
  };
  mockPrisma.antiAbuseShadow = { create: vi.fn().mockResolvedValue({}) };
  mockPrisma.blog_posts = { create: vi.fn(), update: vi.fn() };
  mockPrisma.messages = { createMany: vi.fn().mockResolvedValue({ count: 2 }) };
  mockPrisma.$transaction = vi.fn(async (callback: any) =>
    callback(mockPrisma),
  );
});
afterEach(() => {
  spies.reverse().forEach((s) => s.mockRestore());
  for (const key of Object.keys(mockPrisma))
    if (!(key in originals)) delete mockPrisma[key];
  Object.assign(mockPrisma, originals);
});
const response = () => {
  const res = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
};
const request = {
  method: 'POST',
  headers: {},
  query: {},
  session: { user: { id: '9' } },
  socket: { remoteAddress: '192.0.2.2' },
};
describe('admin mass messaging recipient selection', () => {
  it('targets only accounts whose latest effective status is ACTIVE', async () => {
    const now = new Date();
    mockPrisma.users.findMany.mockResolvedValue([
      { id: 11, statusHistories: [{ status: 'ACTIVE', end_date: null }] },
      { id: 12, statusHistories: [{ status: 'BANNED', end_date: null }] },
      {
        id: 13,
        statusHistories: [
          { status: 'VACATION', end_date: new Date(now.getTime() + 60_000) },
        ],
      },
      {
        id: 14,
        statusHistories: [
          { status: 'VACATION', end_date: new Date(now.getTime() - 60_000) },
        ],
      },
      { id: 15, statusHistories: [] },
    ]);
    const res = response();
    await handleMassMessages(request, res, {
      body: BroadcastSchema.parse({
        idempotencyKey: '7c1efc46-24ba-4d33-8fe9-3729b3f443b0',
        subject: 'notice',
        body: 'text',
        sendToAll: true,
      }),
    });
    expect(
      mockPrisma.messages.createMany.mock.calls[0][0].data.map(
        (m: { to_user_id: number }) => m.to_user_id,
      ),
    ).toEqual([11, 14]);
    expect(audit.logActionStrict).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'ADMIN_MASS_MESSAGE',
        details: { subject: 'notice', sendToAll: true, recipientCount: 2 },
      }),
      mockPrisma,
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it('rejects unknown IDs instead of silently dropping them', async () => {
    const res = response();
    await handleMassMessages(request, res, {
      body: BroadcastSchema.parse({
        idempotencyKey: '7c1efc46-24ba-4d33-8fe9-3729b3f443b0',
        subject: 'notice',
        body: 'text',
        recipientUserIds: [11, 99],
      }),
    });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockPrisma.messages.createMany).not.toHaveBeenCalled();
  });
});

describe('email authorization, count and send idempotency', () => {
  it('rejects active email audiences before reading recipients', async () => {
    spies.push(vi.spyOn(authorization, 'isAdmin').mockResolvedValue(false));
    for (const channel of ['EMAIL', 'BOTH']) {
      const res = response();
      await handleMassMessages(request, res, {
        body: BroadcastSchema.parse({
          subject: 's',
          body: 'b',
          activeWithinDays: 30,
          channel,
        }),
      });
      expect(res.status).toHaveBeenCalledWith(403);
    }
    expect(mockPrisma.users.findUnique).not.toHaveBeenCalled();
  });
  it('rejects non-administrator news email creates and updates before mutation', async () => {
    spies.push(vi.spyOn(authorization, 'isAdmin').mockResolvedValue(false));
    for (const [route, method] of [
      [posts, 'POST'],
      [postById, 'PUT'],
    ] as const) {
      const res = response();
      await route.handler({ ...request, method }, res, {
        query: { id: '1' },
        body: {
          title: 'News',
          content: 'Text',
          kind: 'NEWS',
          status: 'PUBLISHED',
          sendEmail: true,
        },
      });
      expect(res.status).toHaveBeenCalledWith(403);
    }
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });
  it('counts only eligible NEWS recipients for administrator confirmation', async () => {
    spies.push(vi.spyOn(authorization, 'isAdmin').mockResolvedValue(true));
    const batchSpy = vi
      .spyOn(email, 'forEachEligibleRecipientBatch')
      .mockImplementation(async (filter: any, size: number, callback: any) => {
        expect(filter).toEqual({ category: 'NEWS', includeAll: true });
        expect(size).toBe(250);
        await callback([{ userId: 11 }, { userId: 12 }]);
      });
    spies.push(batchSpy);
    const res = response();
    await posts.handler(
      { ...request, method: 'GET', query: { emailCount: 'true' } },
      res,
      {},
    );
    expect(res.json).toHaveBeenCalledWith({ count: 2 });
    authorization.isAdmin.mockResolvedValue(false);
    const denied = response();
    await posts.handler(
      { ...request, method: 'GET', query: { emailCount: 'true' } },
      denied,
      {},
    );
    expect(denied.status).toHaveBeenCalledWith(403);
    expect(batchSpy).toHaveBeenCalledTimes(1);
  });
  it('rejects duplicate confirmed sends before messages or campaigns are written', async () => {
    const body = BroadcastSchema.parse({
      subject: 's',
      body: 'b',
      recipientUserIds: [11],
      idempotencyKey: '7c1efc46-24ba-4d33-8fe9-3729b3f443b0',
    });
    await handleMassMessages(request, response(), { body });
    expect(mockPrisma.messages.createMany).toHaveBeenCalledTimes(1);
    expect(
      mockPrisma.antiAbuseShadow.create.mock.calls[0][0].data.expiresAt.getTime(),
    ).toBeGreaterThan(Date.now() + 599_000);
    mockPrisma.antiAbuseShadow.create.mockRejectedValue({ code: 'P2002' });
    const res = response();
    await handleMassMessages(request, res, { body });
    expect(res.status).toHaveBeenCalledWith(409);
    expect(mockPrisma.messages.createMany).toHaveBeenCalledTimes(1);
  });
  it('retains broadcast-send audit names for email and both channels', async () => {
    spies.push(
      vi
        .spyOn(adminEmail, 'createDraftCampaign')
        .mockResolvedValue({ id: 12, recipientCount: 0 }),
    );
    spies.push(
      vi
        .spyOn(adminEmail, 'enqueueDraftCampaign')
        .mockResolvedValue({ id: 12, recipientCount: 1 }),
    );
    for (const channel of ['EMAIL', 'BOTH']) {
      const res = response();
      await handleMassMessages(request, res, {
        body: BroadcastSchema.parse({
          subject: 's',
          body: 'b',
          recipientUserIds: [11],
          channel,
          idempotencyKey: '7c1efc46-24ba-4d33-8fe9-3729b3f443b0',
        }),
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(audit.logActionStrict).toHaveBeenLastCalledWith(
        expect.objectContaining({
          action: 'ADMIN_BROADCAST_SEND',
          details: expect.objectContaining({ channel }),
        }),
        mockPrisma,
      );
    }
  });
  it('requires UUID keys only for send actions', async () => {
    expect(
      BroadcastSchema.safeParse({
        subject: 's',
        body: 'b',
        idempotencyKey: 'invalid',
      }).success,
    ).toBe(false);
    const res = response();
    await handleMassMessages(request, res, {
      body: BroadcastSchema.parse({
        subject: 's',
        body: 'b',
        recipientUserIds: [11],
      }),
    });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockPrisma.messages.createMany).not.toHaveBeenCalled();
    const countRes = response();
    await handleMassMessages(request, countRes, {
      body: BroadcastSchema.parse({
        subject: 's',
        body: 'b',
        recipientUserIds: [11],
        action: 'count',
      }),
    });
    expect(countRes.status).toHaveBeenCalledWith(200);
    expect(mockPrisma.antiAbuseShadow.create).not.toHaveBeenCalled();
  });
});
