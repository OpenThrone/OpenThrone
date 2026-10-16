import { beforeEach, describe, expect, test, vi } from 'bun:test';
import {
  installMockPrisma,
  mockPrisma,
  resetMockPrisma,
} from 'test/utils/mockPrisma';
import { silenceLogger } from 'test/utils/silenceLogger';

import UserModel from '@/models/Users';
import { V5_COMBAT_CONSTANTS } from '@/utils/balance/v5Combat';
import { calculateOverallRank } from '@/utils/utilities';

installMockPrisma(vi);
silenceLogger();

// Dynamic import so the Prisma mock is installed before the service loads.
const { CronJobService, CRON_USER_TX_OPTIONS, computeWoundedHealing } =
  await import('../CronJob.service');
const { invalidateRuntimeConfigCache } =
  await import('../RuntimeConfig.service');

type Row = Record<string, any>;

/** In-memory users table; each row carries its relations like a Prisma include. */
let store: Map<number, Row>;
let history: Row[];
let txLog: Array<{ locks: number[]; options: unknown }>;
let currentTx: { locks: number[]; options: unknown } | null;
/** Runs right after a user row is locked: simulates a player action that
 *  committed between the cron's initial snapshot and its per-user write. */
let onLock: ((userId: number) => void) | null;
const INITIAL_ERA_START = new Date('2026-01-01T00:00:00.000Z');
const INITIAL_LAST_ACTIVE = new Date('2026-01-02T00:00:00.000Z');
let activeEra: { id: number; startDate: Date; endDate: null };

const clone = <T>(value: T): T => structuredClone(value);

const makeRow = (overrides: Row): Row => ({
  id: 1,
  display_name: 'User',
  race: 'HUMAN',
  class: 'FIGHTER',
  experience: 0,
  gold: 25_000n,
  gold_in_bank: 0n,
  fort_level: 1,
  fort_hitpoints: 50,
  house_level: 0,
  economy_level: 0,
  attack_turns: 50,
  stamina: 100,
  maxStamina: 100,
  wounded_units: [],
  rank: 0,
  stats: [],
  achievements: {},
  avatar: 'SHIELD',
  locale: 'en-US',
  currentEraId: 1,
  last_active: INITIAL_LAST_ACTIVE,
  permissions: [],
  UserUnit: [],
  UserItem: [],
  UserStructureUpgrade: [],
  UserBattleUpgrade: [],
  UserBonusPoints: [],
  ...overrides,
});

const unit = (type: string, quantity: number, level = 1) => ({
  type,
  level,
  quantity,
  isMercenary: false,
});

/** Representative players: economy + fortification income, stamina below and
 *  at the cap, armed units for offense/defense recalcs, higher house level. */
const representativeRows = (): Row[] => [
  makeRow({
    id: 3,
    experience: 1200,
    fort_level: 3,
    house_level: 2,
    economy_level: 2,
    gold: 10_000n,
    attack_turns: 7,
    stamina: 40,
    UserUnit: [
      unit('WORKER', 250),
      unit('CITIZEN', 80),
      unit('OFFENSE', 120),
      unit('DEFENSE', 90),
    ],
    UserItem: [
      { type: 'WEAPON', level: 1, unitType: 'OFFENSE', quantity: 60 },
      { type: 'WEAPON', level: 1, unitType: 'DEFENSE', quantity: 40 },
    ],
  }),
  makeRow({
    id: 1,
    experience: 50,
    fort_level: 1,
    house_level: 0,
    gold: 0n,
    attack_turns: 0,
    stamina: 100,
    maxStamina: 100,
    UserUnit: [unit('WORKER', 10), unit('CITIZEN', 5)],
  }),
  makeRow({
    id: 2,
    experience: 5000,
    fort_level: 5,
    house_level: 1,
    economy_level: 1,
    gold: 123_456_789n,
    attack_turns: 300,
    stamina: 99,
    maxStamina: 100,
    UserUnit: [unit('WORKER', 1000), unit('SPY', 20), unit('SENTRY', 30)],
  }),
];

const applyData = (row: Row, data: Row) => {
  for (const [key, value] of Object.entries(data)) {
    if (value && typeof value === 'object' && 'increment' in value) {
      row[key] =
        typeof row[key] === 'bigint'
          ? row[key] + BigInt(value.increment)
          : Number(row[key]) + Number(value.increment);
    } else {
      row[key] = value;
    }
  }
};

