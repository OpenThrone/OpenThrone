import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';

import prisma from '@/lib/prisma';
import {
  convertUnits,
  trainUnits,
  untrainUnits,
} from '@/services/Training.service';
import { calculateTotalCost } from '@/utils/units';

// Restore the shared prisma mock after each test so other suites keep their own $transaction
const originalTransaction = (prisma as any).$transaction;

afterEach(() => {
  (prisma as any).$transaction = originalTransaction;
});

type FakeUnit = {
  type: string;
  level: number;
  quantity: number;
  isMercenary?: boolean;
};
type FakeDb = {
  gold: bigint;
  fort_level: number;
  units: FakeUnit[];
};

let db: FakeDb;
let calls: string[];
let tx: any;

const buildUser = () => ({
  id: 7,
  gold: db.gold,
  experience: 1_000_000_000, // high enough that priceBonus/level helpers are stable
  fort_level: db.fort_level,
  mercenaries: [],
  UserUnit: db.units.map((u) => ({
    ...u,
    id: 0,
    userId: 7,
    isMercenary: u.isMercenary ?? false,
  })),
  UserItem: [],
  UserStructureUpgrade: [],
  UserBattleUpgrade: [],
  UserBonusPoints: [],
  permissions: [],
});

beforeEach(() => {
  db = {
    gold: 10_000_000n,
    fort_level: 1,
    units: [{ type: 'CITIZEN', level: 1, quantity: 1000 }],
  };
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
    userUnit: {
      deleteMany: mock(async () => {
        db.units = [];
      }),
      create: mock(async ({ data }: any) => {
        db.units.push({
          type: data.type,
          level: data.level,
          quantity: data.quantity,
          isMercenary: data.isMercenary,
        });
      }),
    },
    bank_history: { create: mock(async () => ({})) },
  };
  (prisma as any).$transaction = mock(async (cb: any) => cb(tx));
});

const fakeUModel = { priceBonus: 0 } as any;

describe('TrainingService.trainUnits fort gate (F-07)', () => {
  // OFFENSE level 2 requires fort level 4 (src/constants/Units.tsx)
  it('rejects units whose fort requirement is above the user fort level', async () => {
    db.fort_level = 1;
    await expect(
      trainUnits({
        userId: 7,
        units: [{ type: 'OFFENSE', level: 2, quantity: 5 }],
      }),
    ).rejects.toThrow('Cannot train');
    expect(db.gold).toBe(10_000_000n);
  });

  it('accepts units at the fort requirement and charges gold', async () => {
    db.fort_level = 4;
    const result = await trainUnits({
      userId: 7,
      units: [{ type: 'OFFENSE', level: 2, quantity: 5 }],
    });
    expect(result.totalCost).toBe(50_000);
    expect(db.gold).toBe(10_000_000n - 50_000n);
  });

  it('locks the user row before reading gold and units', async () => {
    db.fort_level = 4;
    await trainUnits({
      userId: 7,
      units: [{ type: 'OFFENSE', level: 2, quantity: 1 }],
    });
    expect(calls[0]).toBe('lock');
    expect(calls.indexOf('lock')).toBeLessThan(calls.indexOf('read'));
  });
});

describe('unknown unit rejection (F-12)', () => {
  it('trainUnits rejects a unit type that is not in UnitTypes', async () => {
    await expect(
      trainUnits({
        userId: 7,
        units: [{ type: 'DRAGON', level: 1, quantity: 1 }],
      }),
    ).rejects.toThrow('Unknown unit DRAGON');
    expect(calls).not.toContain('update');
  });

  it('trainUnits rejects a unit level that is not in UnitTypes', async () => {
    await expect(
      trainUnits({
        userId: 7,
        units: [{ type: 'OFFENSE', level: 9, quantity: 1 }],
      }),
    ).rejects.toThrow('Unknown unit OFFENSE level 9');
  });

  it('untrainUnits rejects the same unknown units', async () => {
    await expect(
      untrainUnits({
        userId: 7,
        units: [{ type: 'DRAGON', level: 1, quantity: 1 }],
      }),
    ).rejects.toThrow('Unknown unit DRAGON');
  });

  it('calculateTotalCost throws for unknown units instead of returning 0', () => {
    expect(() =>
      calculateTotalCost(
        [{ type: 'DRAGON', level: 1, quantity: 1 } as any],
        fakeUModel,
      ),
    ).toThrow('Invalid unit definition: DRAGON_1');
  });

  it('calculateTotalCost still prices known units', () => {
    expect(
      calculateTotalCost(
        [{ type: 'OFFENSE', level: 2, quantity: 3 } as any],
        fakeUModel,
      ),
    ).toBe(30_000);
  });
});

