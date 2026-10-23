import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';

import prisma from '@/lib/prisma';
import { ArmoryService } from '@/services/Armory.service';

// Restore the shared prisma mock after each test so other suites keep their own $transaction
const originalTransaction = (prisma as any).$transaction;

afterEach(() => {
  (prisma as any).$transaction = originalTransaction;
});

// Fake in-memory user row shared by the mocked transaction client
type FakeItem = {
  type: string;
  usage: string;
  level: number;
  quantity: number;
};
type FakeDb = {
  gold: bigint;
  experience: number;
  fort_level: number;
  race: string;
  items: FakeItem[];
  structure: Array<{ type: string; level: number }>;
  mercenaries?: Array<{
    type: string;
    level: number;
    quantity: number;
    expiresAt: Date;
  }>;
  priceBonus?: number;
};

let db: FakeDb;
let calls: string[];
let tx: any;

const freshDb = (overrides: Partial<FakeDb> = {}): FakeDb => ({
  gold: 1_000_000n,
  experience: 0,
  fort_level: 30,
  race: 'HUMAN',
  items: [],
  structure: [],
  ...overrides,
});

const buildUser = () => ({
  id: 7,
  gold: db.gold,
  experience: db.experience,
  fort_level: db.fort_level,
  race: db.race,
  mercenaries: db.mercenaries ?? [],
  UserUnit: [],
  UserItem: db.items.map((item) => ({ ...item, userId: 7 })),
  UserStructureUpgrade: db.structure.map((s) => ({ ...s, userId: 7 })),
  UserBattleUpgrade: [],
  UserBonusPoints: [{ type: 'PRICES', level: db.priceBonus ?? 0 }],
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
        if (data.gold !== undefined) {
          if (typeof data.gold === 'object') {
            db.gold +=
              BigInt(data.gold.increment ?? 0) -
              BigInt(data.gold.decrement ?? 0);
          } else db.gold = BigInt(data.gold);
        }
        if (data.mercenaries) db.mercenaries = data.mercenaries;
        return { gold: db.gold };
      }),
    },
    userItem: {
      deleteMany: mock(async () => {
        db.items = [];
      }),
      create: mock(async ({ data }: any) => {
        db.items.push({
          type: data.type,
          usage: data.usage,
          level: data.level,
          quantity: data.quantity,
        });
      }),
    },
    bank_history: { create: mock(async () => ({})) },
  };
  (prisma as any).$transaction = mock(async (cb: any) => cb(tx));
});

// The convert parser splits "USAGE_<ItemTypes id>" where the ItemTypes id is "OFFENSE_<NAME>"
const convertArgs = (
  fromId: string,
  toId: string,
  conversionAmount: number,
) => ({
  userId: 7,
  fromItem: `OFFENSE_OFFENSE_${fromId}`,
  toItem: `OFFENSE_OFFENSE_${toId}`,
  conversionAmount,
});

describe('ArmoryService.equipItems armory level gate (F-08)', () => {
  const hatchet = {
    type: 'WEAPON',
    usage: 'OFFENSE',
    level: 2,
    quantity: 1,
  }; // OFFENSE_HATCHET requires armory level 2, costs 25000

  it('rejects an item above the armory level', async () => {
    db.structure = [];
    await expect(
      ArmoryService.equipItems({ userId: 7, items: [hatchet] }),
    ).rejects.toThrow('Cannot equip');
    expect(db.gold).toBe(1_000_000n);
    expect(db.items).toEqual([]);
  });

  it('accepts an item at the armory level and charges gold', async () => {
    db.structure = [{ type: 'ARMORY', level: 2 }];
    await ArmoryService.equipItems({ userId: 7, items: [hatchet] });
    expect(db.gold).toBe(1_000_000n - 25_000n);
    expect(db.items).toEqual([
      { type: 'WEAPON', usage: 'OFFENSE', level: 2, quantity: 1 },
    ]);
  });

  it('locks the user row before reading gold', async () => {
    db.structure = [{ type: 'ARMORY', level: 2 }];
    await ArmoryService.equipItems({ userId: 7, items: [hatchet] });
    expect(calls[0]).toBe('lock');
    expect(calls.indexOf('lock')).toBeLessThan(calls.indexOf('read'));
  });
});

