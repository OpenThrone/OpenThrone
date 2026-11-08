import { describe, expect, test } from 'bun:test';

import { ItemTypes, UnitTypes } from '@/constants';
import type { UnitType } from '@/types/typings';

import {
  calculateCombatBreakdown,
  calculateCombatStrength,
  headlineStatValue,
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

describe('headlineStatValue (playtest #293/#294/#295)', () => {
  // The headline each role shows on Overview.
  const headline = (
    stats: ReturnType<typeof calculateCombatStrength>['totalStats'],
    usage: string,
  ) =>
    usage === 'OFFENSE'
      ? stats.MeleeAtkPower + stats.RangedAtkPower
      : usage === 'SPY'
        ? stats.MeleeAtkPower
        : stats.MeleeDefPower;

  test('every armory card value is what the item adds to its headline stat', () => {
    for (const item of ItemTypes) {
      // Items only equip units of their tier or above.
      if (
        !UnitTypes.some((u) => u.type === item.usage && u.level >= item.level)
      )
        continue;
      const usage = item.usage as UnitType;
      const base = {
        race: 'HUMAN',
        units: [{ type: item.usage, level: item.level, quantity: 1 }],
        structure_upgrades: [{ type: 'ARMORY', level: item.armoryLevel ?? 1 }],
      };
      const without = calculateCombatStrength(base, usage, {
        multiplier: 1,
      }).totalStats;
      const withItem = calculateCombatStrength(
        {
          ...base,
          items: [
            {
              usage: item.usage,
              type: item.type,
              level: item.level,
              quantity: 1,
            },
          ],
        },
        usage,
        { multiplier: 1 },
      ).totalStats;
      expect([item.id, headlineStatValue(item, item.usage)]).toEqual([
        item.id,
        headline(withItem, item.usage) - headline(without, item.usage),
      ]);
    }
  });

  test('every training card value is what one unit adds to its headline stat', () => {
    for (const unit of UnitTypes) {
      if (!['OFFENSE', 'DEFENSE', 'SPY', 'SENTRY'].includes(unit.type))
        continue;
      const total = calculateCombatStrength(
        {
          race: 'HUMAN',
          units: [{ type: unit.type, level: unit.level, quantity: 1 }],
        },
        unit.type,
        { multiplier: 1 },
      ).totalStats;
      expect([unit.name, headlineStatValue(unit, unit.type)]).toEqual([
        unit.name,
        headline(total, unit.type),
      ]);
    }
  });

  test('reported cards: spy Sling +20, defense Sling +5, Soldier +5', () => {
    const find = (usage: string, name: string) =>
      ItemTypes.find((item) => item.usage === usage && item.name === name)!;
    expect(headlineStatValue(find('SPY', 'Sling'), 'SPY')).toBe(20);
    expect(headlineStatValue(find('SPY', 'Dark Cloth Armor'), 'SPY')).toBe(4);
    expect(headlineStatValue(find('DEFENSE', 'Sling'), 'DEFENSE')).toBe(5);
    const soldier = UnitTypes.find((unit) => unit.name === 'Soldier')!;
    expect(headlineStatValue(soldier, 'OFFENSE')).toBe(5);
  });
});

describe('collateral fallback (playtest #341)', () => {
  const civilians = {
    race: 'HUMAN',
    fortLevel: 1,
    units: [
      { type: 'CITIZEN', level: 1, quantity: 40 },
      { type: 'WORKER', level: 1, quantity: 39 },
      { type: 'SPY', level: 1, quantity: 6 },
    ],
  };

  test('citizens and workers stand in for an empty defense line', () => {
    const { totalStats } = calculateCombatStrength(civilians, 'DEFENSE', {
      collateralFallback: true,
    });
    expect(totalStats.MeleeDefPower).toBeGreaterThan(0);
  });

  test('spy defense with no sentries is zero, as in spy missions', () => {
    const shown = calculateCombatStrength(civilians, 'SENTRY', {
      collateralFallback: true,
    });
    const mission = calculateCombatStrength(civilians, 'SENTRY');
    expect(shown.totalStats.MeleeDefPower).toBe(0);
    expect(shown.totalStats.MeleeDefPower).toBe(
      mission.totalStats.MeleeDefPower,
    );
  });
});
