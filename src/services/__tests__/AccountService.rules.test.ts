import { beforeEach, describe, expect, it, vi } from 'bun:test';
import {
  installMockPrisma,
  mockPrisma,
  resetMockPrisma,
} from 'test/utils/mockPrisma';
import { silenceLogger } from 'test/utils/silenceLogger';

installMockPrisma(vi);
silenceLogger();
// Dynamic imports deliberately install the Prisma test boundary before service loading.
const { AccountService } = await import('../Account.service');
const { DefaultLevelBonus, Fortifications, levelXPArray } =
  await import('@/constants');

const USER_ID = 125;
// A level 80 player has 80 proficiency points in total, minus those already spent.
const LEVEL = 80;
const experience = levelXPArray.find((entry) => entry.level === LEVEL)!.xp;
const [TYPE_A, TYPE_B] = DefaultLevelBonus.map((bonus) => bonus.type);

type BonusRow = { type: string; level: number };

describe('proficiency spending (updateBonusPoints)', () => {
  let bonusRows: BonusRow[];
  let upsert: ReturnType<typeof vi.fn>;

  const spend = (changeQueue: Record<string, { change: number }>) =>
    AccountService.updateBonusPoints(USER_ID, { changeQueue });
  const saved = (type: string) =>
    upsert.mock.calls
      .map(([args]) => args)
      .find((args) => args.where.userId_type.type === type)?.update.level;

  beforeEach(() => {
    resetMockPrisma();
    bonusRows = [];
    upsert = vi.fn(async () => ({}));
    const tx = {
      $queryRaw: vi.fn(async () => []),
      users: {
        findUnique: vi.fn(async () => ({
          id: USER_ID,
          experience,
          UserBonusPoints: structuredClone(bonusRows),
        })),
      },
      userBonusPoints: { upsert },
    };
    mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(tx));
  });

  it('applies a spend within the available points on top of earlier levels', async () => {
    bonusRows = [{ type: TYPE_A, level: 10 }];
    const result = await spend({ [TYPE_A]: { change: 5 } });
    expect(saved(TYPE_A)).toBe(15);
    expect(saved(TYPE_B)).toBe(0);
    expect(
      result.data.updatedBonusPoints.find((bp: BonusRow) => bp.type === TYPE_A),
    ).toEqual({ type: TYPE_A, level: 15 });
  });

  it('allows a single proficiency to reach exactly 75 points', async () => {
    await spend({ [TYPE_A]: { change: 75 } });
    expect(saved(TYPE_A)).toBe(75);
  });

  it('refuses to push a single proficiency above 75 points', async () => {
    // Enough points are available (80); only the per-proficiency cap applies.
    await expect(spend({ [TYPE_A]: { change: 76 } })).rejects.toThrow(
      'Cannot increase level above 75',
    );
    expect(upsert).not.toHaveBeenCalled();
  });

  it('counts levels already held toward the 75 point cap', async () => {
    bonusRows = [{ type: TYPE_A, level: 70 }];
    await expect(spend({ [TYPE_A]: { change: 6 } })).rejects.toThrow(
      'Cannot increase level above 75',
    );
    expect(upsert).not.toHaveBeenCalled();
  });

  it('refuses a net decrease through this endpoint', async () => {
    bonusRows = [{ type: TYPE_A, level: 10 }];
    await expect(spend({ [TYPE_A]: { change: -3 } })).rejects.toThrow(
      'Cannot decrease bonus points below zero',
    );
    expect(upsert).not.toHaveBeenCalled();
  });

  it('refuses a queue that hides a decrease behind an increase', async () => {
    bonusRows = [{ type: TYPE_B, level: 10 }];
    await expect(
      spend({ [TYPE_A]: { change: 4 }, [TYPE_B]: { change: -2 } }),
    ).rejects.toThrow('Calculation error during point allocation');
    expect(upsert).not.toHaveBeenCalled();
  });

  it('refuses a total larger than the points still available', async () => {
    // 80 available minus 70 already spent leaves 10.
    bonusRows = [
      { type: TYPE_A, level: 35 },
      { type: TYPE_B, level: 35 },
    ];
    const remaining = 10;
    await expect(
      spend({ [TYPE_A]: { change: remaining + 1 } }),
    ).rejects.toThrow('Not enough proficiency points available');
    expect(upsert).not.toHaveBeenCalled();

    // Exactly the remaining points are accepted.
    await spend({ [TYPE_A]: { change: remaining } });
    expect(saved(TYPE_A)).toBe(35 + remaining);
  });

  it('checks the total across proficiencies, not each one alone', async () => {
    bonusRows = [{ type: TYPE_B, level: 60 }];
    // 20 left: each request fits on its own but together they exceed it.
    await expect(
      spend({ [TYPE_A]: { change: 11 }, [TYPE_B]: { change: 10 } }),
    ).rejects.toThrow('Not enough proficiency points available');
    expect(upsert).not.toHaveBeenCalled();
  });
});

