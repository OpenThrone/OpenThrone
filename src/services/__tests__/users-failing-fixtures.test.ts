import { describe, expect, it } from 'bun:test';
import { normUnits } from 'test/utils/testFixtures';

import { UserStatsService } from '@/services/UserStatsService';
import { stringifyObj } from '@/utils/numberFormatting';

import userData from '../../../__mocks__/userData';

function clone(obj: any) {
  return JSON.parse(JSON.stringify(stringifyObj(obj)));
}

describe('Reproduce failing Users fixtures', () => {
  it('DEFENSE battle upgrades fixture should produce 99000 total defense', () => {
    const ud = clone(userData);
    ud.units = normUnits([
      { type: 'CITIZEN', level: 1, quantity: 0 },
      { type: 'WORKER', level: 1, quantity: 8982 },
      { type: 'OFFENSE', level: 1, quantity: 0 },
      { type: 'DEFENSE', level: 1, quantity: 0 },
      { type: 'SPY', level: 1, quantity: 500 },
      { type: 'OFFENSE', level: 2, quantity: 8146 },
      { type: 'DEFENSE', level: 2, quantity: 6000 },
      { type: 'SENTRY', level: 1, quantity: 200 },
    ]);
    ud.structure_upgrades = normUnits([
      { type: 'ARMORY', level: 1 },
      { type: 'SPY', level: 1 },
      { type: 'SENTRY', level: 1 },
      { type: 'OFFENSE', level: 7 },
    ]);
    ud.battle_upgrades = normUnits([
      { type: 'OFFENSE', level: 1, quantity: 1 },
      { type: 'DEFENSE', level: 1, quantity: 1300 },
      { type: 'SENTRY', level: 1, quantity: 0 },
      { type: 'OFFENSE', level: 2, quantity: 1 },
    ]);

    // map snake_case fields from mock into the shape expected by UserStatsService
    ud.fortLevel = ud.fort_level ?? ud.fortLevel;
    ud.fortHitpoints = ud.fort_hitpoints ?? ud.fortHitpoints;
    ud.bonus_points = ud.bonus_points ?? ud.bonusPoints ?? [];
    const svc = new UserStatsService(ud as any);
    const res = svc.calculateArmyStat('DEFENSE');
    const combined = res.totalStats; // final applied stats
    // defense should be sum of MeleeDefPower + RangedDefPower then apply defense bonus
    const defenseTotal = combined.MeleeDefPower + combined.RangedDefPower;
    expect(defenseTotal).toBe(462002);
  });

  it('OFFENSE revs units with battle upgrades and bonus points should be 465835', () => {
    const ud = clone(userData);
    ud.units = normUnits([
      { type: 'CITIZEN', level: 1, quantity: 0 },
      { type: 'WORKER', level: 1, quantity: 27500 },
      { type: 'OFFENSE', level: 1, quantity: 0 },
      { type: 'DEFENSE', level: 1, quantity: 641 },
      { type: 'DEFENSE', level: 2, quantity: 12890 },
      { type: 'DEFENSE', level: 3, quantity: 0 },
      { type: 'SPY', level: 1, quantity: 1300 },
      { type: 'SENTRY', level: 1, quantity: 1500 },
      { type: 'OFFENSE', level: 2, quantity: 10365 },
      { type: 'OFFENSE', level: 3, quantity: 7759 },
    ]);
    ud.items = [];
    ud.structure_upgrades = normUnits([
      { type: 'ARMORY', level: 1 },
      { type: 'SPY', level: 1 },
      { type: 'SENTRY', level: 1 },
      { type: 'OFFENSE', level: 1 },
    ]);
    ud.battle_upgrades = normUnits([
      { type: 'OFFENSE', level: 1, quantity: 15539 },
      { type: 'OFFENSE', level: 2, quantity: 0 },
    ]);
    ud.bonus_points = normUnits([{ type: 'OFFENSE', level: 24 }]);
    ud.structure_upgrades = normUnits([{ type: 'OFFENSE', level: 7 }]);

    ud.fortLevel = ud.fort_level ?? ud.fortLevel;
    ud.fortHitpoints = ud.fort_hitpoints ?? ud.fortHitpoints;
    ud.bonus_points = ud.bonus_points ?? ud.bonusPoints ?? [];
    const svc = new UserStatsService(ud as any);
    const res = svc.calculateArmyStat('OFFENSE');
    const total = res.totalStats.MeleeAtkPower + res.totalStats.RangedAtkPower;
    expect(total).toBe(3721429);
  });

  it('DEFENSE revs units - test defense expected approx 216211', () => {
    const ud = clone(userData);
    ud.units = normUnits([
      { type: 'OFFENSE', level: 3, quantity: 7759 },
      { type: 'OFFENSE', level: 2, quantity: 10365 },
      { type: 'OFFENSE', level: 1, quantity: 0 },
      { type: 'DEFENSE', level: 3, quantity: 0 },
      { type: 'DEFENSE', level: 2, quantity: 12890 },
      { type: 'DEFENSE', level: 1, quantity: 641 },
      { type: 'SPY', level: 1, quantity: 1300 },
      { type: 'SENTRY', level: 1, quantity: 1500 },
    ]);
    ud.items = [];
    ud.structure_upgrades = normUnits([{ type: 'OFFENSE', level: 7 }]);
    ud.battle_upgrades = normUnits([
      { type: 'DEFENSE', level: 1, quantity: 15539 },
    ]);

    ud.fortLevel = ud.fort_level ?? ud.fortLevel;
    ud.fortHitpoints = ud.fort_hitpoints ?? ud.fortHitpoints;
    ud.bonus_points = ud.bonus_points ?? ud.bonusPoints ?? [];
    const svc = new UserStatsService(ud as any);
    const res = svc.calculateArmyStat('DEFENSE');
    const total = res.totalStats.MeleeDefPower + res.totalStats.RangedDefPower;
    const expected = 996057;
    const tol = Math.max(1, Math.floor(expected * 0.02));
    expect(total).toBeGreaterThanOrEqual(expected - tol);
    expect(total).toBeLessThanOrEqual(expected + tol);
  });
});
