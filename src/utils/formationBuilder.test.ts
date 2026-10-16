import { describe, expect, it } from 'bun:test';

import { ItemTypes, UnitTypes } from '@/constants';
import {
  buildBattleArmyState,
  calculateArmyStrengthFromFormations,
} from '@/utils/attackFunctions';
import {
  buildCombatFormations,
  calculateCombatStrength,
  type CombatStrengthUser,
} from '@/utils/combatStrength';

const soldier = UnitTypes.find(
  (unit) => unit.type === 'OFFENSE' && unit.level === 1,
)!;
const dagger = ItemTypes.find(
  (item) =>
    item.usage === 'OFFENSE' && item.type === 'WEAPON' && item.level === 1,
)!;
const armor = ItemTypes.find(
  (item) =>
    item.usage === 'OFFENSE' && item.type === 'ARMOR' && item.level === 1,
)!;

function army(overrides: Partial<CombatStrengthUser> = {}): CombatStrengthUser {
  return {
    race: 'ALL',
    fortLevel: 16,
    units: [{ type: 'OFFENSE', level: 1, quantity: 500 }],
    items: [],
    mercenaries: [],
    battle_upgrades: [],
    structure_upgrades: [
      { type: 'ARMORY', level: 6 },
      { type: 'OFFENSE', level: 16 },
    ],
    ...overrides,
  };
}

