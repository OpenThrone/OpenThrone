import { beforeEach, describe, expect, it, vi } from 'bun:test';
import { installMockPrisma, mockPrisma } from 'test/utils/mockPrisma';
import { silenceLogger } from 'test/utils/silenceLogger';

installMockPrisma(vi);
silenceLogger();

// Dynamic import so the Prisma mock is installed before the services load.
const { AllianceBankService } = await import('../AllianceBank.service');
const { AllianceLoanService, divertIncomeToLoans } =
  await import('../AllianceLoan.service');
const { AllianceService } = await import('../Alliance.service');
const { depositGold } = await import('../Bank.service');
const { computeLoanOwed } = await import('@/constants/allianceTreasury');

// Synthetic alliance (#66 phase 3): leader 5; banker 6 (manage_bank);
// members 8 and 9 (request_gold); member 10 cannot request.
const ALLIANCE_ID = 3;
const LEADER = 5;
const BANKER = 6;
const MEMBER = 8;
const MEMBER_2 = 9;
const NO_REQUEST = 10;

const ROLES: Record<number, any> = {
  [LEADER]: { rank_order: 0, permissions: {} },
  [BANKER]: {
    rank_order: 1,
    permissions: { manage_bank: true, request_gold: true, kick_member: true },
  },
  [MEMBER]: { rank_order: 2, permissions: { request_gold: true } },
  [MEMBER_2]: { rank_order: 2, permissions: { request_gold: true } },
  [NO_REQUEST]: { rank_order: 2, permissions: {} },
};

let alliance: Record<string, any>;
let userRows: Record<number, { gold: bigint; gold_in_bank: bigint }>;
let loans: any[];
let history: any[];
let messages: any[];
let memberIds: number[];
let allianceDeleted: boolean;

const inFilter = (value: any, filter: any) => {
  if (filter === undefined) return true;
  if (filter && typeof filter === 'object' && !(filter instanceof Date)) {
    if (filter.in) return filter.in.includes(value);
    if (filter.notIn) return !filter.notIn.includes(value);
    if (filter.lt) return value !== null && value < filter.lt;
    if (filter.gte !== undefined) return value >= filter.gte;
    return true;
  }
  return value === filter;
};

const matchLoan = (row: any, where: any = {}) =>
  Object.entries(where).every(([key, filter]) => inFilter(row[key], filter));

const snapshot = () =>
  JSON.stringify(
    { alliance, userRows, loans, history, messages, memberIds },
    (_k, v) => (typeof v === 'bigint' ? `__big__${v}` : v),
  );
const restore = (raw: string) => {
  const s = JSON.parse(raw, (_k, v) =>
    typeof v === 'string' && v.startsWith('__big__') ? BigInt(v.slice(7)) : v,
  );
  // Restore in place so references held by tests stay valid.
  Object.assign(alliance, s.alliance);
  for (const [id, row] of Object.entries(s.userRows)) {
    Object.assign(userRows[Number(id)], row);
  }
  loans.splice(s.loans.length);
  s.loans.forEach((l: any, i: number) => {
    Object.assign(loans[i], {
      ...l,
      due_at: l.due_at ? new Date(l.due_at) : l.due_at,
    });
  });
  history.splice(0, history.length, ...s.history);
  messages.splice(0, messages.length, ...s.messages);
  memberIds = s.memberIds;
};

const loanFixture = (over: Record<string, any> = {}) => {
  const row = {
    id: loans.length + 1,
    alliance_id: ALLIANCE_ID,
    borrower_id: MEMBER,
    principal: 1_000n,
    interest_pct: 10,
    amount_owed: 1_100n,
    amount_repaid: 0n,
    status: 'ACTIVE',
    due_at: new Date(Date.now() + 86_400_000),
    ...over,
  };
  loans.push(row);
  return row;
};

const reason = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error: Error) => error.message,
  );

