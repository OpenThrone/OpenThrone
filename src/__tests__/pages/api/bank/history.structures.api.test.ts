import { describe, expect, it, mock, vi } from 'bun:test';

// Bank → History with the Sale filter on must list structure purchases (#346).
const getBankHistory = vi.fn(async (_conditions: any[]) => ({
  rows: [],
  total: 0,
}));
mock.module('@/middleware/auth', () => ({ withAuth: (h: any) => h }));
mock.module('@/services/Bank.service', () => ({ getBankHistory }));
mock.module('@/services/Era.service', () => ({
  ensureActiveEra: async () => ({ startDate: new Date(0) }),
}));

const route = require('../../../../pages/api/bank/history').default;

const makeRes = () => {
  const res: any = { status: vi.fn(), json: vi.fn(), end: vi.fn() };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
};

/** Does a SALE row with this stats.type match one of the filter's OR branches? */
const saleMatches = (conditions: any[], statsType: string) =>
  conditions[0].OR.some(
    (c: any) =>
      (c.history_type === 'SALE' || c.history_type?.in?.includes('SALE')) &&
      c.stats?.path?.[0] === 'type' &&
      statsType.includes(c.stats.string_contains),
  );

describe('bank history sale filter (#346)', () => {
  it('includes fort, house, economy and battle-structure purchases', async () => {
    const res = makeRes();
    await route(
      { method: 'GET', query: { sale: 'true' }, session: { user: { id: 5 } } },
      res,
    );
    expect(res.status).toHaveBeenCalledWith(200);
    const conditions = getBankHistory.mock.calls[0][0];
    for (const type of [
      'FORTIFICATIONS_UPGRADE',
      'HOUSES_UPGRADE',
      'ECONOMY_UPGRADE',
      'SPY_UPGRADE',
      'OFFENSE_UPGRADE',
      'RACIAL_UPGRADE',
      'BATTLE_UPGRADES_BUY',
      'ARMORY_EQUIP',
    ]) {
      expect(saleMatches(conditions, type)).toBe(true);
    }
    expect(saleMatches(conditions, 'TRAINING_TRAIN')).toBe(false);
  });
});

describe('bank history training filter', () => {
  it('includes mercenary hires and renewals', async () => {
    getBankHistory.mockClear();
    const res = makeRes();
    await route(
      {
        method: 'GET',
        query: { training: 'true' },
        session: { user: { id: 5 } },
      },
      res,
    );
    const conditions = getBankHistory.mock.calls[0][0];
    for (const type of [
      'HIRE_MERCENARY',
      'RENEW_MERCENARY',
      'TRAINING_TRAIN',
    ]) {
      expect(saleMatches(conditions, type)).toBe(true);
    }
  });
});
