import { describe, expect, it } from 'bun:test';

import { UnitTypes } from './Units';

function getUnit(name: string) {
  const unit = UnitTypes.find((unitType) => unitType.name === name);
  if (!unit) {
    throw new Error(`Missing unit fixture: ${name}`);
  }
  return unit;
}

function attackPower(name: string): number {
  const unit = getUnit(name);
  return Number(unit.MeleeAtkPower ?? 0) + Number(unit.RangedAtkPower ?? 0);
}

function defensePower(name: string): number {
  const unit = getUnit(name);
  return Number(unit.MeleeDefPower ?? 0) + Number(unit.RangedDefPower ?? 0);
}

describe('combat unit balance table', () => {
  it('keeps offense units attack-forward and defense units defense-forward', () => {
    expect(attackPower('Soldier')).toBeGreaterThan(defensePower('Soldier'));
    expect(attackPower('Knight')).toBeGreaterThan(defensePower('Knight'));
    expect(attackPower('Berserker')).toBeGreaterThan(defensePower('Berserker'));

    expect(defensePower('Guard')).toBeGreaterThan(attackPower('Guard'));
    expect(defensePower('Archer')).toBeGreaterThan(attackPower('Archer'));
    expect(defensePower('Royal Guard')).toBeGreaterThan(
      attackPower('Royal Guard'),
    );
  });

  it('matches defense tiers against corresponding offense tier pressure', () => {
    expect(defensePower('Guard')).toBeGreaterThanOrEqual(
      attackPower('Soldier'),
    );
    expect(defensePower('Archer')).toBeGreaterThanOrEqual(
      attackPower('Knight'),
    );
    expect(defensePower('Royal Guard')).toBeGreaterThanOrEqual(
      attackPower('Berserker'),
    );
  });

  it('preserves ranged counterplay without making ranged attack the primary defense stat', () => {
    const archer = getUnit('Archer');
    const royalGuard = getUnit('Royal Guard');

    expect(archer.RangedAtkPower ?? 0).toBeGreaterThan(0);
    expect(archer.RangedDefPower ?? 0).toBeGreaterThan(
      archer.RangedAtkPower ?? 0,
    );
    expect(royalGuard.RangedAtkPower ?? 0).toBe(0);
    expect(royalGuard.MeleeDefPower ?? 0).toBeGreaterThan(
      royalGuard.MeleeAtkPower ?? 0,
    );
  });
});