describe('TrainingService.untrainUnits gold lock (F-05)', () => {
  it('locks the user row before reading units and refunding gold', async () => {
    db.fort_level = 4;
    db.units = [{ type: 'OFFENSE', level: 2, quantity: 4 }];
    await untrainUnits({
      userId: 7,
      units: [{ type: 'OFFENSE', level: 2, quantity: 2 }],
    });
    expect(calls[0]).toBe('lock');
    // 2 units at 10000 each, refund 75%
    expect(db.gold).toBe(10_000_000n + 15_000n);
  });
});

describe('untraining conserves population', () => {
  it('recreates citizens when untraining workers from a kingdom with no citizens', async () => {
    db.units = [{ type: 'WORKER', level: 1, quantity: 10 }];

    const result = await untrainUnits({
      userId: 7,
      units: [{ type: 'WORKER', level: 1, quantity: 4 }],
    });

    expect(db.units.find((unit) => unit.type === 'WORKER')?.quantity).toBe(6);
    expect(db.units.find((unit) => unit.type === 'CITIZEN')).toEqual({
      type: 'CITIZEN',
      level: 1,
      quantity: 4,
      isMercenary: false,
    });
    expect(result.units.find((unit) => unit.type === 'CITIZEN')?.userId).toBe(
      7,
    );
    expect(db.units.reduce((total, unit) => total + unit.quantity, 0)).toBe(10);
    expect(result.totalRefund).toBe(6000);
  });

  it('returns citizens from multiple unit types and preserves mercenaries', async () => {
    db.units = [
      { type: 'WORKER', level: 1, quantity: 3 },
      { type: 'OFFENSE', level: 1, quantity: 2 },
      { type: 'OFFENSE', level: 1, quantity: 5, isMercenary: true },
    ];

    await untrainUnits({
      userId: 7,
      units: [
        { type: 'WORKER', level: 1, quantity: 3 },
        { type: 'OFFENSE', level: 1, quantity: 2 },
      ],
    });

    expect(db.units.find((unit) => unit.type === 'CITIZEN')?.quantity).toBe(5);
    expect(db.units.find((unit) => unit.isMercenary)?.quantity).toBe(5);
    expect(db.units.reduce((total, unit) => total + unit.quantity, 0)).toBe(10);
  });

  it('returns citizens after training every citizen into workers', async () => {
    db.units = [{ type: 'CITIZEN', level: 1, quantity: 5 }];
    await trainUnits({
      userId: 7,
      units: [{ type: 'WORKER', level: 1, quantity: 5 }],
    });
    expect(db.units.find((unit) => unit.type === 'CITIZEN')?.quantity).toBe(0);

    await untrainUnits({
      userId: 7,
      units: [{ type: 'WORKER', level: 1, quantity: 5 }],
    });

    expect(db.units.find((unit) => unit.type === 'CITIZEN')?.quantity).toBe(5);
    expect(db.units.reduce((total, unit) => total + unit.quantity, 0)).toBe(5);
  });

  it('adds returned workers to an existing citizen balance', async () => {
    db.units = [
      { type: 'CITIZEN', level: 1, quantity: 7 },
      { type: 'WORKER', level: 1, quantity: 3 },
    ];
    await untrainUnits({
      userId: 7,
      units: [{ type: 'WORKER', level: 1, quantity: 2 }],
    });

    expect(db.units.find((unit) => unit.type === 'CITIZEN')?.quantity).toBe(9);
    expect(db.units.reduce((total, unit) => total + unit.quantity, 0)).toBe(10);
  });
});

