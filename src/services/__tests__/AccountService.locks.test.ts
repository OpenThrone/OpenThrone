import { beforeEach, describe, expect, it, vi } from 'bun:test';
import {
  installMockPrisma,
  mockPrisma,
  resetMockPrisma,
} from 'test/utils/mockPrisma';

installMockPrisma(vi);
const { AccountService } = require('../Account.service');
const { Fortifications } = require('@/constants');

const fort = Fortifications[0];
// Synthetic account state; no database is touched.
const buildTx = (userRow: Record<string, unknown>) => ({
  $queryRaw: vi.fn(async () => [{ id: 125 }]),
  users: {
    findUnique: vi.fn(async () => userRow),
    update: vi.fn(async ({ data }: any) => ({
      gold: 0n,
      fort_hitpoints: data.fort_hitpoints,
    })),
  },
  bank_history: { create: vi.fn(async () => ({})) },
  userBonusPoints: { upsert: vi.fn(async () => ({})) },
});

describe('row locks on gold and proficiency writes', () => {
  let tx: ReturnType<typeof buildTx>;

  beforeEach(() => {
    resetMockPrisma();
    tx = buildTx({
      gold: 1_000_000n,
      fort_level: fort.level,
      fort_hitpoints: fort.hitpoints - 10,
      experience: 0,
      UserBonusPoints: [],
    });
    mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(tx));
  });

  describe('repairFortification', () => {
    it('locks the user row before reading the gold balance', async () => {
      await AccountService.repairFortification(125, { repairPoints: 5 });

      const lockOrder = tx.$queryRaw.mock.invocationCallOrder[0];
      const readOrder = tx.users.findUnique.mock.invocationCallOrder[0];
      expect(lockOrder).toBeLessThan(readOrder);
      expect(tx.$queryRaw.mock.calls[0][0].join('?')).toContain('FOR UPDATE');
    });

    it('writes gold as a relative decrement rather than an absolute balance', async () => {
      await AccountService.repairFortification(125, { repairPoints: 5 });

      const updateArgs = tx.users.update.mock.calls[0][0];
      expect(updateArgs.data.gold).toEqual({
        decrement: BigInt(5) * BigInt(fort.costPerRepairPoint),
      });
    });

    it('refuses the repair when the locked balance is insufficient', async () => {
      tx.users.findUnique.mockResolvedValue({
        gold: 0n,
        fort_level: fort.level,
        fort_hitpoints: fort.hitpoints - 10,
      });
      await expect(
        AccountService.repairFortification(125, { repairPoints: 5 }),
      ).rejects.toThrow('Not enough gold');
      expect(tx.users.update).not.toHaveBeenCalled();
    });
  });

  describe('updateBonusPoints', () => {
    it('locks the user row before reading proficiency state', async () => {
      await AccountService.updateBonusPoints(125, {
        changeQueue: {},
      });

      const lockOrder = tx.$queryRaw.mock.invocationCallOrder[0];
      const readOrder = tx.users.findUnique.mock.invocationCallOrder[0];
      expect(lockOrder).toBeLessThan(readOrder);
      expect(tx.$queryRaw.mock.calls[0][0].join('?')).toContain('FOR UPDATE');
    });

    it('re-checks the available balance inside the lock', async () => {
      await expect(
        AccountService.updateBonusPoints(125, {
          changeQueue: { ATTACK: { change: 1_000_000 } },
        }),
      ).rejects.toThrow('Not enough proficiency points');
      expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
        tx.users.findUnique.mock.invocationCallOrder[0],
      );
      expect(tx.userBonusPoints.upsert).not.toHaveBeenCalled();
    });
  });
});
