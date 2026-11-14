import { beforeEach, describe, expect, test, vi } from 'bun:test';
import { installMockPrisma, mockPrisma } from 'test/utils/mockPrisma';

installMockPrisma(vi);
// Dynamic imports deliberately install the Prisma test boundary before service loading.
const {
  buildBankHistoryConditions,
  depositGold,
  getBankHistoryForUser,
  getDepositStatus,
  withdrawGold,
} = await import('../Bank.service');

const USER = { id: 1, gold: 1000n, gold_in_bank: 500n };

beforeEach(() => {
  mockPrisma.$queryRaw = vi.fn(async () => []);
  mockPrisma.$transaction = vi.fn(
    async (callback: (tx: typeof mockPrisma) => Promise<unknown>) =>
      callback(mockPrisma),
  );
  mockPrisma.users = {
    findUnique: vi.fn(async () => ({ ...USER })),
    updateMany: vi.fn(async () => ({ count: 1 })),
  } as any;
  mockPrisma.bank_history = {
    findMany: vi.fn(async () => []),
    findFirst: vi.fn(async () => null),
    create: vi.fn(async () => ({})),
    count: vi.fn(async () => 0),
  } as any;
});

describe('depositGold', () => {
  test('happy path debits hand gold, credits bank, writes history, returns stringified user', async () => {
    const result = await depositGold(1, 100);

    expect(result).toEqual({
      id: 1,
      gold: '1000n',
      gold_in_bank: '500n',
    });
    expect(mockPrisma.users.updateMany).toHaveBeenCalledWith({
      where: { id: 1, gold: { gte: 100n } },
      data: {
        gold: { decrement: 100n },
        gold_in_bank: { increment: 100n },
      },
    });
    expect(mockPrisma.bank_history.create).toHaveBeenCalledWith({
      data: {
        gold_amount: 100n,
        from_user_id: 1,
        from_user_account_type: 'HAND',
        to_user_id: 1,
        to_user_account_type: 'BANK',
        date_time: expect.any(Date),
        history_type: 'PLAYER_TRANSFER',
      },
    });
  });

  test('strips sensitive fields from the returned user', async () => {
    mockPrisma.users.findUnique = vi.fn(async () => ({
      ...USER,
      password_hash: 'x',
      twoFactorSecret: 'y',
    }));
    const result = await depositGold(1, 100);

    expect(result).not.toHaveProperty('password_hash');
    expect(result).not.toHaveProperty('twoFactorSecret');
  });

  test('insufficient hand gold is rejected before any write', async () => {
    mockPrisma.users.findUnique = vi.fn(async () => ({
      ...USER,
      gold: 10n,
    }));

    await expect(depositGold(1, 100)).rejects.toThrow(
      'Not enough gold for deposit',
    );
    expect(mockPrisma.users.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.bank_history.create).not.toHaveBeenCalled();
  });

  test('deposits above 80% of gold on hand are rejected', async () => {
    mockPrisma.users.findUnique = vi.fn(async () => ({
      ...USER,
      gold: 100n,
    }));

    await expect(depositGold(1, 81)).rejects.toThrow(
      'Deposit amount exceeds the maximum allowed (80% of gold on hand).',
    );
    expect(mockPrisma.bank_history.create).not.toHaveBeenCalled();
  });

  test('unparseable and non-positive amounts are rejected as invalid', async () => {
    await expect(depositGold(1, 'abc')).rejects.toThrow(
      'Invalid deposit amount: abc',
    );
    await expect(depositGold(1, 0)).rejects.toThrow(
      'Invalid deposit amount: 0',
    );
    await expect(depositGold(1, -5)).rejects.toThrow(
      'Invalid deposit amount: -5',
    );
  });

  test('the daily deposit count cap is enforced inside the transaction', async () => {
    // economy_level 0 => 3 deposits per day (EconomyUpgrades[0].depositsPerDay).
    mockPrisma.bank_history.findMany = vi.fn(async () => [
      { date_time: new Date() },
      { date_time: new Date() },
      { date_time: new Date() },
    ]);

    await expect(depositGold(1, 100)).rejects.toThrow(
      'Maximum deposits reached',
    );
    expect(mockPrisma.users.updateMany).not.toHaveBeenCalled();
  });

  test('a balance that changed under the conditional update is rejected', async () => {
    mockPrisma.users.updateMany = vi.fn(async () => ({ count: 0 }));

    await expect(depositGold(1, 100)).rejects.toThrow(
      'Your gold balance changed, please try again',
    );
    expect(mockPrisma.bank_history.create).not.toHaveBeenCalled();
  });
});

describe('withdrawGold', () => {
  test('happy path debits bank gold, credits hand, writes history', async () => {
    const result = await withdrawGold(1, 100);

    // withdraw returns the sanitized user without stringifying BigInts;
    // the route applies stringifyObj when shaping the response.
    expect(result).toEqual({ id: 1, gold: 1000n, gold_in_bank: 500n });
    expect(mockPrisma.users.updateMany).toHaveBeenCalledWith({
      where: { id: 1, gold_in_bank: { gte: 100n } },
      data: {
        gold: { increment: 100n },
        gold_in_bank: { decrement: 100n },
      },
    });
    expect(mockPrisma.bank_history.create).toHaveBeenCalledWith({
      data: {
        gold_amount: 100n,
        from_user_id: 1,
        from_user_account_type: 'BANK',
        to_user_id: 1,
        to_user_account_type: 'HAND',
        date_time: expect.any(Date),
        history_type: 'PLAYER_TRANSFER',
      },
    });
  });

  test('withdrawing more than the bank holds is rejected', async () => {
    await expect(withdrawGold(1, 501n)).rejects.toThrow(
      'Not enough gold for withdrawal',
    );
    expect(mockPrisma.users.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.bank_history.create).not.toHaveBeenCalled();
  });

  test('a conditional debit that matched no row is rejected', async () => {
    mockPrisma.users.updateMany = vi.fn(async () => ({ count: 0 }));

    await expect(withdrawGold(1, 100)).rejects.toThrow(
      'Not enough gold for withdrawal',
    );
    expect(mockPrisma.bank_history.create).not.toHaveBeenCalled();
  });

  test('invalid amounts are rejected', async () => {
    await expect(withdrawGold(1, 'abc')).rejects.toThrow(
      'Invalid withdraw amount',
    );
  });
});

