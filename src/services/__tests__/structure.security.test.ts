import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';

import prisma from '@/lib/prisma';
import { StructureService } from '@/services/Structure.service';

// Restore the shared prisma mock after each test so other suites keep their own $transaction
const originalTransaction = (prisma as any).$transaction;

afterEach(() => {
  (prisma as any).$transaction = originalTransaction;
});

type UpgradeType =
  | 'fortifications'
  | 'houses'
  | 'economy'
  | 'offense'
  | 'armory'
  | 'spy';

type FakeDb = {
  gold: bigint;
  experience: number;
  fort_level: number;
  house_level: number;
  economy_level: number;
  structure: Array<{ type: string; level: number }>;
};

let db: FakeDb;
let calls: string[];
let tx: any;

const freshDb = (overrides: Partial<FakeDb> = {}): FakeDb => ({
  gold: 1_000_000_000n,
  experience: 0,
  fort_level: 1,
  house_level: 0,
  economy_level: 0,
  structure: [],
  ...overrides,
});

const buildUser = () => ({
  id: 7,
  gold: db.gold,
  experience: db.experience,
  fort_level: db.fort_level,
  house_level: db.house_level,
  economy_level: db.economy_level,
  mercenaries: [],
  UserUnit: [],
  UserItem: [],
  UserStructureUpgrade: db.structure.map((s) => ({ ...s, userId: 7 })),
  UserBattleUpgrade: [],
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
    userStructureUpgrade: {
      upsert: mock(async () => ({})),
    },
    bank_history: { create: mock(async () => ({})) },
  };
  (prisma as any).$transaction = mock(async (cb: any) => cb(tx));
});

// Buying index 1 of each track: the UI gate and cost for each track (src/constants/*)
const cases: Array<{
  upgradeType: UpgradeType;
  gateLabel: string;
  requiredFort: number;
  cost: bigint;
}> = [
  // Fortification index 1 (Village): needs player level 5 and fort level 1 (current)
  {
    upgradeType: 'fortifications',
    gateLabel: 'player level 5',
    requiredFort: 1,
    cost: 100_000n,
  },
  // Housing index 1: fortLevel 2
  {
    upgradeType: 'houses',
    gateLabel: 'fort level 2',
    requiredFort: 2,
    cost: 500_000n,
  },
  // Economy index 1: fortLevel 3
  {
    upgradeType: 'economy',
    gateLabel: 'fort level 3',
    requiredFort: 3,
    cost: 500_000n,
  },
  // Offense index 1: fortLevelRequirement 2
  {
    upgradeType: 'offense',
    gateLabel: 'fort level 2',
    requiredFort: 2,
    cost: 100_000n,
  },
  // Armory index 1: fortLevel 5
  {
    upgradeType: 'armory',
    gateLabel: 'fort level 5',
    requiredFort: 5,
    cost: 500_000n,
  },
  // Spy index 1: fortLevelRequirement 2
  {
    upgradeType: 'spy',
    gateLabel: 'fort level 2',
    requiredFort: 2,
    cost: 50_000n,
  },
];

const defineGateTests = (c: (typeof cases)[number]) => {
  if (c.upgradeType === 'fortifications') {
    it('fortifications: rejects below the player level requirement', async () => {
      db = freshDb({ experience: 0, fort_level: 1 });
      await expect(
        StructureService.upgradeStructure(7, {
          upgradeType: 'fortifications',
          index: 1,
        }),
      ).rejects.toThrow('Cannot purchase level 2. Requires player level 5.');
      expect(db.gold).toBe(1_000_000_000n);
      expect(calls).not.toContain('update');
    });

    it('fortifications: accepts at the player level requirement', async () => {
      db = freshDb({ experience: 1_000_000_000, fort_level: 1 });
      const result = await StructureService.upgradeStructure(7, {
        upgradeType: 'fortifications',
        index: 1,
      });
      expect(result.data.newLevel).toBe(2);
      expect(db.gold).toBe(1_000_000_000n - c.cost);
    });
    return;
  }

  it(`${c.upgradeType}: rejects below the ${c.gateLabel} gate`, async () => {
    db = freshDb({ fort_level: c.requiredFort - 1, experience: 1_000_000_000 });
    await expect(
      StructureService.upgradeStructure(7, {
        upgradeType: c.upgradeType,
        index: 1,
      }),
    ).rejects.toThrow(/Requires fort level \d+/);
    expect(db.gold).toBe(1_000_000_000n);
    expect(calls).not.toContain('update');
  });

  it(`${c.upgradeType}: accepts at the ${c.gateLabel} gate and charges gold`, async () => {
    db = freshDb({ fort_level: c.requiredFort, experience: 1_000_000_000 });
    const result = await StructureService.upgradeStructure(7, {
      upgradeType: c.upgradeType,
      index: 1,
    });
    expect(result.data.upgradeType).toBe(c.upgradeType);
    expect(db.gold).toBe(1_000_000_000n - c.cost);
  });
};

describe('StructureService.upgradeStructure server-side gates (F-06)', () => {
  cases.forEach(defineGateTests);

  it('still enforces the sequential level order', async () => {
    db = freshDb({ fort_level: 30, experience: 1_000_000_000 });
    // Level 3 of a track that is still at level 0 must be bought in order.
    await expect(
      StructureService.upgradeStructure(7, {
        upgradeType: 'offense',
        index: 3,
      }),
    ).rejects.toThrow('Cannot purchase level');
    expect(db.gold).toBe(1_000_000_000n);
    expect(calls).not.toContain('update');
  });

  it('still rejects a purchase the player cannot afford', async () => {
    db = freshDb({ fort_level: 30, experience: 1_000_000_000, gold: 1n });
    await expect(
      StructureService.upgradeStructure(7, {
        upgradeType: 'offense',
        index: 1,
      }),
    ).rejects.toThrow('Not enough gold');
    expect(db.gold).toBe(1n);
    expect(calls).not.toContain('update');
  });

  it('locks the user row before reading gold', async () => {
    db = freshDb({ fort_level: 2, experience: 1_000_000_000 });
    await StructureService.upgradeStructure(7, {
      upgradeType: 'offense',
      index: 1,
    });
    expect(calls[0]).toBe('lock');
    expect(calls.indexOf('lock')).toBeLessThan(calls.indexOf('read'));
  });
});
