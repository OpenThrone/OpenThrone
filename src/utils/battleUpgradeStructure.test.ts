import { describe, expect, it } from 'bun:test';

import { getBattleUpgradeStructure } from './battleUpgradeStructure';

describe('getBattleUpgradeStructure', () => {
  it('maps each battle upgrade type to the structure that unlocks it', () => {
    expect(getBattleUpgradeStructure('OFFENSE')).toBe('OFFENSE');
    expect(getBattleUpgradeStructure('DEFENSE')).toBe('OFFENSE');
    expect(getBattleUpgradeStructure('SPY')).toBe('SPY');
    expect(getBattleUpgradeStructure('SENTRY')).toBe('SPY');
  });
});
