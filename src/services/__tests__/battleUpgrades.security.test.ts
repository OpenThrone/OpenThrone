import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';

import prisma from '@/lib/prisma';
import { BattleService } from '@/services/Battle.service';

// Restore the shared prisma mock after each test so other suites keep their own $transaction
const originalTransaction = (prisma as any).$transaction;

afterEach(() => {
  (prisma as any).$transaction = originalTransaction;
});

type FakeBattleRow = { type: string; level: number; quantity: number };
type FakeDb = {
  gold: bigint;
  experience: number;
  battle: FakeBattleRow[];
  structure: Array<{ type: string; level: number }>;
  units: Array<{ type: string; level: number; quantity: number }>;
};

let db: FakeDb;
let calls: string[];
let tx: any;

const freshDb = (overrides: Partial<FakeDb> = {}): FakeDb => ({
  gold: 1_000_000_000n,
  experience: 1_000_000_000,
  battle: [],
  structure: [{ type: 'OFFENSE', level: 6 }],
  units: [{ type: 'OFFENSE', level: 2, quantity: 10 }],
  ...overrides,
});

const buildUser = () => ({
  id: 7,
  gold: db.gold,
  experience: db.experience,
  fort_level: 30,
  mercenaries: [],
  UserUnit: db.units.map((u) => ({
    ...u,
    id: 0,
    userId: 7,
    isMercenary: false,
  })),
  UserItem: [],
  UserStructureUpgrade: db.structure.map((s) => ({ ...s, userId: 7 })),
  UserBattleUpgrade: db.battle.map((b, i) => ({ ...b, id: i, userId: 7 })),
  UserBonusPoints: [],
  permissions: [],
});

beforeEach(() => {
  db = freshDb();
  calls = [];
  tx = {
    $queryRaw: mock(async () => {
      calls.push('lock');
      return [];
    }),
    users: {
      findUnique: mock(async () => {
        calls.push('read');
        return buildUser();
      }),
      update: mock(async ({ data }: any) => {
        calls.push('update');
        if (data.gold !== undefined) db.gold = BigInt(data.gold);
        return { gold: db.gold };
      }),
    },
    userBattleUpgrade: {
      // Mirrors the @@unique([userId, type, level]) key in prisma/schema.prisma
      upsert: mock(async ({ where, create, update }: any) => {
        calls.push('upsert');
        const key = where.userId_type_level;
        if (!key) throw new Error('upsert must use the userId_type_level key');
        const idx = db.battle.findIndex(
          (b) => b.type === key.type && b.level === key.level,
        );
        if (idx >= 0) {
          db.battle[idx] = { ...db.battle[idx], ...update };
          return db.battle[idx];
        }
        const row = {
          type: create.type,
          level: create.level,
          quantity: create.quantity,
        };
        db.battle.push(row);
        return row;
      }),
    },
    bank_history: { create: mock(async () => ({})) },
  };
  (prisma as any).$transaction = mock(async (cb: any) => cb(tx));
});

// OFFENSE level 1 "Steeds": cost 100000, SiegeUpgradeLevel 6, minUnitLevel 2
const steeds = { type: 'OFFENSE', level: 1, quantity: 3 };

describe('BattleService.manageBattleUpgrades sell rules (F-03)', () => {
  it('rejects selling an item the user does not own and pays nothing', async () => {
    db.battle = [];
    await expect(
      BattleService.manageBattleUpgrades({
        userId: 7,
        operation: 'sell',
        items: [steeds],
      }),
    ).rejects.toThrow('Cannot sell 3 Steeds: only 0 owned.');
    expect(db.gold).toBe(1_000_000_000n);
    expect(calls).not.toContain('upsert');
    expect(db.battle).toEqual([]);
  });

  it('rejects selling more than the owned quantity', async () => {
    db.battle = [{ type: 'OFFENSE', level: 1, quantity: 2 }];
    await expect(
      BattleService.manageBattleUpgrades({
        userId: 7,
        operation: 'sell',
        items: [steeds],
      }),
    ).rejects.toThrow('Cannot sell 3 Steeds: only 2 owned.');
    expect(db.gold).toBe(1_000_000_000n);
  });

  it('sums duplicate sell lines so they cannot exceed the owned quantity', async () => {
    db.battle = [{ type: 'OFFENSE', level: 1, quantity: 5 }];
    await expect(
      BattleService.manageBattleUpgrades({
        userId: 7,
        operation: 'sell',
        items: [steeds, steeds], // 6 requested against 5 owned
      }),
    ).rejects.toThrow('Cannot sell 6 Steeds: only 5 owned.');
    expect(db.gold).toBe(1_000_000_000n);
    expect(db.battle).toEqual([{ type: 'OFFENSE', level: 1, quantity: 5 }]);
  });

  it('selling owned items credits 75% and only reduces the owned row', async () => {
    db.battle = [{ type: 'OFFENSE', level: 1, quantity: 5 }];
    const result = await BattleService.manageBattleUpgrades({
      userId: 7,
      operation: 'sell',
      items: [steeds],
    });
    // floor(100000 * 3 * 0.75) = 225000
    expect(result.totalCost).toBe(225_000);
    expect(db.gold).toBe(1_000_000_000n + 225_000n);
    expect(db.battle).toEqual([{ type: 'OFFENSE', level: 1, quantity: 2 }]);
  });

  it('never inserts an unowned row on sell', async () => {
    db.battle = [{ type: 'DEFENSE', level: 1, quantity: 1 }];
    await expect(
      BattleService.manageBattleUpgrades({
        userId: 7,
        operation: 'sell',
        items: [steeds],
      }),
    ).rejects.toThrow('Cannot sell');
    expect(db.battle).toEqual([{ type: 'DEFENSE', level: 1, quantity: 1 }]);
  });

  it('rejects quantities that are zero, negative or above the maximum', async () => {
    await expect(
      BattleService.manageBattleUpgrades({
        userId: 7,
        operation: 'sell',
        items: [{ ...steeds, quantity: 0 }],
      }),
    ).rejects.toThrow('Quantity must be a positive integer.');
    await expect(
      BattleService.manageBattleUpgrades({
        userId: 7,
        operation: 'buy',
        items: [{ ...steeds, quantity: 10001 }],
      }),
    ).rejects.toThrow('Quantity must be at most 10000.');
  });

  it('locks the user row before reading inventory and gold', async () => {
    db.battle = [{ type: 'OFFENSE', level: 1, quantity: 5 }];
    await BattleService.manageBattleUpgrades({
      userId: 7,
      operation: 'sell',
      items: [steeds],
    });
    expect(calls[0]).toBe('lock');
  });
});

