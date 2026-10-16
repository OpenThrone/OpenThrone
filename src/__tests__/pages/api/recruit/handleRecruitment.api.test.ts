import { beforeEach, describe, expect, it, vi } from 'bun:test';
import {
  installMockPrisma,
  mockPrisma,
  resetMockPrisma,
} from 'test/utils/mockPrisma';
import { silenceLogger } from 'test/utils/silenceLogger';

installMockPrisma(vi);

// Mutable flag so one file can cover both auto-recruit states.
const autoRecruitState = { enabled: false };
vi.mock('@/constants/AutoRecruit', () => ({
  get AUTO_RECRUIT_ENABLED() {
    return autoRecruitState.enabled;
  },
}));
vi.mock('@/middleware/auth', () => ({
  withAuth: (handler: unknown) => handler,
}));
vi.mock('@/utils/auditLogger', () => ({
  logActionStrict: vi.fn(async () => undefined),
  logAction: vi.fn(),
}));
silenceLogger();
vi.mock('@/utils/mtrand', () => ({ mtRand: () => 0 }));

// The route captures the flag when it loads, so reload it per auto-recruit state.
const loadRoute = (enabled: boolean) => {
  autoRecruitState.enabled = enabled;
  delete require.cache[
    require.resolve('../../../../pages/api/recruit/handleRecruitment')
  ];
  delete require.cache[require.resolve('@/constants/AutoRecruit')];
  return require('../../../../pages/api/recruit/handleRecruitment').default;
};
let handler: any = loadRoute(false);

// Synthetic accounts; none correspond to real players.
const RECRUITER_ID = 42;
const LINK_OWNER_ID = 7;
const LINK = 'synthetic-recruit-link';

const session = { user: { id: RECRUITER_ID } };

const makeRes = () => {
  const res: any = { status: vi.fn(), json: vi.fn(), end: vi.fn() };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
};

/** Transaction client backed by the same mocks the service uses. */
const makeTx = (
  opts: {
    historyCount?: number;
    countFor?: (where: any) => number;
    users?: Set<number>;
  } = {},
) => {
  const existing = opts.users ?? new Set([RECRUITER_ID, LINK_OWNER_ID]);
  return {
    $queryRaw: vi.fn(async () => []),
    recruit_history: {
      count: vi.fn(async ({ where }: any) =>
        opts.countFor ? opts.countFor(where) : (opts.historyCount ?? 0),
      ),
      create: vi.fn(async () => ({})),
    },
    era: {
      findFirst: vi.fn(async () => ({
        startDate: new Date('2020-01-01T00:00:00.000Z'),
      })),
    },
    users: {
      findUnique: vi.fn(async ({ where }: any) =>
        existing.has(where.id)
          ? { id: where.id, email: 'x@example.invalid' }
          : null,
      ),
      update: vi.fn(async () => ({})),
    },
    userUnit: { upsert: vi.fn(async () => ({})) },
    bank_history: { create: vi.fn(async () => ({})) },
  };
};

const setupUsers = (tx: ReturnType<typeof makeTx>) => {
  mockPrisma.users.findUnique.mockImplementation(async ({ where }: any) => {
    if (where.recruit_link === LINK) return { id: LINK_OWNER_ID };
    if (where.id === LINK_OWNER_ID) return { id: LINK_OWNER_ID };
    if (where.id === RECRUITER_ID) return { id: RECRUITER_ID };
    return null;
  });
  // The transaction callback receives the mock tx, as Prisma would.
  mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(tx));
  return tx;
};

const run = async (body: any, req: { session?: any } = {}) => {
  const res = makeRes();
  await handler({ method: 'POST', body, session: req.session }, res);
  return res;
};