describe('TrainingService.convertUnits fort gate', () => {
  // OFFENSE level 3 requires fort level 7, level 2 requires fort level 4 (src/constants/Units.tsx)
  const convertToL3 = (conversionAmount: number) =>
    convertUnits({
      userId: 7,
      fromUnit: { type: 'OFFENSE', level: 1 },
      toUnit: { type: 'OFFENSE', level: 3 },
      conversionAmount,
    });

  it('rejects converting into a unit above the fort level', async () => {
    db.fort_level = 1;
    db.units = [{ type: 'OFFENSE', level: 1, quantity: 10 }];
    await expect(convertToL3(5)).rejects.toThrow(
      'Cannot convert to Berserker (level 3) yet. Requires fort level 7.',
    );
    expect(db.gold).toBe(10_000_000n);
    expect(db.units).toEqual([{ type: 'OFFENSE', level: 1, quantity: 10 }]);
  });

  it('rejects one fort level below the requirement', async () => {
    db.fort_level = 6;
    db.units = [{ type: 'OFFENSE', level: 1, quantity: 10 }];
    await expect(convertToL3(1)).rejects.toThrow('Requires fort level 7');
  });

  it('accepts the conversion at the fort requirement and charges the difference', async () => {
    db.fort_level = 7;
    db.units = [{ type: 'OFFENSE', level: 1, quantity: 10 }];
    const result = await convertToL3(2);
    // 2 * (25000 - 1500)
    expect(result.totalCost).toBe(47_000);
    expect(db.gold).toBe(10_000_000n - 47_000n);
  });

  it('still allows converting down into an unlocked level', async () => {
    db.fort_level = 7;
    db.units = [{ type: 'OFFENSE', level: 3, quantity: 2 }];
    const result = await convertUnits({
      userId: 7,
      fromUnit: { type: 'OFFENSE', level: 3 },
      toUnit: { type: 'OFFENSE', level: 1 },
      conversionAmount: 2,
    });
    // floor(2 * 23500 * 0.75)
    expect(result.totalRefund).toBe(35_250);
  });
});

describe('regular training keeps mercenary stacks isolated', () => {
  it('cannot cash out mercenary units as regular troops', async () => {
    db.units = [{ type: 'OFFENSE', level: 1, quantity: 10, isMercenary: true }];
    await expect(
      untrainUnits({
        userId: 7,
        units: [{ type: 'OFFENSE', level: 1, quantity: 1 }],
      }),
    ).rejects.toThrow('Not enough');
    expect(calls).not.toContain('update');
  });

  it('preserves both stacks when training a matching regular unit', async () => {
    db.units.push({
      type: 'OFFENSE',
      level: 1,
      quantity: 10,
      isMercenary: true,
    });
    await trainUnits({
      userId: 7,
      units: [{ type: 'OFFENSE', level: 1, quantity: 1 }],
    });
    expect(db.units.filter((u) => u.type === 'OFFENSE')).toEqual([
      { type: 'OFFENSE', level: 1, quantity: 1, isMercenary: false },
      { type: 'OFFENSE', level: 1, quantity: 10, isMercenary: true },
    ]);
  });
});

it('cannot convert a mercenary stack into permanent regular troops', async () => {
  db.fort_level = 4;
  db.units = [{ type: 'OFFENSE', level: 1, quantity: 10, isMercenary: true }];
  await expect(
    convertUnits({
      userId: 7,
      fromUnit: { type: 'OFFENSE', level: 1 },
      toUnit: { type: 'OFFENSE', level: 2 },
      conversionAmount: 1,
    }),
  ).rejects.toThrow('Not enough');
  expect(calls).not.toContain('update');
});