describe('ArmoryService.equipItems race gate', () => {
  // OFFENSE_LONG-SWORD is the only WEAPON/OFFENSE level 7 item and is HUMAN only
  const longSword = { type: 'WEAPON', usage: 'OFFENSE', level: 7, quantity: 1 };

  it('rejects an item restricted to another race', async () => {
    db.race = 'ELF';
    db.structure = [{ type: 'ARMORY', level: 7 }];
    await expect(
      ArmoryService.equipItems({ userId: 7, items: [longSword] }),
    ).rejects.toThrow('not available to ELF');
    expect(db.gold).toBe(1_000_000n);
    expect(db.items).toEqual([]);
  });

  it('accepts an item restricted to the user race', async () => {
    db.race = 'HUMAN';
    db.structure = [{ type: 'ARMORY', level: 7 }];
    await ArmoryService.equipItems({ userId: 7, items: [longSword] });
    expect(db.gold).toBe(1_000_000n - 750_000n);
  });

  it('accepts race ALL items for every race', async () => {
    db.race = 'UNDEAD';
    await ArmoryService.equipItems({
      userId: 7,
      items: [{ type: 'WEAPON', usage: 'OFFENSE', level: 1, quantity: 1 }],
    });
    expect(db.gold).toBe(1_000_000n - 12_500n);
  });
});