beforeEach(() => {
  resetMockPrisma();
  store = new Map();
  history = [];
  txLog = [];
  currentTx = null;
  onLock = null;
  activeEra = {
    id: 1,
    startDate: new Date(INITIAL_ERA_START),
    endDate: null,
  };
  invalidateRuntimeConfigCache();

  mockPrisma.$transaction = vi.fn(
    async (callback: (tx: typeof mockPrisma) => Promise<unknown>, options) => {
      currentTx = { locks: [], options };
      txLog.push(currentTx);
      try {
        return await callback(mockPrisma);
      } finally {
        currentTx = null;
      }
    },
  );
  mockPrisma.$queryRaw = vi.fn(
    async (strings: TemplateStringsArray, ...values: number[]) => {
      expect(strings.join('?')).toBe(
        'SELECT id FROM users WHERE id = ? FOR UPDATE',
      );
      expect(currentTx).not.toBeNull();
      currentTx!.locks.push(values[0]);
      onLock?.(values[0]);
      return [];
    },
  );
  mockPrisma.users = {
    findMany: vi.fn(async () => [...store.values()].map(clone)),
    findUnique: vi.fn(async ({ where }: { where: { id: number } }) => {
      const row = store.get(where.id);
      return row ? clone(row) : null;
    }),
    update: vi.fn(
      async ({ where, data }: { where: { id: number }; data: Row }) => {
        const row = store.get(where.id);
        if (!row) throw new Error('not found');
        applyData(row, data);
        return clone(row);
      },
    ),
  };
  mockPrisma.era = {
    findFirst: vi.fn(async () => clone(activeEra)),
  };
  mockPrisma.serverSetting = {
    findMany: vi
      .fn()
      .mockResolvedValue([{ key: 'DISABLE_LOGIN', value: false }]),
  };
  mockPrisma.featureFlag = {
    findMany: vi.fn().mockResolvedValue([]),
  };
  mockPrisma.userUnit = {
    upsert: vi.fn(async ({ where, update, create }: Row) => {
      const key = where.userId_type_level_isMercenary;
      const row = store.get(key.userId)!;
      const existing = row.UserUnit.find(
        (u: Row) =>
          u.type === key.type &&
          u.level === key.level &&
          u.isMercenary === key.isMercenary,
      );
      if (existing) existing.quantity += update.quantity.increment;
      else row.UserUnit.push({ ...create });
    }),
  };
  mockPrisma.bank_history = {
    create: vi.fn(async ({ data }: { data: Row }) => {
      history.push(data);
      return data;
    }),
  };
  for (const model of ['attack_log', 'recruit_history']) {
    mockPrisma[model] = { deleteMany: vi.fn(async () => ({})) };
  }
  mockPrisma.bank_history.deleteMany = vi.fn(async () => ({}));
});

/**
 * Reference copy of the pre-change turn math: ranks from the full snapshot
 * (the old code passed the include-loaded row to calculateOverallRank), then
 * absolute writes computed from new UserModel(row).
 */
const legacyTurnTick = (rows: Row[]) => {
  const ranked = rows
    .map((row) => ({ row, score: calculateOverallRank(row) }))
    .sort((a, b) => b.score - a.score);
  return new Map(
    ranked.map(({ row }, index) => {
      const m = new UserModel(row as any);
      const updatedGold = BigInt(m.goldPerTurn.toString()) + BigInt(m.gold);
      return [
        row.id,
        {
          user: {
            gold: updatedGold,
            attack_turns: m.attackTurns + 1,
            stamina: Math.min(m.maxStamina, m.stamina + 1),
            rank: index + 1,
            offense: m.offense,
            defense: m.defense,
            spy: m.spy,
            sentry: m.sentry,
          },
          history: {
            gold_amount: m.goldPerTurn,
            stats: {
              currentGold: m.gold,
              newGold: updatedGold.toString(),
              increase: m.goldPerTurn,
            },
          },
        },
      ];
    }),
  );
};

const seed = (rows: Row[]) => {
  for (const row of rows) store.set(row.id, clone(row));
};

