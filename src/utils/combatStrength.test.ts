import { describe, expect, test } from 'bun:test';

import {
  calculateCombatBreakdown,
  calculateCombatStrength,
} from './combatStrength';

const user = {
  race: 'HUMAN',
  fortLevel: 4,
  attackBonus: 10,
  units: [
    { type: 'OFFENSE', level: 1, quantity: 60 },
    { type: 'OFFENSE', level: 2, quantity: 22 },
  ],
};

describe('calculateCombatBreakdown', () => {
  test('lists the units behind the offense number and matches the headline stat', () => {
    const breakdown = calculateCombatBreakdown(user, 'OFFENSE');
    const { totalStats } = calculateCombatStrength(user, 'OFFENSE');

    expect(breakdown.units.map((row) => row.quantity)).toEqual([22, 60]);
    expect(breakdown.unitsTotal).toBeGreaterThan(0);
    expect(breakdown.finalTotal).toBe(
      totalStats.MeleeAtkPower + totalStats.RangedAtkPower,
    );
  });

  test('units, items, upgrades and bonuses add up to the final total', () => {
    const b = calculateCombatBreakdown(user, 'OFFENSE');
    expect(b.unitsTotal + b.itemsTotal + b.upgradesTotal + b.bonusAmount).toBe(
      b.finalTotal,
    );
  });

  test('has no units and a zero total for an empty army', () => {
    const b = calculateCombatBreakdown({ race: 'HUMAN' }, 'OFFENSE');
    expect(b.units).toEqual([]);
    expect(b.finalTotal).toBe(0);
  });
});