describe('BattleService.manageBattleUpgrades buy unlock gates (F-09)', () => {
  it('rejects buying when the owned structure level is below SiegeUpgradeLevel', async () => {
    db.structure = [{ type: 'OFFENSE', level: 5 }];
    await expect(
      BattleService.manageBattleUpgrades({
        userId: 7,
        operation: 'buy',
        items: [steeds],
      }),
    ).rejects.toThrow(
      'Cannot purchase Steeds: requires OFFENSE structure level 6.',
    );
    expect(db.gold).toBe(1_000_000_000n);
  });

  it('rejects buying when the user owns no units at minUnitLevel', async () => {
    db.units = [{ type: 'OFFENSE', level: 1, quantity: 50 }];
    await expect(
      BattleService.manageBattleUpgrades({
        userId: 7,
        operation: 'buy',
        items: [steeds],
      }),
    ).rejects.toThrow(
      'Cannot purchase Steeds: requires level 2+ OFFENSE units.',
    );
    expect(db.gold).toBe(1_000_000_000n);
  });

  it('rejects buying when the player level is below minUnitLevel', async () => {
    db.experience = 0; // level 1
    await expect(
      BattleService.manageBattleUpgrades({
        userId: 7,
        operation: 'buy',
        items: [steeds],
      }),
    ).rejects.toThrow('Cannot purchase Steeds');
  });

  it('accepts buying at the gates and charges gold', async () => {
    const result = await BattleService.manageBattleUpgrades({
      userId: 7,
      operation: 'buy',
      items: [{ ...steeds, quantity: 2 }],
    });
    expect(result.totalCost).toBe(200_000);
    expect(db.gold).toBe(1_000_000_000n - 200_000n);
    expect(db.battle).toEqual([{ type: 'OFFENSE', level: 1, quantity: 2 }]);
  });

  it('DEFENSE upgrades use the OFFENSE structure level', async () => {
    db.structure = [{ type: 'OFFENSE', level: 6 }];
    db.units = [{ type: 'DEFENSE', level: 2, quantity: 4 }];
    // DEFENSE level 1 requires SiegeUpgradeLevel 6 and minUnitLevel 2 (src/constants/Battle_Upgrades.tsx)
    const result = await BattleService.manageBattleUpgrades({
      userId: 7,
      operation: 'buy',
      items: [{ type: 'DEFENSE', level: 1, quantity: 1 }],
    });
    expect(result.totalCost).toBeGreaterThan(0);
  });
});

describe('BattleService.manageBattleUpgrades keeps one row per level', () => {
  // War Elephant: OFFENSE level 2, cost 5000000 (src/constants/Battle_Upgrades.tsx)
  const warElephant = { type: 'OFFENSE', level: 2, quantity: 1 };

  it('buying a new level keeps the rows of other levels', async () => {
    db.battle = [{ type: 'OFFENSE', level: 1, quantity: 100 }];
    await BattleService.manageBattleUpgrades({
      userId: 7,
      operation: 'buy',
      items: [warElephant],
    });
    expect(db.gold).toBe(1_000_000_000n - 5_000_000n);
    expect(db.battle).toEqual([
      { type: 'OFFENSE', level: 1, quantity: 100 },
      { type: 'OFFENSE', level: 2, quantity: 1 },
    ]);
  });

  it('buys two levels of the same type in one request', async () => {
    await BattleService.manageBattleUpgrades({
      userId: 7,
      operation: 'buy',
      items: [steeds, warElephant],
    });
    expect(db.gold).toBe(1_000_000_000n - 300_000n - 5_000_000n);
    expect(db.battle).toEqual([
      { type: 'OFFENSE', level: 1, quantity: 3 },
      { type: 'OFFENSE', level: 2, quantity: 1 },
    ]);
  });

  it('selling one level leaves the other level untouched', async () => {
    db.battle = [
      { type: 'OFFENSE', level: 1, quantity: 5 },
      { type: 'OFFENSE', level: 2, quantity: 2 },
    ];
    await BattleService.manageBattleUpgrades({
      userId: 7,
      operation: 'sell',
      items: [{ ...warElephant, quantity: 1 }],
    });
    expect(db.battle).toEqual([
      { type: 'OFFENSE', level: 1, quantity: 5 },
      { type: 'OFFENSE', level: 2, quantity: 1 },
    ]);
  });
});