const simulateEraResetFor = (userId: number) => {
  const newEraStart = new Date('2026-02-01T00:00:00.000Z');
  activeEra = { id: 2, startDate: newEraStart, endDate: null };
  const row = store.get(userId)!;
  Object.assign(row, {
    currentEraId: 2,
    last_active: newEraStart,
    gold: 500n,
    gold_in_bank: 0n,
    attack_turns: 0,
    stamina: 0,
    rank: 0,
    wounded_units: [],
    recruit_bonus: 0,
  });
  row.UserUnit = [unit('CITIZEN', 25)];
};

describe('turn cron', () => {
  test('a single tick matches the pre-change game math for representative users', async () => {
    const rows = representativeRows();
    seed(rows);
    const expected = legacyTurnTick(rows);

    const result = await CronJobService.processTurnUpdates();

    expect(result).toMatchObject({ success: true, processed: 3, failed: 0 });
    for (const row of rows) {
      const want = expected.get(row.id)!;
      const got = store.get(row.id)!;
      expect({
        gold: got.gold,
        attack_turns: got.attack_turns,
        stamina: got.stamina,
        rank: got.rank,
        offense: got.offense,
        defense: got.defense,
        spy: got.spy,
        sentry: got.sentry,
      }).toEqual(want.user);
      const entry = history.find((h) => h.to_user_id === row.id)!;
      expect(entry).toMatchObject({
        from_user_id: 0,
        to_user_account_type: 'HAND',
        from_user_account_type: 'BANK',
        history_type: 'ECONOMY',
        ...want.history,
      });
    }
    // Sanity: the fixture exercises real income, the stamina cap and stats.
    expect(store.get(3)!.gold).toBeGreaterThan(10_000n);
    expect(store.get(1)!.stamina).toBe(100);
    expect(store.get(3)!.offense).toBeGreaterThan(0);
    expect(store.get(2)!.rank).toBe(1);
  });

  test('every per-user write locks exactly that one user row with a bounded transaction', async () => {
    seed(representativeRows());

    await CronJobService.processTurnUpdates();

    expect(txLog).toHaveLength(3);
    for (const tx of txLog) {
      expect(tx.locks).toHaveLength(1);
      expect(tx.options).toEqual(CRON_USER_TX_OPTIONS);
    }
    expect(txLog.map((tx) => tx.locks[0]).sort()).toEqual([1, 2, 3]);
  });

  test('gold, turns and units changed after the initial read are preserved', async () => {
    const rows = representativeRows();
    seed(rows);
    // Player 3 deposits 9_000 gold, spends 5 turns and trains 100 workers
    // after the cron's snapshot but before its write for that user.
    onLock = (userId) => {
      if (userId !== 3) return;
      const row = store.get(3)!;
      row.gold -= 9_000n;
      row.gold_in_bank += 9_000n;
      row.attack_turns -= 5;
      row.stamina -= 10;
      row.UserUnit.find((u: Row) => u.type === 'WORKER').quantity += 100;
    };

    await CronJobService.processTurnUpdates();

    const after = store.get(3)!;
    const committed = clone(rows.find((r) => r.id === 3)!);
    committed.gold -= 9_000n;
    committed.gold_in_bank = 9_000n;
    committed.attack_turns -= 5;
    committed.stamina -= 10;
    committed.UserUnit.find((u: Row) => u.type === 'WORKER').quantity += 100;
    const income = new UserModel(committed as any).goldPerTurn;

    expect(after.gold).toBe(1_000n + income);
    expect(after.gold_in_bank).toBe(9_000n);
    expect(after.attack_turns).toBe(7 - 5 + 1);
    expect(after.stamina).toBe(40 - 10 + 1);
    const entry = history.find((h) => h.to_user_id === 3)!;
    expect(entry.stats.currentGold).toBe(1_000n);
    // The pre-change cron would have written the stale 10_000 + income.
    expect(after.gold).not.toBe(10_000n + income);
  });

  test('gold is applied as a relative increment, not an absolute value', async () => {
    seed(representativeRows());

    await CronJobService.processTurnUpdates();

    for (const call of mockPrisma.users.update.mock.calls) {
      expect(call[0].data.gold).toHaveProperty('increment');
      expect(call[0].data.attack_turns).toEqual({ increment: 1 });
    }
  });

  test('a user deleted after the snapshot is skipped without writes', async () => {
    seed(representativeRows());
    onLock = (userId) => {
      if (userId === 2) store.delete(2);
    };

    const result = await CronJobService.processTurnUpdates();

    expect(result.failed).toBe(0);
    expect(history.some((h) => h.to_user_id === 2)).toBe(false);
  });

  test('skips queued turn work when a new era starts after the initial snapshot', async () => {
    seed([representativeRows()[0]]);
    onLock = (userId) => {
      if (userId === 3) simulateEraResetFor(userId);
    };

    const result = await CronJobService.processTurnUpdates();

    expect(result).toMatchObject({ processed: 0, failed: 0 });
    expect(history).toEqual([]);
    expect(mockPrisma.users.update).not.toHaveBeenCalled();
    expect(store.get(3)).toMatchObject({
      currentEraId: 2,
      gold: 500n,
      attack_turns: 0,
      rank: 0,
    });
  });
});