describe('ArmoryService.convertItems rules (F-01)', () => {
  beforeEach(() => {
    db.structure = [{ type: 'ARMORY', level: 7 }];
  });

  it('rejects converting an item to the same level', async () => {
    db.items = [{ type: 'WEAPON', usage: 'OFFENSE', level: 6, quantity: 5 }];
    await expect(
      ArmoryService.convertItems(convertArgs('SHORT-SWORD', 'GREAT-SWORD', 1)), // both WEAPON level 6
    ).rejects.toThrow('Cannot convert items to the same level');
    expect(db.gold).toBe(1_000_000n);
  });

  it('rejects converting between different equipment types', async () => {
    db.items = [{ type: 'WEAPON', usage: 'OFFENSE', level: 1, quantity: 10 }];
    await expect(
      ArmoryService.convertItems(convertArgs('DAGGER', 'LEATHER-HOOD', 4)),
    ).rejects.toThrow('Cannot convert between different item types');
    expect(db.gold).toBe(1_000_000n);
    expect(db.items).toEqual([
      { type: 'WEAPON', usage: 'OFFENSE', level: 1, quantity: 10 },
    ]);
  });

  it('rejects converting between different usages', async () => {
    db.items = [{ type: 'WEAPON', usage: 'OFFENSE', level: 1, quantity: 1 }];
    await expect(
      ArmoryService.convertItems({
        userId: 7,
        fromItem: 'OFFENSE_OFFENSE_DAGGER',
        toItem: 'DEFENSE_DEFENSE_HATCHET',
        conversionAmount: 1,
      }),
    ).rejects.toThrow('Cannot convert between different item types');
  });

  it('blocks the reported Dagger -> Hood -> Hatchet -> Dagger chain', async () => {
    db.items = [{ type: 'WEAPON', usage: 'OFFENSE', level: 1, quantity: 1 }];
    await expect(
      ArmoryService.convertItems(
        convertArgs('DAGGER', 'STUDDED-LEATHER-HOOD', 1),
      ),
    ).rejects.toThrow('Cannot convert between different item types');
    expect(db.gold).toBe(1_000_000n);
  });

  it('rejects a target above the armory level', async () => {
    db.structure = [{ type: 'ARMORY', level: 1 }];
    db.items = [{ type: 'WEAPON', usage: 'OFFENSE', level: 1, quantity: 2 }];
    await expect(
      ArmoryService.convertItems(convertArgs('DAGGER', 'HATCHET', 1)),
    ).rejects.toThrow('requires armory level 2');
    expect(db.gold).toBe(1_000_000n);
  });

  it('rejects a target restricted to another race', async () => {
    db.race = 'ELF';
    db.items = [{ type: 'WEAPON', usage: 'OFFENSE', level: 6, quantity: 1 }];
    await expect(
      ArmoryService.convertItems(convertArgs('SHORT-SWORD', 'LONG-SWORD', 1)),
    ).rejects.toThrow('not available to ELF');
    expect(db.gold).toBe(1_000_000n);
  });

  it('values the source at the cheapest item sharing its inventory slot', async () => {
    // GREAT-SWORD (600000) shares the WEAPON/OFFENSE/6 row with SHORT-SWORD (500000).
    // Naming the pricier alias must not raise the refund: (500000 - 200000) * 0.75 = 225000
    db.items = [{ type: 'WEAPON', usage: 'OFFENSE', level: 6, quantity: 1 }];
    await ArmoryService.convertItems(
      convertArgs('GREAT-SWORD', 'BATTLE-AXE', 1),
    );
    expect(db.gold).toBe(1_000_000n + 225_000n);
  });

  it('pays a refund only when the target is strictly cheaper', async () => {
    // HATCHET (level 2, 25000) -> DAGGER (level 1, 12500): 4 * 12500 * 0.75 = 37500
    db.items = [{ type: 'WEAPON', usage: 'OFFENSE', level: 2, quantity: 4 }];
    await ArmoryService.convertItems(convertArgs('HATCHET', 'DAGGER', 4));
    expect(db.gold).toBe(1_000_000n + 37_500n);
  });

  it('charges the difference when upgrading to a more expensive item', async () => {
    // DAGGER (level 1, 12500) -> HATCHET (level 2, 25000): 2 * 12500 = 25000
    db.items = [{ type: 'WEAPON', usage: 'OFFENSE', level: 1, quantity: 2 }];
    await ArmoryService.convertItems(convertArgs('DAGGER', 'HATCHET', 2));
    expect(db.gold).toBe(1_000_000n - 25_000n);
  });

  it('a round trip up and back down loses gold', async () => {
    db.items = [{ type: 'WEAPON', usage: 'OFFENSE', level: 1, quantity: 2 }];
    await ArmoryService.convertItems(convertArgs('DAGGER', 'HATCHET', 2));
    await ArmoryService.convertItems(convertArgs('HATCHET', 'DAGGER', 2));
    // -25000 + 18750
    expect(db.gold).toBe(1_000_000n - 6_250n);
  });

  it('locks the user row before reading items and gold', async () => {
    db.items = [{ type: 'WEAPON', usage: 'OFFENSE', level: 1, quantity: 2 }];
    await ArmoryService.convertItems(convertArgs('DAGGER', 'HATCHET', 1));
    expect(calls[0]).toBe('lock');
  });
});

describe('mercenary contract dismissal', () => {
  it('rejects the retired aggregate refund path without crediting gold', async () => {
    const before = db.gold;
    await expect(
      ArmoryService.dismissMercenary({
        userId: 7,
        unitType: 'OFFENSE',
        level: 1,
        quantity: 1,
      }),
    ).rejects.toThrow('specific contract');
    expect(db.gold).toBe(before);
    expect(tx.users.update).not.toHaveBeenCalled();
  });
});

