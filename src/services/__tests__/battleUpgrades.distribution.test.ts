import { normUnits } from "test/utils/testFixtures";
import { describe, it, expect } from 'bun:test';
import { UserStatsService } from '@/services/UserStatsService';

// Minimal types for the test fixture (mimic prisma shapes used by service)
type U = any;

describe('Battle upgrade distribution (unit tests)', () => {
  it('applies a single DEFENSE level1 upgrade (unitsCovered=5) to 6 units => should apply full 1 upgrade (per-upgrade stats once) and partially to the 6th', () => {
    const userData: any = {
      units: normUnits([
                { type: 'DEFENSE', level: 2, quantity: 6 }, // minUnitLevel 2
              ]),
      battle_upgrades: normUnits([
              { type: 'DEFENSE', level: 1, quantity: 1 }, // unitsCovered = 5
            ]),
      structure_upgrades: normUnits([ { type: 'OFFENSE', level: 6 } ]),
    };

  const svc = new UserStatsService(userData as any);
    const result = svc.calculateArmyStat('DEFENSE');
    // BattleUpgrades.DEFENSE level1: MeleeDefPower = 150, RangedAtkPower = 50, RangedDefPower = 100
    // One upgrade covers 5 units => contributes 150 MD, 50 RA, 100 RD distributed across 5 units.
    // With 6 units present, the 6th should not get additional per-upgrade bonus (only 1 upgrade exists).

    expect(result.upgradeStats.MeleeDefPower).toBeGreaterThanOrEqual(150 - 1);
    expect(result.upgradeStats.MeleeDefPower).toBeLessThanOrEqual(150 + 1);
  });

  it('applies 2 upgrades covering 5 units to 9 units => total coverage 10 units, so 9 units should get full coverage equivalent to 9/5 * upgrade.stats', () => {
    const userData: any = {
      units: normUnits([ { type: 'DEFENSE', level: 2, quantity: 9 } ]),
      battle_upgrades: normUnits([ { type: 'DEFENSE', level: 1, quantity: 2 } ]), // covers up to 10 units
      structure_upgrades: normUnits([ { type: 'OFFENSE', level: 6 } ]),
    };
  const svc = new UserStatsService(userData as any);
    const result = svc.calculateArmyStat('DEFENSE');
  // 2 upgrades each provide 150 MD and cover 5 units each, so total MD provided = 150*2 = 300.
  // With only 9 units present (<10), the service should distribute proportionally: 300 * (9/10) = 270.
  expect(result.upgradeStats.MeleeDefPower).toBeGreaterThanOrEqual(269);
  expect(result.upgradeStats.MeleeDefPower).toBeLessThanOrEqual(271);
  });
});
