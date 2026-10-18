import { beforeEach, describe, expect, it, vi } from 'bun:test';
import { installMockPrisma, mockPrisma } from 'test/utils/mockPrisma';
import { silenceLogger } from 'test/utils/silenceLogger';

installMockPrisma(vi);
silenceLogger();

// Dynamic import so the Prisma mock is installed before the services load.
const { AllianceBankService } = await import('../AllianceBank.service');
const { AllianceGoldRequestService, cancelPendingGoldRequests } =
  await import('../AllianceGoldRequest.service');

// Synthetic alliance (#66 phase 2): leader 5; banker 6 (manage_bank);
// members 8 (request_gold) and 9 (no request_gold); outsider 99.
const ALLIANCE_ID = 3;
const LEADER = 5;
const BANKER = 6;
const MEMBER = 8;
const MEMBER_NO_REQUEST = 9;
const OUTSIDER = 99;

const ROLES: Record<number, { permissions: Record<string, boolean> }> = {
  [LEADER]: { permissions: {} },
  [BANKER]: { permissions: { manage_bank: true, request_gold: true } },
  [MEMBER]: { permissions: { request_gold: true } },
  [MEMBER_NO_REQUEST]: { permissions: {} },
};

let allianceGold: bigint;
let userGold: Record<number, bigint>;
let requests: any[];
let history: any[];

beforeEach(() => {
  allianceGold = 1_000n;
  userGold = {
    [LEADER]: 100n,
    [BANKER]: 100n,
    [MEMBER]: 1_000n,
    [MEMBER_NO_REQUEST]: 100n,
  };
  requests = [];
  history = [];

  mockPrisma.$queryRaw = vi.fn(async () => []);
  mockPrisma.$transaction = vi.fn(async (operation: any) => {
    // Emulate rollback: restore state when the operation throws.
    const snapshot = {
      allianceGold,
      userGold: { ...userGold },
      requests: requests.map((r) => ({ ...r })),
      history: [...history],
    };
    try {
      return await operation(mockPrisma);
    } catch (error) {
      allianceGold = snapshot.allianceGold;
      userGold = snapshot.userGold;
      requests = snapshot.requests;
      history = snapshot.history;
      throw error;
    }
  });
  mockPrisma.alliances = {
    findUnique: vi.fn(async () => ({ id: ALLIANCE_ID, leader_id: LEADER })),
    updateMany: vi.fn(async ({ where, data }: any) => {
      const need = where.gold_in_bank?.gte ?? 0n;
      if (allianceGold < need) return { count: 0 };
      allianceGold -= data.gold_in_bank.decrement;
      return { count: 1 };
    }),
  };
  mockPrisma.alliance_memberships = {
    findUnique: vi.fn(async ({ where }: any) => {
      const userId = where.unique_alliance_user.user_id;
      return ROLES[userId] ? { user_id: userId, role: ROLES[userId] } : null;
    }),
    count: vi.fn(async ({ where }: any) => (ROLES[where.user_id] ? 1 : 0)),
  };
  mockPrisma.users = {
    findUnique: vi.fn(async ({ where }: any) => ({ gold: userGold[where.id] })),
    updateMany: vi.fn(async ({ where, data }: any) => {
      if (userGold[where.id] === undefined) return { count: 0 };
      if (data.gold?.decrement !== undefined) {
        if (userGold[where.id] < (where.gold?.gte ?? 0n)) return { count: 0 };
        userGold[where.id] -= data.gold.decrement;
      } else {
        userGold[where.id] += data.gold.increment;
      }
      return { count: 1 };
    }),
  };
  mockPrisma.alliance_bank_history = {
    create: vi.fn(async ({ data }: any) => {
      history.push(data);
      return data;
    }),
    aggregate: vi.fn(async ({ where }: any) => ({
      _sum: {
        amount: history
          .filter(
            (h) =>
              h.related_user_id === where.related_user_id &&
              where.transaction_type.in.includes(h.transaction_type),
          )
          .reduce((sum, h) => sum + h.amount, 0n),
      },
    })),
  };
  mockPrisma.alliance_gold_requests = {
    count: vi.fn(
      async ({ where }: any) =>
        requests.filter(
          (r) =>
            r.requester_id === where.requester_id && r.status === where.status,
        ).length,
    ),
    create: vi.fn(async ({ data }: any) => {
      const row = { id: requests.length + 1, status: 'PENDING', ...data };
      requests.push(row);
      return row;
    }),
    findFirst: vi.fn(
      async ({ where }: any) => requests.find((r) => r.id === where.id) ?? null,
    ),
    updateMany: vi.fn(async ({ where, data }: any) => {
      const matches = requests.filter(
        (r) =>
          (where.id === undefined || r.id === where.id) &&
          (where.requester_id === undefined ||
            r.requester_id === where.requester_id) &&
          r.status === where.status,
      );
      matches.forEach((r) => Object.assign(r, data));
      return { count: matches.length };
    }),
  };
});

describe('alliance deposit cap (80%)', () => {
  it('rejects a deposit over 80% of gold on hand', async () => {
    await expect(
      AllianceBankService.deposit({
        allianceId: ALLIANCE_ID,
        userId: MEMBER,
        amount: 801n,
      }),
    ).rejects.toThrow(/80%/);
    expect(userGold[MEMBER]).toBe(1_000n);
    expect(allianceGold).toBe(1_000n);
  });

  it('accepts a deposit exactly at the cap', async () => {
    mockPrisma.alliances.updateMany = vi.fn(async ({ data }: any) => {
      allianceGold += data.gold_in_bank.increment;
      return { count: 1 };
    });
    await AllianceBankService.deposit({
      allianceId: ALLIANCE_ID,
      userId: MEMBER,
      amount: 800n,
    });
    expect(userGold[MEMBER]).toBe(200n);
    expect(allianceGold).toBe(1_800n);
  });
});