beforeEach(() => {
  alliance = {
    id: ALLIANCE_ID,
    name: 'Synthetic Pact',
    leader_id: LEADER,
    gold_in_bank: 100_000n,
    loan_term_days: 7,
    loan_interest_pct: 10,
    member_daily_cap: 5_000_000n,
  };
  userRows = {
    [LEADER]: { gold: 100n, gold_in_bank: 0n },
    [BANKER]: { gold: 100n, gold_in_bank: 0n },
    [MEMBER]: { gold: 5_000n, gold_in_bank: 0n },
    [MEMBER_2]: { gold: 0n, gold_in_bank: 0n },
    [NO_REQUEST]: { gold: 0n, gold_in_bank: 0n },
  };
  loans = [];
  history = [];
  messages = [];
  memberIds = [LEADER, BANKER, MEMBER, MEMBER_2, NO_REQUEST];
  allianceDeleted = false;

  mockPrisma.$queryRaw = vi.fn(async () => []);
  mockPrisma.$transaction = vi.fn(async (operation: any) => {
    const saved = snapshot();
    try {
      return await operation(mockPrisma);
    } catch (error) {
      restore(saved);
      throw error;
    }
  });
  mockPrisma.alliances = {
    findUnique: vi.fn(async () => alliance),
    findFirst: vi.fn(async ({ where }: any) =>
      where.leader_id === undefined || where.leader_id === alliance.leader_id
        ? alliance
        : null,
    ),
    update: vi.fn(async ({ data }: any) => {
      Object.assign(alliance, data);
      return alliance;
    }),
    updateMany: vi.fn(async ({ where, data }: any) => {
      const gold = BigInt(alliance.gold_in_bank);
      if (
        where.gold_in_bank?.gte !== undefined &&
        gold < where.gold_in_bank.gte
      )
        return { count: 0 };
      if (data.gold_in_bank?.decrement !== undefined)
        alliance.gold_in_bank = gold - data.gold_in_bank.decrement;
      else if (data.gold_in_bank?.increment !== undefined)
        alliance.gold_in_bank = gold + data.gold_in_bank.increment;
      else if (typeof data.gold_in_bank === 'bigint')
        alliance.gold_in_bank = data.gold_in_bank;
      return { count: 1 };
    }),
    delete: vi.fn(async () => {
      allianceDeleted = true;
      return alliance;
    }),
  };
  mockPrisma.alliance_memberships = {
    findUnique: vi.fn(async ({ where }: any) => {
      const id = where.unique_alliance_user.user_id;
      return memberIds.includes(id)
        ? { id: 100 + id, user_id: id, role: ROLES[id], alliance }
        : null;
    }),
    findFirst: vi.fn(async ({ where }: any) =>
      memberIds.includes(where.user_id)
        ? {
            id: 100 + where.user_id,
            user_id: where.user_id,
            role: ROLES[where.user_id],
            alliance,
          }
        : null,
    ),
    findMany: vi.fn(async () =>
      memberIds.map((id) => ({ user_id: id, role: ROLES[id] })),
    ),
    count: vi.fn(async ({ where }: any) =>
      memberIds.includes(where.user_id) ? 1 : 0,
    ),
    delete: vi.fn(async ({ where }: any) => {
      memberIds = memberIds.filter((id) => 100 + id !== where.id);
      return {};
    }),
    deleteMany: vi.fn(async () => ({ count: 0 })),
  };
  mockPrisma.alliance_roles = { deleteMany: vi.fn(async () => ({ count: 0 })) };
  mockPrisma.alliance_wars = {
    findFirst: vi.fn(async () => null),
    deleteMany: vi.fn(async () => ({ count: 0 })),
  };
  let allianceRoomId: number | null = null;
  mockPrisma.chatRoom = {
    findMany: vi.fn(async () => []),
    findFirst: vi.fn(async () =>
      allianceRoomId ? { id: allianceRoomId } : null,
    ),
    create: vi.fn(async () => {
      allianceRoomId = 1;
      return { id: allianceRoomId };
    }),
    deleteMany: vi.fn(async () => ({ count: 0 })),
  };
  mockPrisma.chatRoomParticipant = {
    deleteMany: vi.fn(async () => ({ count: 0 })),
    createMany: vi.fn(async ({ data }: any) => ({ count: data.length })),
  };
  // Notices are posted to the alliance's conversation in /messaging.
  mockPrisma.chatMessage = {
    create: vi.fn(async ({ data }: any) => {
      messages.push(data);
      return { id: messages.length, ...data };
    }),
  };
  mockPrisma.attack_log_acl = { deleteMany: vi.fn(async () => ({ count: 0 })) };
  mockPrisma.alliance_gold_requests = {
    updateMany: vi.fn(async () => ({ count: 0 })),
  };
  mockPrisma.users = {
    findUnique: vi.fn(async ({ where }: any) => {
      const row = userRows[where.id];
      return row
        ? { id: where.id, display_name: `u${where.id}`, ...row }
        : null;
    }),
    updateMany: vi.fn(async ({ where, data }: any) => {
      const row = userRows[where.id];
      if (!row) return { count: 0 };
      if (
        (where.gold?.gte !== undefined && row.gold < where.gold.gte) ||
        (where.gold_in_bank?.gte !== undefined &&
          row.gold_in_bank < where.gold_in_bank.gte)
      )
        return { count: 0 };
      if (data.gold?.decrement !== undefined) row.gold -= data.gold.decrement;
      if (data.gold?.increment !== undefined) row.gold += data.gold.increment;
      if (data.gold_in_bank?.decrement !== undefined)
        row.gold_in_bank -= data.gold_in_bank.decrement;
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
  mockPrisma.alliance_loans = {
    create: vi.fn(async ({ data }: any) => {
      const row = {
        id: loans.length + 1,
        status: 'REQUESTED',
        amount_repaid: 0n,
        due_at: null,
        ...data,
      };
      loans.push(row);
      return row;
    }),
    count: vi.fn(
      async ({ where }: any) => loans.filter((l) => matchLoan(l, where)).length,
    ),
    findFirst: vi.fn(
      async ({ where }: any) => loans.find((l) => matchLoan(l, where)) ?? null,
    ),
    findMany: vi.fn(async ({ where }: any) =>
      loans.filter((l) => matchLoan(l, where)),
    ),
    updateMany: vi.fn(async ({ where, data }: any) => {
      const matches = loans.filter((l) => matchLoan(l, where));
      matches.forEach((l) => Object.assign(l, data));
      return { count: matches.length };
    }),
  };
  mockPrisma.messages = {
    createMany: vi.fn(async ({ data }: any) => {
      messages.push(...data);
      return { count: data.length };
    }),
  };
  mockPrisma.bank_history = {
    ...mockPrisma.bank_history,
    create: vi.fn(async () => ({})),
    findMany: vi.fn(async () => []),
    count: vi.fn(async () => 0),
  };
});

describe('loan interest', () => {
  it('adds flat interest rounded up to whole gold', () => {
    expect(computeLoanOwed(1_000n, 10)).toBe(1_100n);
    expect(computeLoanOwed(1_001n, 10)).toBe(1_102n); // 100.1 -> 101
    expect(computeLoanOwed(500n, 0)).toBe(500n);
    expect(computeLoanOwed(999n, 25)).toBe(1_249n); // 249.75 -> 250
  });
});

describe('requesting and approving', () => {
  const request = (userId: number, amount: bigint) =>
    AllianceLoanService.request({ allianceId: ALLIANCE_ID, userId, amount });
  const decide = (
    loanId: number,
    actorId = BANKER,
    decision: any = 'approve',
  ) =>
    AllianceLoanService.decide({
      allianceId: ALLIANCE_ID,
      loanId,
      actorId,
      decision,
    });

  it('needs request_gold', async () => {
    expect(await reason(request(NO_REQUEST, 100n))).toBe(
      'You do not have permission to request gold',
    );
  });

  it('refuses a request above the per-loan maximum (the daily cap)', async () => {
    alliance.member_daily_cap = 1_000n;
    expect(await reason(request(MEMBER, 1_001n))).toContain('limited to 1000');
  });

  it('approval keeps the quoted interest and starts the term on approval', async () => {
    const created = await request(MEMBER, 1_000n);
    alliance.loan_interest_pct = 20; // changes after the request, before approval
    alliance.loan_term_days = 3;
    await decide(created.id);
    const loan = loans[0];
    expect(loan.status).toBe('ACTIVE');
    // The borrower was quoted 10% when asking; the later 20% does not apply.
    expect(loan.amount_owed).toBe(1_100n);
    expect(loan.interest_pct).toBe(10);
    expect(loan.due_at.getTime() - Date.now()).toBeGreaterThan(
      2.9 * 86_400_000,
    );
    expect(userRows[MEMBER].gold).toBe(6_000n);
    expect(alliance.gold_in_bank).toBe(99_000n);
    expect(history.filter((h) => h.transaction_type === 'LOAN')).toHaveLength(
      1,
    );

    expect(await reason(decide(created.id))).toBe(
      'This loan request has already been decided',
    );
    expect(userRows[MEMBER].gold).toBe(6_000n);
  });

  it('only managers decide', async () => {
    const created = await request(MEMBER, 1_000n);
    expect(await reason(decide(created.id, MEMBER_2))).toBe(
      'You do not have permission to manage the bank',
    );
  });

  it('refuses a banker approving their own loan without approve_own_requests', async () => {
    const created = await request(BANKER, 1_000n);
    expect(await reason(decide(created.id, BANKER))).toBe(
      'You do not have permission to approve your own requests',
    );
    expect(loans[0].status).toBe('REQUESTED');
    expect(alliance.gold_in_bank).toBe(100_000n);
    // Declining (withdrawing) their own request stays possible.
    await decide(created.id, BANKER, 'decline');
    expect(loans[0].status).toBe('DECLINED');
  });

  it('lets a banker with approve_own_requests approve their own loan', async () => {
    const previous = ROLES[BANKER].permissions;
    ROLES[BANKER].permissions = { ...previous, approve_own_requests: true };
    try {
      const created = await request(BANKER, 1_000n);
      await decide(created.id, BANKER);
      expect(loans[0].status).toBe('ACTIVE');
      expect(alliance.gold_in_bank).toBe(99_000n);
    } finally {
      ROLES[BANKER].permissions = previous;
    }
  });

  it('always lets the leader approve their own loan', async () => {
    const created = await request(LEADER, 1_000n);
    await decide(created.id, LEADER);
    expect(loans[0].status).toBe('ACTIVE');
  });

  it('refuses a second active loan', async () => {
    const first = await request(MEMBER, 1_000n);
    await decide(first.id);
    expect(await reason(request(MEMBER, 500n))).toBe(
      'You already have an open loan or loan request',
    );
  });

  it('declines without moving gold', async () => {
    const created = await request(MEMBER, 1_000n);
    await decide(created.id, BANKER, 'decline');
    expect(loans[0].status).toBe('DECLINED');
    expect(alliance.gold_in_bank).toBe(100_000n);
  });

  it('approval respects the member daily cap and rolls back', async () => {
    alliance.member_daily_cap = 1_500n;
    history.push({
      transaction_type: 'WITHDRAWAL',
      related_user_id: MEMBER,
      amount: 600n,
    });
    const created = await request(MEMBER, 1_000n);
    expect(await reason(decide(created.id))).toContain('Daily limit reached');
    expect(loans[0].status).toBe('REQUESTED');
    expect(userRows[MEMBER].gold).toBe(5_000n);
    expect(alliance.gold_in_bank).toBe(100_000n);
  });

  it('the requester can cancel only while REQUESTED', async () => {
    const created = await request(MEMBER, 1_000n);
    await AllianceLoanService.cancel({
      allianceId: ALLIANCE_ID,
      loanId: created.id,
      userId: MEMBER,
    });
    expect(loans[0].status).toBe('CANCELLED');
    expect(
      await reason(
        AllianceLoanService.cancel({
          allianceId: ALLIANCE_ID,
          loanId: created.id,
          userId: MEMBER,
        }),
      ),
    ).toBe('No pending loan request to cancel');
  });
});

describe('daily cap on transfers', () => {
  it('refuses a transfer that would exceed the recipient daily cap', async () => {
    alliance.member_daily_cap = 1_000n;
    await AllianceBankService.transfer({
      allianceId: ALLIANCE_ID,
      requesterId: BANKER,
      targetUserId: MEMBER,
      amount: 700n,
    });
    expect(
      await reason(
        AllianceBankService.transfer({
          allianceId: ALLIANCE_ID,
          requesterId: BANKER,
          targetUserId: MEMBER,
          amount: 301n,
        }),
      ),
    ).toContain('Daily limit reached');
    expect(userRows[MEMBER].gold).toBe(5_700n);
  });

  it('caps leader transfers to themselves too', async () => {
    alliance.member_daily_cap = 1_000n;
    expect(
      await reason(
        AllianceBankService.transfer({
          allianceId: ALLIANCE_ID,
          requesterId: LEADER,
          targetUserId: LEADER,
          amount: 1_001n,
        }),
      ),
    ).toContain('Daily limit reached');
  });
});

describe('repayment', () => {
  it('diverts 25% of income and never exceeds the balance', async () => {
    const loan = loanFixture({ amount_owed: 1_100n, amount_repaid: 1_000n });
    const diverted = await divertIncomeToLoans(
      mockPrisma,
      MEMBER,
      1_000n,
      'economy',
    );
    expect(diverted).toBe(100n); // 25% = 250, but only 100 is left
    expect(loan.status).toBe('REPAID');
    expect(loan.amount_repaid).toBe(1_100n);
    // Income paths hold only the borrower lock, so the treasury credit is
    // parked on the loan and settled later under the alliance lock.
    expect(alliance.gold_in_bank).toBe(100_000n);
    expect(loan.pending_treasury_credit).toEqual({ increment: 100n });
    expect(
      await divertIncomeToLoans(mockPrisma, MEMBER, 1_000n, 'economy'),
    ).toBe(0n);
  });

  it('takes exactly 25% while the balance is larger', async () => {
    const loan = loanFixture();
    expect(await divertIncomeToLoans(mockPrisma, MEMBER, 401n, 'pillage')).toBe(
      100n,
    );
    expect(loan.amount_repaid).toBe(100n);
    expect(loan.status).toBe('ACTIVE');
  });

  it('keeps diverting for a DEFAULTED loan', async () => {
    const loan = loanFixture({ status: 'DEFAULTED' });
    expect(await divertIncomeToLoans(mockPrisma, MEMBER, 400n, 'economy')).toBe(
      100n,
    );
    expect(loan.amount_repaid).toBe(100n);
  });

  it('manual repayment is limited to gold on hand and the remaining balance', async () => {
    const loan = loanFixture();
    const result = await AllianceLoanService.repay({
      allianceId: ALLIANCE_ID,
      userId: MEMBER,
      amount: 400n,
    });
    expect(result.remaining).toBe(700n);
    expect(userRows[MEMBER].gold).toBe(4_600n);
    expect(loan.amount_repaid).toBe(400n);

    expect(
      await reason(
        AllianceLoanService.repay({
          allianceId: ALLIANCE_ID,
          userId: MEMBER_2,
          amount: 5n,
        }),
      ),
    ).toBe('You have no loan to repay');

    userRows[MEMBER].gold = 100n;
    expect(
      await reason(
        AllianceLoanService.repay({
          allianceId: ALLIANCE_ID,
          userId: MEMBER,
          amount: 200n,
        }),
      ),
    ).toBe('Insufficient gold');

    userRows[MEMBER].gold = 5_000n;
    await AllianceLoanService.repay({
      allianceId: ALLIANCE_ID,
      userId: MEMBER,
      amount: 99_999n, // clamps to the 700 left
    });
    expect(loan.status).toBe('REPAID');
    expect(userRows[MEMBER].gold).toBe(4_300n);
  });
});

describe('default', () => {
  it('seizes from gold then bank, and repays fully when covered', async () => {
    userRows[MEMBER] = { gold: 300n, gold_in_bank: 5_000n };
    const loan = loanFixture({ due_at: new Date(Date.now() - 1_000) });
    const result = await AllianceLoanService.processOverdueLoans();
    expect(result.collected).toBe(1);
    expect(loan.status).toBe('REPAID');
    expect(userRows[MEMBER]).toEqual({ gold: 0n, gold_in_bank: 4_200n });
    expect(alliance.gold_in_bank).toBe(101_100n);
  });

  it('marks DEFAULTED when not covered, notifies officers, blocks deposits and new loans', async () => {
    userRows[MEMBER] = { gold: 300n, gold_in_bank: 200n };
    const loan = loanFixture({ due_at: new Date(Date.now() - 1_000) });
    const result = await AllianceLoanService.processOverdueLoans();
    expect(result.defaulted).toBe(1);
    expect(loan.status).toBe('DEFAULTED');
    expect(loan.amount_repaid).toBe(500n);
    expect(userRows[MEMBER]).toEqual({ gold: 0n, gold_in_bank: 0n });
    expect(messages).toHaveLength(1);
    expect(messages[0].content).toContain('defaulted on a treasury loan');

    userRows[MEMBER].gold = 1_000n;
    expect(await reason(depositGold(MEMBER, 100n))).toContain(
      'defaulted alliance loan',
    );
    expect(userRows[MEMBER].gold_in_bank).toBe(0n);
    expect(
      await reason(
        AllianceLoanService.request({
          allianceId: ALLIANCE_ID,
          userId: MEMBER,
          amount: 100n,
        }),
      ),
    ).toBe('Repay your defaulted loan before borrowing again');

    // A later run keeps seizing, without notifying again.
    userRows[MEMBER].gold = 100n;
    await AllianceLoanService.processOverdueLoans();
    expect(loan.amount_repaid).toBe(600n);
    expect(messages).toHaveLength(1);

    // Paying it off lifts the restrictions.
    userRows[MEMBER].gold = 5_000n;
    await AllianceLoanService.repay({
      allianceId: ALLIANCE_ID,
      userId: MEMBER,
      amount: 10_000n,
    });
    expect(loan.status).toBe('REPAID');
    expect(
      await reason(
        AllianceLoanService.request({
          allianceId: ALLIANCE_ID,
          userId: MEMBER,
          amount: 100n,
        }),
      ),
    ).toBeNull();
  });

  it('ignores loans that are not yet due', async () => {
    loanFixture();
    expect(await AllianceLoanService.processOverdueLoans()).toEqual({
      checked: 0,
      collected: 0,
      defaulted: 0,
    });
  });
});

describe('leaving and being kicked with a loan', () => {
  it('collects from gold then bank on leave', async () => {
    userRows[MEMBER] = { gold: 300n, gold_in_bank: 2_000n };
    const loan = loanFixture();
    await AllianceService.leaveAlliance(MEMBER, { allianceId: ALLIANCE_ID });
    expect(loan.status).toBe('REPAID');
    expect(userRows[MEMBER]).toEqual({ gold: 0n, gold_in_bank: 1_200n });
    expect(memberIds).not.toContain(MEMBER);
  });

  it('refuses a voluntary leave that cannot be covered and rolls back', async () => {
    userRows[MEMBER] = { gold: 300n, gold_in_bank: 200n };
    const loan = loanFixture();
    expect(
      await reason(
        AllianceService.leaveAlliance(MEMBER, { allianceId: ALLIANCE_ID }),
      ),
    ).toBe('Repay your loan before leaving');
    expect(memberIds).toContain(MEMBER);
    expect(userRows[MEMBER]).toEqual({ gold: 300n, gold_in_bank: 200n });
    expect(loan.amount_repaid).toBe(0n);
    expect(loan.status).toBe('ACTIVE');
  });

  it('a kick succeeds and writes off the uncovered remainder', async () => {
    userRows[MEMBER] = { gold: 300n, gold_in_bank: 200n };
    const loan = loanFixture();
    await AllianceService.kickMember(ALLIANCE_ID, LEADER, {
      allianceId: ALLIANCE_ID,
      memberId: MEMBER,
    });
    expect(memberIds).not.toContain(MEMBER);
    expect(loan.status).toBe('WRITTEN_OFF');
    expect(loan.amount_repaid).toBe(500n);
    expect(userRows[MEMBER]).toEqual({ gold: 0n, gold_in_bank: 0n });
  });
});

describe('disbanding', () => {
  it('splits the treasury evenly with the remainder to the leader and writes off loans', async () => {
    alliance.gold_in_bank = 1_003n; // 5 members -> 200 each, 3 left over
    const open = loanFixture({ status: 'ACTIVE' });
    const defaulted = loanFixture({
      status: 'DEFAULTED',
      borrower_id: MEMBER_2,
    });
    const before = JSON.parse(
      JSON.stringify(userRows, (_k, v) =>
        typeof v === 'bigint' ? `${v}n` : v,
      ),
    );
    const gold = (id: number) => BigInt(before[id].gold.slice(0, -1));
    await AllianceService.deleteAlliance(ALLIANCE_ID, LEADER, 'Synthetic Pact');
    expect(userRows[LEADER].gold).toBe(gold(LEADER) + 203n);
    expect(userRows[BANKER].gold).toBe(gold(BANKER) + 200n);
    expect(userRows[MEMBER].gold).toBe(gold(MEMBER) + 200n);
    expect(alliance.gold_in_bank).toBe(0n);
    expect(history).toHaveLength(5);
    expect(open.status).toBe('WRITTEN_OFF');
    expect(defaulted.status).toBe('WRITTEN_OFF');
    expect(allianceDeleted).toBe(true);
  });
});

describe('treasury settings', () => {
  const update = (actorId: number, data: any) =>
    AllianceLoanService.updateTreasurySettings(ALLIANCE_ID, actorId, data);

  it('lets only the leader change them', async () => {
    expect(await reason(update(BANKER, { loan_term_days: 3 }))).toBe(
      'Alliance not found or you are not the leader',
    );
    await update(LEADER, {
      loan_term_days: 14,
      loan_interest_pct: 0,
      member_daily_cap: 100_000n,
    });
    expect(alliance.loan_term_days).toBe(14);
    expect(alliance.loan_interest_pct).toBe(0);
    expect(alliance.member_daily_cap).toBe(100_000n);
  });

  it('validates ranges', async () => {
    for (const bad of [
      { loan_term_days: 0 },
      { loan_term_days: 15 },
      { loan_interest_pct: -1 },
      { loan_interest_pct: 26 },
      { member_daily_cap: 99_999n },
      { member_daily_cap: 50_000_001n },
      {},
    ]) {
      await expect(update(LEADER, bad)).rejects.toThrow();
    }
    expect(alliance.loan_term_days).toBe(7);
  });
});
