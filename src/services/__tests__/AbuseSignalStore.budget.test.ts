import { describe, expect, it, vi } from 'bun:test';
import { installMockPrisma, mockPrisma } from 'test/utils/mockPrisma';

installMockPrisma(vi);
const { raiseAbuseSignal } = require('../AbuseSignalStore.service');
const { BudgetExpiredError, runWithBudget } = require('@/utils/boundedWork');

describe('signal writes honour the job budget statement by statement', () => {
  it('writes nothing once the budget is spent after the advisory lock', async () => {
    let remaining = 60_000;
    const budget = {
      expired: () => remaining <= 0,
      remainingMs: () => remaining,
    };
    const create = vi.fn(async () => ({}));
    const tx = {
      // The advisory lock wait used up the rest of the budget.
      $executeRaw: vi.fn(async (strings: TemplateStringsArray) => {
        if (strings.join('?').includes('pg_advisory_xact_lock')) remaining = 0;
        return 0;
      }),
      cheatSignal: {
        findFirst: vi.fn(async () => null),
        create,
        update: vi.fn(async () => ({})),
      },
    };
    mockPrisma.$transaction = vi.fn(async (callback: any) => callback(tx));
    await expect(
      runWithBudget(budget, () =>
        raiseAbuseSignal({
          type: 'BOT_TIMING',
          userId: 1,
          linkedUserIds: [],
          dedupeKey: 'bot:1',
          score: 50,
          summary: 'x',
          evidence: {},
        }),
      ),
    ).rejects.toBeInstanceOf(BudgetExpiredError);
    expect(create).not.toHaveBeenCalled();
    expect(tx.cheatSignal.findFirst).not.toHaveBeenCalled();
  });
});
