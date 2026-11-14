import { describe, expect, it } from 'bun:test';

// Bank → History with the Sale filter on must list structure purchases (#346).
// On this branch the route delegates the filter to Bank.service, so the
// conditions are checked on the shared builder the route calls.
const { buildBankHistoryConditions } = require('@/services/Bank.service');

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
    const conditions = buildBankHistoryConditions(5, { sale: 'true' });
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
    const conditions = buildBankHistoryConditions(5, { training: 'true' });
    for (const type of [
      'HIRE_MERCENARY',
      'RENEW_MERCENARY',
      'TRAINING_TRAIN',
    ]) {
      expect(saleMatches(conditions, type)).toBe(true);
    }
  });
});