// Keep the full shared stat breakdown, rather than testing copies or incidental group counts.
describe('shared combat allocation', () => {
  it('one weapon and armor equip exactly one soldier each, not an entire stack', () => {
    const user = army({
      items: [
        { usage: 'OFFENSE', type: 'WEAPON', level: 1, quantity: 1 },
        { usage: 'OFFENSE', type: 'ARMOR', level: 1, quantity: 1 },
      ],
    });
    const strength = calculateCombatStrength(user, 'OFFENSE');
    expect(strength.baseStats.MeleeAtkPower).toBe(500 * soldier.MeleeAtkPower!);
    expect(strength.itemStats.MeleeAtkPower).toBe(
      dagger.MeleeAtkPower! + armor.MeleeAtkPower!,
    );
    expect(strength.itemStats.MeleeDefPower).toBe(
      dagger.MeleeDefPower! + armor.MeleeDefPower!,
    );
    const formations = buildCombatFormations(user, 'OFFENSE');
    const equipped = formations.filter(
      (formation) =>
        formation.perUnitStats.MeleeAtkPower > soldier.MeleeAtkPower!,
    );
    expect(
      equipped.reduce((sum, formation) => sum + formation.quantity, 0),
    ).toBe(1);
    expect(
      formations.reduce((sum, formation) => sum + formation.quantity, 0),
    ).toBe(500);
  });

  it('splitting and reordering inventory, regular and mercenary rows cannot create power', () => {
    const user = army({
      units: [
        { type: 'OFFENSE', level: 2, quantity: 8 },
        { type: 'OFFENSE', level: 1, quantity: 10 },
      ],
      mercenaries: [{ type: 'OFFENSE', level: 2, quantity: 7 }],
      items: [
        { usage: 'OFFENSE', type: 'WEAPON', level: 1, quantity: 5 },
        { usage: 'OFFENSE', type: 'ARMOR', level: 1, quantity: 3 },
      ],
      battle_upgrades: [{ type: 'OFFENSE', level: 1, quantity: 4 }],
    });
    const reordered = army({
      ...user,
      units: [
        { type: 'OFFENSE', level: 1, quantity: 4 },
        { type: 'OFFENSE', level: 2, quantity: 3 },
        { type: 'OFFENSE', level: 1, quantity: 6 },
        { type: 'OFFENSE', level: 2, quantity: 5 },
      ],
      mercenaries: [
        { type: 'OFFENSE', level: 2, quantity: 2 },
        { type: 'OFFENSE', level: 2, quantity: 5 },
      ],
      items: [
        { usage: 'OFFENSE', type: 'ARMOR', level: 1, quantity: 3 },
        { usage: 'OFFENSE', type: 'WEAPON', level: 1, quantity: 2 },
        { usage: 'OFFENSE', type: 'WEAPON', level: 1, quantity: 3 },
      ],
      battle_upgrades: [
        { type: 'OFFENSE', level: 1, quantity: 1 },
        { type: 'OFFENSE', level: 1, quantity: 3 },
      ],
    });
    expect(calculateCombatStrength(reordered, 'OFFENSE')).toEqual(
      calculateCombatStrength(user, 'OFFENSE'),
    );
    expect(buildCombatFormations(reordered, 'OFFENSE')).toEqual(
      buildCombatFormations(user, 'OFFENSE'),
    );
    expect(
      calculateCombatStrength(user, 'OFFENSE').itemStats.MeleeAtkPower,
    ).toBe(5 * dagger.MeleeAtkPower! + 3 * armor.MeleeAtkPower!);
  });

  it('limited dispatch selects eligible highest tiers and consumes gear only once', () => {
    const user = army({
      units: [
        { type: 'OFFENSE', level: 1, quantity: 100 },
        { type: 'OFFENSE', level: 3, quantity: 2 },
      ],
      mercenaries: [{ type: 'OFFENSE', level: 3, quantity: 3 }],
      items: [{ usage: 'OFFENSE', type: 'WEAPON', level: 1, quantity: 1 }],
    });
    const formations = buildCombatFormations(user, 'OFFENSE', {
      unitLevels: [3],
      limit: 4,
    });
    expect(formations.every((formation) => formation.level === 3)).toBe(true);
    expect(
      formations.reduce((sum, formation) => sum + formation.quantity, 0),
    ).toBe(4);
    expect(
      formations
        .filter((formation) => !formation.isMercenary)
        .reduce((sum, formation) => sum + formation.quantity, 0),
    ).toBe(2);
    expect(
      calculateCombatStrength(user, 'OFFENSE', { unitLevels: [3], limit: 4 })
        .itemStats.MeleeAtkPower,
    ).toBe(dagger.MeleeAtkPower!);
    expect(buildCombatFormations(user, 'OFFENSE', { limit: 0 })).toEqual([]);
  });

  it('row IDs do not choose the catalog entry, and wrong role or higher tier gear is excluded', () => {
    const user = army({
      items: [
        { id: 987654, usage: 'OFFENSE', type: 'WEAPON', level: 1, quantity: 2 },
        {
          id: 987655,
          usage: 'DEFENSE',
          type: 'ARMOR',
          level: 1,
          quantity: 500,
        },
        {
          id: 987656,
          usage: 'OFFENSE',
          type: 'ARMOR',
          level: 2,
          quantity: 500,
        },
      ] as unknown as CombatStrengthUser['items'],
    });
    expect(
      calculateCombatStrength(user, 'OFFENSE').itemStats.MeleeAtkPower,
    ).toBe(2 * dagger.MeleeAtkPower!);
    expect(
      calculateCombatStrength(user, 'OFFENSE').itemStats.MeleeDefPower,
    ).toBe(2 * dagger.MeleeDefPower!);
  });

  it('upgrade capacity is shared across eligible tiers and mercenaries', () => {
    const user = army({
      units: [
        { type: 'DEFENSE', level: 3, quantity: 3 },
        { type: 'DEFENSE', level: 2, quantity: 4 },
        { type: 'DEFENSE', level: 1, quantity: 100 },
      ],
      mercenaries: [{ type: 'DEFENSE', level: 3, quantity: 2 }],
      battle_upgrades: [{ type: 'DEFENSE', level: 1, quantity: 1 }],
    });
    const strength = calculateCombatStrength(user, 'DEFENSE');
    expect(strength.upgradeStats.MeleeDefPower).toBe(150);
    expect(strength.upgradeStats.RangedAtkPower).toBe(50);
    const locked = calculateCombatStrength(
      { ...user, structure_upgrades: [{ type: 'OFFENSE', level: 5 }] },
      'DEFENSE',
    );
    expect(locked.upgradeStats.MeleeDefPower).toBe(0);
  });

  it('ranged weapon coverage is bounded while native archer ranged power participates', () => {
    const user = army({
      units: [
        { type: 'DEFENSE', level: 1, quantity: 100 },
        { type: 'DEFENSE', level: 2, quantity: 10 },
      ],
      items: [{ usage: 'DEFENSE', type: 'WEAPON', level: 1, quantity: 3 }],
    });
    const rangedWeapon = ItemTypes.find(
      (item) =>
        item.usage === 'DEFENSE' && item.type === 'WEAPON' && item.level === 1,
    )!;
    const archer = UnitTypes.find(
      (unit) => unit.type === 'DEFENSE' && unit.level === 2,
    )!;
    expect(
      calculateCombatStrength(user, 'DEFENSE').totalStats.RangedAtkPower,
    ).toBe(10 * archer.RangedAtkPower! + 3 * rangedWeapon.RangedAtkPower!);
  });

  it('formation totals and aggregate stats apply the same bonuses without per-unit rounding', () => {
    const user = army({
      attackBonus: 13,
      race: 'HUMAN',
      items: [{ usage: 'OFFENSE', type: 'ARMOR', level: 1, quantity: 1 }],
    });
    const formations = buildCombatFormations(user, 'OFFENSE');
    const aggregate = calculateCombatStrength(user, 'OFFENSE').totalStats;
    for (const key of [
      'MeleeAtkPower',
      'MeleeDefPower',
      'RangedAtkPower',
      'RangedDefPower',
    ] as const) {
      expect(
        Math.ceil(
          formations.reduce(
            (sum, formation) =>
              sum + formation.perUnitStats[key] * formation.quantity,
            0,
          ),
        ),
      ).toBe(aggregate[key]);
    }
    expect(
      calculateCombatStrength(user, 'OFFENSE', { multiplier: 1 }).totalStats
        .MeleeAtkPower,
    ).toBe(500 * soldier.MeleeAtkPower! + armor.MeleeAtkPower!);
  });

  it('keeps collateral separate and conserves quantities without mutating stock', () => {
    const user = army({
      units: [
        {
          id: 1,
          userId: 1,
          isMercenary: false,
          type: 'OFFENSE',
          level: 1,
          quantity: 10,
        },
        {
          id: 2,
          userId: 1,
          isMercenary: false,
          type: 'WORKER',
          level: 1,
          quantity: 20,
        },
      ] as unknown as NonNullable<CombatStrengthUser['units']>,
    });
    const snapshot = structuredClone(user);
    const result = buildBattleArmyState(
      user as Parameters<typeof buildBattleArmyState>[0],
      'OFFENSE',
    );
    expect(
      result.formations.reduce((sum, formation) => sum + formation.quantity, 0),
    ).toBe(10);
    expect(
      result.collateral.reduce((sum, formation) => sum + formation.quantity, 0),
    ).toBe(20);
    expect(calculateArmyStrengthFromFormations(result).meleeAtkPower).toBe(
      10 * soldier.MeleeAtkPower!,
    );
    expect(user).toEqual(snapshot);
  });
});