describe('transfer to member', () => {
  it('lets the leader transfer and records history with the note', async () => {
    await AllianceBankService.transfer({
      allianceId: ALLIANCE_ID,
      requesterId: LEADER,
      targetUserId: MEMBER,
      amount: 300n,
      notes: 'Supplies',
    });
    expect(allianceGold).toBe(700n);
    expect(userGold[MEMBER]).toBe(1_300n);
    expect(history[0]).toMatchObject({ amount: 300n, notes: 'Supplies' });
  });

  it('lets a manage_bank member transfer', async () => {
    await AllianceBankService.transfer({
      allianceId: ALLIANCE_ID,
      requesterId: BANKER,
      targetUserId: MEMBER,
      amount: 10n,
    });
    expect(allianceGold).toBe(990n);
  });

  it('requires manage_bank', async () => {
    await expect(
      AllianceBankService.transfer({
        allianceId: ALLIANCE_ID,
        requesterId: MEMBER,
        targetUserId: MEMBER,
        amount: 10n,
      }),
    ).rejects.toThrow(/permission/);
    expect(allianceGold).toBe(1_000n);
  });

  it('rejects a target who is not a member', async () => {
    await expect(
      AllianceBankService.transfer({
        allianceId: ALLIANCE_ID,
        requesterId: LEADER,
        targetUserId: OUTSIDER,
        amount: 10n,
      }),
    ).rejects.toThrow(/not a member/);
    expect(allianceGold).toBe(1_000n);
  });

  it('rejects notes over 200 characters', async () => {
    await expect(
      AllianceBankService.transfer({
        allianceId: ALLIANCE_ID,
        requesterId: LEADER,
        targetUserId: MEMBER,
        amount: 10n,
        notes: 'x'.repeat(201),
      }),
    ).rejects.toThrow();
  });
});

describe('gold requests', () => {
  const create = (userId = MEMBER, amount = 100n) =>
    AllianceGoldRequestService.create({
      allianceId: ALLIANCE_ID,
      userId,
      amount,
      reason: 'Need troops',
    });

  it('requires request_gold', async () => {
    await expect(create(MEMBER_NO_REQUEST)).rejects.toThrow(/permission/);
  });

  it('limits a member to 3 pending requests', async () => {
    await create();
    await create();
    await create();
    await expect(create()).rejects.toThrow(/at most 3/);
  });

  it('approves once: pays the requester and fails the second approval', async () => {
    const request = await create(MEMBER, 250n);
    const decide = () =>
      AllianceGoldRequestService.decide({
        allianceId: ALLIANCE_ID,
        requestId: request.id,
        actorId: BANKER,
        decision: 'approve',
      });

    await decide();
    expect(requests[0].status).toBe('APPROVED');
    expect(allianceGold).toBe(750n);
    expect(userGold[MEMBER]).toBe(1_250n);

    await expect(decide()).rejects.toThrow(/already been decided/);
    expect(allianceGold).toBe(750n);
    expect(userGold[MEMBER]).toBe(1_250n);
  });

  it('keeps the request pending when the treasury is short', async () => {
    const request = await create(MEMBER, 5_000n);
    await expect(
      AllianceGoldRequestService.decide({
        allianceId: ALLIANCE_ID,
        requestId: request.id,
        actorId: LEADER,
        decision: 'approve',
      }),
    ).rejects.toThrow(/Insufficient alliance funds/);
    expect(requests[0].status).toBe('PENDING');
    expect(allianceGold).toBe(1_000n);
  });

  it('declines without moving gold', async () => {
    const request = await create();
    await AllianceGoldRequestService.decide({
      allianceId: ALLIANCE_ID,
      requestId: request.id,
      actorId: LEADER,
      decision: 'decline',
    });
    expect(requests[0].status).toBe('DECLINED');
    expect(allianceGold).toBe(1_000n);
  });

  it('only managers can decide', async () => {
    const request = await create();
    await expect(
      AllianceGoldRequestService.decide({
        allianceId: ALLIANCE_ID,
        requestId: request.id,
        actorId: MEMBER,
        decision: 'approve',
      }),
    ).rejects.toThrow(/permission/);
    expect(requests[0].status).toBe('PENDING');
  });

  it('lets the requester cancel their own pending request only', async () => {
    const request = await create();
    await expect(
      AllianceGoldRequestService.cancel({
        allianceId: ALLIANCE_ID,
        requestId: request.id,
        userId: BANKER,
      }),
    ).rejects.toThrow(/No pending request/);

    await AllianceGoldRequestService.cancel({
      allianceId: ALLIANCE_ID,
      requestId: request.id,
      userId: MEMBER,
    });
    expect(requests[0].status).toBe('CANCELLED');
  });

  it('cancels pending requests when a member leaves or is kicked', async () => {
    await create();
    await cancelPendingGoldRequests(mockPrisma as any, ALLIANCE_ID, MEMBER);
    expect(requests[0].status).toBe('CANCELLED');
  });
});