describe('atomic multi-slot equipment upgrades', () => {
  const weapon = {
    fromItem: 'OFFENSE_OFFENSE_DAGGER',
    toItem: 'OFFENSE_OFFENSE_HATCHET',
    conversionAmount: 2,
  };
  const helmet = {
    fromItem: 'OFFENSE_OFFENSE_PADDED-HOOD',
    toItem: 'OFFENSE_OFFENSE_LEATHER-HOOD',
    conversionAmount: 3,
  };
  beforeEach(() => {
    db.structure = [{ type: 'ARMORY', level: 2 }];
    db.items = [
      { type: 'WEAPON', usage: 'OFFENSE', level: 1, quantity: 10 },
      { type: 'HELM', usage: 'OFFENSE', level: 1, quantity: 10 },
    ];
  });
  it('charges the combined price differences in one locked update', async () => {
    await ArmoryService.upgradeItems({
      userId: 7,
      conversions: [weapon, helmet],
    });
    expect(db.gold).toBe(966_000n);
    expect(db.items).toContainEqual({
      type: 'WEAPON',
      usage: 'OFFENSE',
      level: 2,
      quantity: 2,
    });
    expect(db.items).toContainEqual({
      type: 'HELM',
      usage: 'OFFENSE',
      level: 2,
      quantity: 3,
    });
    expect(calls[0]).toBe('lock');
    expect(tx.users.update).toHaveBeenCalledTimes(1);
    expect(tx.bank_history.create).toHaveBeenCalledTimes(1);
  });
  it('does not write anything if a later conversion has insufficient inventory', async () => {
    const before = structuredClone(db);
    await expect(
      ArmoryService.upgradeItems({
        userId: 7,
        conversions: [weapon, { ...helmet, conversionAmount: 11 }],
      }),
    ).rejects.toThrow('Not enough items');
    expect(db).toEqual(before);
    expect(tx.users.update).not.toHaveBeenCalled();
    expect(tx.userItem.deleteMany).not.toHaveBeenCalled();
  });
  it('does not write anything when the total exceeds available gold', async () => {
    db.gold = 30_000n;
    const before = structuredClone(db);
    await expect(
      ArmoryService.upgradeItems({ userId: 7, conversions: [weapon, helmet] }),
    ).rejects.toThrow('Not enough gold');
    expect(db).toEqual(before);
    expect(tx.users.update).not.toHaveBeenCalled();
  });
  it('rejects downgrades, locked gear, race violations and cross-slot conversions', async () => {
    await expect(
      ArmoryService.upgradeItems({
        userId: 7,
        conversions: [
          { ...weapon, fromItem: weapon.toItem, toItem: weapon.fromItem },
        ],
      }),
    ).rejects.toThrow('lower tier');
    await expect(
      ArmoryService.upgradeItems({
        userId: 7,
        conversions: [{ ...weapon, toItem: 'OFFENSE_OFFENSE_QUARTERSTAFF' }],
      }),
    ).rejects.toThrow('armory level');
    await expect(
      ArmoryService.upgradeItems({
        userId: 7,
        conversions: [{ ...weapon, toItem: helmet.toItem }],
      }),
    ).rejects.toThrow('different item types');
    db.structure = [{ type: 'ARMORY', level: 7 }];
    db.race = 'ELF';
    await expect(
      ArmoryService.upgradeItems({
        userId: 7,
        conversions: [{ ...weapon, toItem: 'OFFENSE_OFFENSE_LONG-SWORD' }],
      }),
    ).rejects.toThrow('not available');
    expect(tx.users.update).not.toHaveBeenCalled();
  });
  it('rejects duplicate source spending before writing', async () => {
    await expect(
      ArmoryService.upgradeItems({
        userId: 7,
        conversions: [
          { ...weapon, conversionAmount: 6 },
          { ...weapon, conversionAmount: 6 },
        ],
      }),
    ).rejects.toThrow('Not enough items');
    expect(tx.users.update).not.toHaveBeenCalled();
  });
  it('does not accept caller-supplied conversion prices', async () => {
    const conversion = { ...weapon, cost: 0, refund: 1_000_000 };
    await ArmoryService.upgradeItems({ userId: 7, conversions: [conversion] });
    expect(db.gold).toBe(975_000n);
  });
});