describe('daily cron', () => {
  test('healing math is unchanged', () => {
    const rate = V5_COMBAT_CONSTANTS.WOUNDED_HEAL_RATE_DAILY;
    const { healedUnits, remaining } = computeWoundedHealing([
      { type: 'OFFENSE', level: 2, quantity: 100, woundedAt: 'x' },
      { type: 'DEFENSE', level: 1, quantity: 1 },
      { type: 'SPY', level: 1, quantity: 0 },
      { type: 'SENTRY', level: 1, quantity: 7.9, isMercenary: true },
    ]);
    const heal = (q: number) => Math.min(q, Math.max(1, Math.floor(q * rate)));

    expect(healedUnits).toEqual([
      { type: 'OFFENSE', level: 2, isMercenary: false, healed: heal(100) },
      { type: 'DEFENSE', level: 1, isMercenary: false, healed: 1 },
      { type: 'SENTRY', level: 1, isMercenary: true, healed: heal(7) },
    ]);
    expect(remaining).toEqual([
      {
        type: 'OFFENSE',
        level: 2,
        quantity: 100 - heal(100),
        woundedAt: 'x',
      },
      {
        type: 'SENTRY',
        level: 1,
        quantity: 7 - heal(7),
        isMercenary: true,
      },
    ]);
  });

  test('recruiting bonus and history match the pre-change math', async () => {
    const rows = representativeRows();
    seed(rows);

    const result = await CronJobService.processDailyUpdates();

    expect(result).toMatchObject({ success: true, processed: 3, failed: 0 });
    for (const row of rows) {
      const m = new UserModel(row as any);
      const bonus = Number(m.recruitBonus ?? 0) || 0;
      const citizens = (r: Row) =>
        r.UserUnit.filter((u: Row) => u.type === 'CITIZEN').reduce(
          (sum: number, u: Row) => sum + u.quantity,
          0,
        );
      expect(citizens(store.get(row.id)!)).toBe(citizens(row) + bonus);
      expect(history.find((h) => h.to_user_id === row.id)).toMatchObject({
        history_type: 'DAILY_RECRUIT',
        gold_amount: 0,
        stats: {
          currentCitizens: Number(m.citizens ?? 0),
          newCitizens: Number(m.citizens ?? 0) + bonus,
          recruitingBonus: m.recruitBonus,
        },
      });
    }
    expect(
      store.get(3)!.UserUnit.find((u: Row) => u.type === 'CITIZEN').quantity,
    ).toBeGreaterThan(80);
  });

  test('the admin daily citizen bonus goes only to accounts with recent gameplay activity', async () => {
    const rows = representativeRows();
    // Row 3 acted an hour ago, row 1 two days ago, row 2 never.
    rows[0].last_gameplay_at = new Date(Date.now() - 60 * 60 * 1000);
    rows[1].last_gameplay_at = new Date(Date.now() - 48 * 60 * 60 * 1000);
    rows[2].last_gameplay_at = null;
    seed(rows);
    mockPrisma.serverSetting.findMany.mockResolvedValue([
      { key: 'DISABLE_LOGIN', value: false },
      { key: 'era.dailyCitizenBonus', value: 100 },
    ]);
    invalidateRuntimeConfigCache();

    const result = await CronJobService.processDailyUpdates();

    expect(result).toMatchObject({ success: true, processed: 3, failed: 0 });
    for (const row of rows) {
      const m = new UserModel(row as any);
      const bonus = Number(m.recruitBonus ?? 0) || 0;
      const citizens = (r: Row) =>
        r.UserUnit.filter((u: Row) => u.type === 'CITIZEN').reduce(
          (sum: number, u: Row) => sum + u.quantity,
          0,
        );
      const applied = row.id === 3 ? 100 : 0;
      expect(citizens(store.get(row.id)!)).toBe(
        citizens(row) + bonus + applied,
      );
      expect(history.find((h) => h.to_user_id === row.id)).toMatchObject({
        history_type: 'DAILY_RECRUIT',
        stats: {
          newCitizens: Number(m.citizens ?? 0) + bonus + applied,
          recruitingBonus: m.recruitBonus,
          dailyCitizenBonus: applied,
        },
      });
    }
  });

  test('an activity window of 0 hours grants the bonus to every era participant', async () => {
    const rows = representativeRows();
    seed(rows);
    mockPrisma.serverSetting.findMany.mockResolvedValue([
      { key: 'DISABLE_LOGIN', value: false },
      { key: 'era.dailyCitizenBonus', value: 100 },
      { key: 'era.dailyCitizenBonusActivityHours', value: 0 },
    ]);
    invalidateRuntimeConfigCache();

    await CronJobService.processDailyUpdates();

    for (const row of rows) {
      expect(history.find((h) => h.to_user_id === row.id)).toMatchObject({
        stats: { dailyCitizenBonus: 100 },
      });
    }
  });

  test('units wounded after the initial read are kept, and healing runs once', async () => {
    seed([
      makeRow({
        id: 5,
        UserUnit: [unit('OFFENSE', 10)],
        wounded_units: [{ type: 'OFFENSE', level: 1, quantity: 20 }],
      }),
    ]);
    let attacked = false;
    onLock = (userId) => {
      if (userId !== 5 || attacked) return;
      attacked = true;
      // An attack commits 30 more wounded OFFENSE and 4 wounded DEFENSE.
      store.get(5)!.wounded_units = [
        { type: 'OFFENSE', level: 1, quantity: 50 },
        { type: 'DEFENSE', level: 1, quantity: 4 },
      ];
    };

    await CronJobService.processDailyUpdates();

    const rate = V5_COMBAT_CONSTANTS.WOUNDED_HEAL_RATE_DAILY;
    const healedOffense = Math.max(1, Math.floor(50 * rate));
    const healedDefense = Math.max(1, Math.floor(4 * rate));
    const row = store.get(5)!;
    expect(row.wounded_units).toEqual([
      { type: 'OFFENSE', level: 1, quantity: 50 - healedOffense },
      { type: 'DEFENSE', level: 1, quantity: 4 - healedDefense },
    ]);
    expect(row.UserUnit.find((u: Row) => u.type === 'OFFENSE').quantity).toBe(
      10 + healedOffense,
    );
    expect(row.UserUnit.find((u: Row) => u.type === 'DEFENSE').quantity).toBe(
      healedDefense,
    );
    for (const tx of txLog) {
      expect(tx.locks).toEqual([5]);
      expect(tx.options).toEqual(CRON_USER_TX_OPTIONS);
    }
  });

  test('skips queued recruit and healing writes when a new era starts after the snapshot', async () => {
    seed([
      makeRow({
        id: 5,
        recruit_bonus: 12,
        UserUnit: [unit('CITIZEN', 40)],
        wounded_units: [{ type: 'OFFENSE', level: 1, quantity: 20 }],
      }),
    ]);
    onLock = (userId) => {
      if (userId === 5) simulateEraResetFor(userId);
    };

    const result = await CronJobService.processDailyUpdates();

    expect(result).toMatchObject({ processed: 0, failed: 0 });
    expect(history).toEqual([]);
    expect(mockPrisma.userUnit.upsert).not.toHaveBeenCalled();
    expect(mockPrisma.users.update).not.toHaveBeenCalled();
    expect(store.get(5)).toMatchObject({
      currentEraId: 2,
      gold: 500n,
      attack_turns: 0,
      rank: 0,
      wounded_units: [],
      recruit_bonus: 0,
      UserUnit: [unit('CITIZEN', 25)],
    });
  });
});