describe('handleRecruitment target validation', () => {
  beforeEach(() => {
    resetMockPrisma();
    handler = loadRoute(false);
    mockPrisma.users.findUnique.mockReset();
    mockPrisma.$transaction.mockReset();
  });

  it('rejects a numeric target from a logged-in player without a recruit link', async () => {
    const tx = setupUsers(makeTx());
    const res = await run(
      { recruitedUserId: 1234, selfRecruit: false },
      { session },
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'RECRUIT_LINK_REQUIRED' }),
    );
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(tx.recruit_history.create).not.toHaveBeenCalled();
  });

  it('rejects a numeric string target the same way as a number', async () => {
    setupUsers(makeTx());
    const res = await run({ recruitedUserId: '1234' }, { session });

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects an anonymous numeric target (F-15)', async () => {
    setupUsers(makeTx());
    const res = await run({ recruitedUserId: LINK_OWNER_ID });

    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects an anonymous request with no target at all', async () => {
    setupUsers(makeTx());
    const res = await run({});

    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a link that resolves to no account instead of crediting system sender 0', async () => {
    setupUsers(makeTx());
    const res = await run({ recruitedUserId: 'unknown-link' }, { session });

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Invalid recruitment link.',
    });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a numeric target that does not exist, even in an auto-recruit session', async () => {
    handler = loadRoute(true);
    setupUsers(makeTx());
    const res = await run(
      { recruitedUserId: 999999, sessionId: '5' },
      { session },
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Recruitment target not found.',
    });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a self-recruit reward aimed at a numeric account', async () => {
    handler = loadRoute(true);
    setupUsers(makeTx());
    const res = await run(
      { recruitedUserId: LINK_OWNER_ID, sessionId: '5', selfRecruit: true },
      { session },
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('still returns 503 for a session id while auto-recruit is disabled', async () => {
    setupUsers(makeTx());
    const res = await run(
      { recruitedUserId: LINK_OWNER_ID, sessionId: '5' },
      { session },
    );

    expect(res.status).toHaveBeenCalledWith(503);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('handleRecruitment link-based recruiting', () => {
  beforeEach(() => {
    resetMockPrisma();
    handler = loadRoute(false);
    mockPrisma.users.findUnique.mockReset();
    mockPrisma.$transaction.mockReset();
  });

  it('credits the logged-in visitor from the link owner as before', async () => {
    const tx = setupUsers(makeTx());
    const res = await run(
      { recruitedUserId: LINK, selfRecruit: false },
      { session },
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(tx.recruit_history.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        from_user: LINK_OWNER_ID,
        to_user: RECRUITER_ID,
      }),
    });
    expect(tx.users.update).toHaveBeenCalledWith({
      where: { id: RECRUITER_ID },
      data: { gold: { increment: 250 } },
    });
  });

  it('rejects an anonymous link visit before any gold is credited (REC-02)', async () => {
    const tx = setupUsers(makeTx());
    const res = await run({ recruitedUserId: LINK });

    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(tx.recruit_history.create).not.toHaveBeenCalled();
    expect(tx.users.update).not.toHaveBeenCalled();
  });

  it('rejects a recruit link owned by the signed-in player (self-recruit)', async () => {
    setupUsers(makeTx());
    const res = await run(
      { recruitedUserId: LINK },
      { session: { user: { id: LINK_OWNER_ID } } },
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'SELF_RECRUIT_REJECTED' }),
    );
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a self-recruit reward flag on a link, even for another owner', async () => {
    setupUsers(makeTx());
    const res = await run(
      { recruitedUserId: LINK, selfRecruit: true },
      { session },
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('blocks a recruiter who already claimed 25 recruits today across all targets', async () => {
    const tx = setupUsers(
      makeTx({
        // Pair count is zero; only the recruiter's all-target total is at the cap.
        countFor: (where) =>
          where.to_user === RECRUITER_ID && where.from_user?.not === 0 ? 25 : 0,
      }),
    );
    const res = await run({ recruitedUserId: LINK }, { session });

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      error: 'You have reached the daily recruitment limit.',
      code: 'RECRUITER_DAILY_CAP_REACHED',
    });
    expect(tx.recruit_history.create).not.toHaveBeenCalled();
    expect(tx.users.update).not.toHaveBeenCalled();
  });

  it('blocks a link owner who already received 25 recruits today from all senders', async () => {
    const tx = setupUsers(
      makeTx({
        countFor: (where) =>
          where.from_user === LINK_OWNER_ID && where.to_user === undefined
            ? 25
            : 0,
      }),
    );
    const res = await run({ recruitedUserId: LINK }, { session });

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      error: 'This player has reached the daily recruitment limit.',
      code: 'TARGET_DAILY_CAP_REACHED',
    });
    expect(tx.recruit_history.create).not.toHaveBeenCalled();
    expect(tx.users.update).not.toHaveBeenCalled();
  });

  it('allows a recruit one below both daily caps', async () => {
    const tx = setupUsers(
      makeTx({
        countFor: (where) =>
          where.to_user === RECRUITER_ID && where.from_user?.not === 0
            ? 24
            : where.to_user === undefined && where.from_user === LINK_OWNER_ID
              ? 24
              : 0,
      }),
    );
    const res = await run({ recruitedUserId: LINK }, { session });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(tx.users.update).toHaveBeenCalledWith({
      where: { id: RECRUITER_ID },
      data: { gold: { increment: 250 } },
    });
  });

  it('keeps the five-per-day link limit', async () => {
    const tx = setupUsers(makeTx({ historyCount: 5 }));
    const res = await run({ recruitedUserId: LINK }, { session });

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'PAIR_LIMIT_REACHED' }),
    );
    expect(tx.users.update).not.toHaveBeenCalled();
  });
});
