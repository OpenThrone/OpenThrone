import { beforeEach, describe, expect, it, vi } from 'bun:test';
import {
  installMockPrisma,
  mockPrisma,
  resetMockPrisma,
} from 'test/utils/mockPrisma';
import { silenceLogger } from 'test/utils/silenceLogger';

installMockPrisma(vi);
silenceLogger();
vi.mock('@/middleware/auth', () => ({
  withAuth: (handler: unknown) => handler,
}));
vi.mock('@/services/RecruitmentCaptcha.service', () => ({
  verifyRecruitmentCaptcha: vi.fn(
    async (token: unknown) => token !== 'invalid',
  ),
  isRecruitmentCaptchaRequired: () => true,
}));
const {
  invalidateRuntimeConfigCache,
} = require('@/services/RuntimeConfig.service');
const {
  performExternalRecruitment,
  performRecruitment,
  getRecruitmentBlock,
} = require('@/services/Recruitment.service');
const handler = require('../../../../pages/api/recruit/external/[id]').default;

const OWNER = 7;
const LINK = 'synthetic-owner-link';
const IP = '192.0.2.18';
const response = () => {
  const res: any = { status: vi.fn(), json: vi.fn(), setHeader: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
};
const transaction = (used = 0, ipUsed = 0) => ({
  serverSetting: { findMany: vi.fn(async () => []) },
  gameEvent: { findMany: vi.fn(async () => []) },
  $queryRaw: vi.fn(async () => []),
  era: { findFirst: vi.fn(async () => null) },
  users: {
    findUnique: vi.fn(async () => ({ id: OWNER })),
    update: vi.fn(async () => ({})),
  },
  userUnit: { upsert: vi.fn(async () => ({})) },
  bank_history: { create: vi.fn(async () => ({})) },
  recruit_history: {
    count: vi.fn(async ({ where }: any) =>
      where.source !== 'EXTERNAL' ? 999 : where.ip_addr ? ipUsed : used,
    ),
    create: vi.fn(async () => ({})),
  },
});
async function post(
  tx: ReturnType<typeof transaction>,
  visitor?: number,
  captchaToken = 'valid',
) {
  mockPrisma.$transaction.mockImplementation(async (callback: any) =>
    callback(tx),
  );
  const res = response();
  await handler(
    {
      method: 'POST',
      query: { id: LINK },
      body: { captchaToken },
      socket: { remoteAddress: IP },
      ...(visitor ? { session: { user: { id: visitor } } } : {}),
    },
    res,
  );
  return res;
}
beforeEach(() => {
  resetMockPrisma();
  invalidateRuntimeConfigCache();
  mockPrisma.serverSetting.findMany.mockResolvedValue([]);
  mockPrisma.recruit_history = { count: vi.fn(async () => 0) };
  mockPrisma.users.findUnique.mockImplementation(async ({ where }: any) =>
    where.recruit_link === LINK ? { id: OWNER } : null,
  );
});
describe('public external recruitment', () => {
  for (const visitor of [undefined, OWNER, 42]) {
    it(`credits the owner and uses the same IP quota for visitor ${visitor ?? 'anonymous'}`, async () => {
      const tx = transaction();
      const res = await post(tx, visitor);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(tx.recruit_history.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          source: 'EXTERNAL',
          from_user: null,
          to_user: OWNER,
          ip_addr: IP,
        }),
      });
      expect(tx.userUnit.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: { quantity: { increment: 1 }, level: 1 },
          create: expect.objectContaining({ userId: OWNER, quantity: 1 }),
        }),
      );
      expect(tx.users.update).toHaveBeenCalledWith({
        where: { id: OWNER },
        data: { gold: { increment: 0 } },
      });
      expect(tx.recruit_history.count).toHaveBeenCalledWith({
        where: expect.objectContaining({
          source: 'EXTERNAL',
          to_user: OWNER,
          ip_addr: IP,
        }),
      });
    });
  }
  it('refuses the sixth visit from the same IP without writing rewards', async () => {
    const tx = transaction(5, 5);
    const res = await post(tx);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'IP_DAILY_CAP_REACHED' }),
    );
    expect(tx.userUnit.upsert).not.toHaveBeenCalled();
  });
  it('refuses the owner daily cap even when this IP has remaining visits', async () => {
    const tx = transaction(25, 0);
    const res = await post(tx, 42);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'EXTERNAL_DAILY_CAP_REACHED' }),
    );
    expect(tx.recruit_history.create).not.toHaveBeenCalled();
  });
  it('requires server captcha verification before starting the reward transaction', async () => {
    const tx = transaction();
    const res = await post(tx, undefined, 'invalid');
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'CAPTCHA_FAILED' }),
    );
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });
  it('honors configured independent internal, external, and IP caps', async () => {
    mockPrisma.serverSetting.findMany.mockResolvedValue([
      { key: 'recruit.internalDailyCap', value: 2 },
      { key: 'recruit.dailyCap', value: 8 },
      { key: 'recruit.externalIpDailyCap', value: 2 },
    ]);
    invalidateRuntimeConfigCache();
    const tx = transaction(2, 2);
    const res = await post(tx);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'IP_DAILY_CAP_REACHED' }),
    );
    const block = await getRecruitmentBlock({
      db: {
        era: tx.era,
        recruit_history: {
          count: async ({ where }: any) => (where.from_user?.not === 0 ? 2 : 0),
        },
      },
      recruiterId: 42,
      targetId: OWNER,
    });
    expect(block).toBe('RECRUITER_DAILY_CAP_REACHED');
  });

  it('keeps internal rewards independent of an exhausted external allowance', async () => {
    const tx = transaction(25, 5);
    tx.recruit_history.count.mockImplementation(async ({ where }: any) =>
      where.source === 'EXTERNAL' ? 25 : 0,
    );
    await performRecruitment({
      tx,
      fromUser: OWNER,
      toUser: 42,
      userIdToUpdate: 42,
      ipAddress: IP,
    });
    expect(tx.recruit_history.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        source: 'INTERNAL',
        from_user: OWNER,
        to_user: 42,
      }),
    });
    expect(tx.userUnit.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ userId: 42, quantity: 1 }),
      }),
    );
  });

  it('resolves direct-call settings and citizen events on the transaction connection', async () => {
    const tx = transaction();
    tx.gameEvent.findMany.mockResolvedValue([
      {
        id: 1,
        name: 'Synthetic citizen event',
        description: null,
        startsAt: new Date('2020-01-01'),
        endsAt: null,
        eraId: null,
        config: { citizenMultiplier: 2, citizenMultiplierScope: 'RECRUITING' },
      },
    ] as any);
    await performExternalRecruitment({ tx, ownerId: OWNER, ipAddress: IP });
    expect(tx.serverSetting.findMany).toHaveBeenCalledTimes(1);
    expect(tx.gameEvent.findMany).toHaveBeenCalledTimes(1);
    expect(tx.users.update).toHaveBeenCalledWith({
      where: { id: OWNER },
      data: {
        gold: { increment: 0 },
        event_citizens_received: { increment: 1 },
      },
    });
    expect(tx.userUnit.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ userId: OWNER, quantity: 2 }),
      }),
    );
    expect(mockPrisma.serverSetting.findMany).not.toHaveBeenCalled();
  });

  it('serializes concurrent external claims before checking the owner and IP limits', async () => {
    let used = 4;
    let release: (() => void) | undefined;
    let held: Promise<void> | undefined;
    const txFor = () => {
      const tx = transaction();
      tx.$queryRaw.mockImplementation(async () => {
        while (held) await held;
        held = new Promise<void>((resolve) => {
          release = resolve;
        });
        return [];
      });
      tx.recruit_history.count.mockImplementation(async () => used);
      tx.recruit_history.create.mockImplementation(async () => {
        used++;
        return {};
      });
      return tx;
    };
    const first = txFor();
    const second = txFor();
    const run = async (tx: ReturnType<typeof transaction>) => {
      try {
        return await performExternalRecruitment({
          tx,
          ownerId: OWNER,
          ipAddress: IP,
        });
      } finally {
        const unlock = release;
        held = undefined;
        unlock?.();
      }
    };
    const result = await Promise.allSettled([run(first), run(second)]);
    expect(result.map((entry) => entry.status)).toEqual([
      'fulfilled',
      'rejected',
    ]);
    expect(used).toBe(5);
    expect(first.userUnit.upsert).toHaveBeenCalledTimes(1);
    expect(second.userUnit.upsert).not.toHaveBeenCalled();
  });

  it('prechecks public allowance without granting a reward', async () => {
    mockPrisma.recruit_history.count.mockImplementation(
      async ({ where }: any) => (where.ip_addr ? 2 : 10),
    );
    const res = response();
    await handler(
      { method: 'GET', query: { id: LINK }, socket: { remoteAddress: IP } },
      res,
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        eligible: true,
        showCaptcha: true,
        remaining: 15,
        perIpRemaining: 3,
        dailyCap: 25,
        perIpCap: 5,
      }),
    );
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });
});