describe('fortification repair (repairFortification)', () => {
  const fort = Fortifications[1];
  let user: { gold: bigint; fort_level: number; fort_hitpoints: number };
  let tx: any;

  beforeEach(() => {
    resetMockPrisma();
    user = {
      gold: 1_000_000n,
      fort_level: fort.level,
      fort_hitpoints: fort.hitpoints - 10,
    };
    tx = {
      $queryRaw: vi.fn(async () => []),
      users: {
        findUnique: vi.fn(async () => structuredClone(user)),
        update: vi.fn(async ({ data }: any) => ({
          gold: user.gold,
          fort_hitpoints: data.fort_hitpoints,
        })),
      },
      bank_history: { create: vi.fn(async () => ({})) },
    };
    mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(tx));
  });

  it('repairs exactly the requested points when they fit', async () => {
    user.fort_hitpoints = fort.hitpoints - 10;
    await AccountService.repairFortification(USER_ID, { repairPoints: 4 });
    const { data } = tx.users.update.mock.calls[0][0];
    expect(data.fort_hitpoints).toBe(fort.hitpoints - 6);
    expect(data.gold).toEqual({
      decrement: 4n * BigInt(fort.costPerRepairPoint),
    });
  });

  it('clamps an over-request to the missing hitpoints and charges only those', async () => {
    user.fort_hitpoints = fort.hitpoints - 10;
    await AccountService.repairFortification(USER_ID, { repairPoints: 500 });
    const { data } = tx.users.update.mock.calls[0][0];
    expect(data.fort_hitpoints).toBe(fort.hitpoints);
    expect(data.gold).toEqual({
      decrement: 10n * BigInt(fort.costPerRepairPoint),
    });
    expect(tx.bank_history.create.mock.calls[0][0].data).toMatchObject({
      gold_amount: 10n * BigInt(fort.costPerRepairPoint),
      history_type: 'FORT_REPAIR',
      stats: { requestedRepairPoints: 500, actualRepairAmount: 10 },
    });
  });

  it('charges for the clamped points, so an over-request stays affordable', async () => {
    user.gold = 10n * BigInt(fort.costPerRepairPoint);
    await AccountService.repairFortification(USER_ID, { repairPoints: 500 });
    const { data } = tx.users.update.mock.calls[0][0];
    expect(data.fort_hitpoints).toBe(fort.hitpoints);
    expect(data.gold).toEqual({
      decrement: 10n * BigInt(fort.costPerRepairPoint),
    });
  });

  it('still refuses when the clamped repair costs more than the gold on hand', async () => {
    user.gold = 10n * BigInt(fort.costPerRepairPoint) - 1n;
    await expect(
      AccountService.repairFortification(USER_ID, { repairPoints: 500 }),
    ).rejects.toThrow('Not enough gold');
    expect(tx.users.update).not.toHaveBeenCalled();
  });

  it('refuses a repair at full health without charging', async () => {
    user.fort_hitpoints = fort.hitpoints;
    await expect(
      AccountService.repairFortification(USER_ID, { repairPoints: 1 }),
    ).rejects.toThrow('already at full health');
    expect(tx.users.update).not.toHaveBeenCalled();
    expect(tx.bank_history.create).not.toHaveBeenCalled();
  });

  it('refuses a repair above full health as well', async () => {
    user.fort_hitpoints = fort.hitpoints + 5;
    await expect(
      AccountService.repairFortification(USER_ID, { repairPoints: 1 }),
    ).rejects.toThrow('already at full health');
    expect(tx.users.update).not.toHaveBeenCalled();
  });
});