describe('getDepositStatus', () => {
  test('reads the deposit window before the user row, then reports remaining deposits', async () => {
    const order: string[] = [];
    mockPrisma.bank_history.findMany = vi.fn(async () => {
      order.push('history');
      return [{ date_time: new Date(Date.now() - 60_000) }];
    });
    mockPrisma.users.findUnique = vi.fn(async () => {
      order.push('user');
      return { ...USER };
    });

    const status = await getDepositStatus(1);

    expect(order).toEqual(['history', 'user']);
    expect(status?.deposits).toBe(2); // 3 per day at economy level 0, 1 used
    expect(status?.nextDepositAvailable).toEqual(
      expect.objectContaining({ hours: 23 }),
    );
  });

  test('no history in the window leaves all deposits and a zero countdown', async () => {
    const status = await getDepositStatus(1);

    expect(status).toEqual({ deposits: 3, nextDepositAvailable: 0 });
  });

  test('a missing user row resolves to null (route answers 404)', async () => {
    mockPrisma.users.findUnique = vi.fn(async () => null);

    expect(await getDepositStatus(1)).toBeNull();
  });
});

describe('getBankHistoryForUser', () => {
  test('returns the page rows, total and pagination echo, bounded to the era', async () => {
    const row = {
      id: 1,
      gold_amount: 100n,
      date_time: new Date('2026-10-01T12:00:00Z'),
      history_type: 'PLAYER_TRANSFER',
    };
    mockPrisma.bank_history.count = vi.fn(async () => 25);
    mockPrisma.bank_history.findMany = vi.fn(async () => [row]);

    const result = await getBankHistoryForUser(1, { page: 0, limit: 10 });

    expect(result.total).toBe(25);
    expect(result.rows).toEqual([row]);
    expect(result.page).toBe(0);
    expect(result.limit).toBe(10);
    const eraStartDate = new Date('2026-01-01T00:00:00Z'); // installMockPrisma era
    expect(mockPrisma.bank_history.findMany).toHaveBeenCalledWith({
      where: {
        AND: [
          { OR: [{ from_user_id: 1 }, { to_user_id: 1 }] },
          { date_time: { gte: eraStartDate } },
        ],
      },
      take: 10,
      skip: 0,
      orderBy: { date_time: 'desc' },
    });
  });

  test('the deposits filter narrows the query to own HAND->BANK transfers', async () => {
    await getBankHistoryForUser(1, { deposits: 'true', page: 0, limit: 10 });

    expect(mockPrisma.bank_history.count).toHaveBeenCalledWith({
      where: {
        AND: [
          {
            OR: [
              {
                from_user_account_type: 'HAND',
                to_user_id: 1,
                to_user_account_type: 'BANK',
                from_user_id: 1,
                history_type: 'PLAYER_TRANSFER',
              },
            ],
          },
          { OR: [{ from_user_id: 1 }, { to_user_id: 1 }] },
          { date_time: { gte: new Date('2026-01-01T00:00:00Z') } },
        ],
      },
    });
  });

  test('page is passed as the skip offset, matching the legacy route', async () => {
    await getBankHistoryForUser(1, { page: 2, limit: 5 });

    expect(mockPrisma.bank_history.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 5, skip: 2 }),
    );
  });
});

describe('buildBankHistoryConditions', () => {
  test('no flags still scopes to the users own rows', () => {
    expect(buildBankHistoryConditions(7, {})).toEqual([
      { OR: [{ from_user_id: 7 }, { to_user_id: 7 }] },
    ]);
  });

  test('the transfers flag excludes self-transfers', () => {
    const [filters] = buildBankHistoryConditions(7, { transfers: 'true' });
    expect(filters).toEqual({
      OR: [
        {
          history_type: 'PLAYER_TRANSFER',
          AND: [
            { OR: [{ from_user_id: 7 }, { to_user_id: 7 }] },
            { NOT: [{ from_user_id: 7, to_user_id: 7 }] },
          ],
        },
      ],
    });
  });

  test('the sale flag expands to its three stats variants', () => {
    const [filters] = buildBankHistoryConditions(7, { sale: 'true' });
    expect(filters?.OR).toHaveLength(3);
  });

  test('friend_transfers matches both history types on either side', () => {
    const [filters] = buildBankHistoryConditions(7, {
      friend_transfers: 'true',
    });
    expect(filters).toEqual({
      OR: [
        {
          history_type: { in: ['FRIEND_TRANSFER', 'FRIEND_REQUEST'] },
          OR: [{ from_user_id: 7 }, { to_user_id: 7 }],
        },
      ],
    });
  });

  test('non-true flag values are ignored', () => {
    expect(buildBankHistoryConditions(7, { deposits: 'false' })).toEqual([
      { OR: [{ from_user_id: 7 }, { to_user_id: 7 }] },
    ]);
  });
});
