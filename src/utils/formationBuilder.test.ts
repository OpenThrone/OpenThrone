import { describe, expect, it } from 'bun:test';

import {
  buildBattleArmyState,
  buildUnitFormations,
  calculateArmyStrengthFromFormations,
  sumPhaseAttackPower,
  sumPhaseDefensePower,
} from './attackFunctions';
import type { BattleUserLike, BattleUnits } from '@/types/typings';
import type { BattleArmyState, CombatRole } from '@/types/combat';

function makeUser(
  overrides: Partial<{
    units: BattleUnits[];
    mercenaries: BattleUnits[];
    items: any[];
    battle_upgrades: any[];
    attackBonus: number;
    defenseBonus: number;
    structure_upgrades: any[];
  }> = {},
): BattleUserLike {
  return {
    id: 1,
    displayName: 'TestUser',
    level: 10,
    race: 'HUMAN',
    fortLevel: 3,
    fortHitpoints: 500,
    gold: BigInt(100000),
    attackBonus: overrides.attackBonus ?? 0,
    defenseBonus: overrides.defenseBonus ?? 0,
    items: overrides.items ?? [],
    battle_upgrades: overrides.battle_upgrades ?? [],
    structure_upgrades: overrides.structure_upgrades ?? [],
    units: overrides.units ?? [],
    mercenaries: overrides.mercenaries ?? [],
  } as BattleUserLike;
}

describe('buildUnitFormations', () => {
  it('returns empty array for zero-quantity unit', () => {
    const user = makeUser();
    const result = buildUnitFormations(
      { type: 'OFFENSE', level: 1, quantity: 0, currentHP: 10, isMercenary: false },
      user,
      'OFFENSE',
    );
    expect(result).toEqual([]);
  });

  it('returns single MELEE formation when no weapons equipped', () => {
    const user = makeUser({
      units: [{ type: 'OFFENSE', level: 1, quantity: 50, currentHP: 10, isMercenary: false }],
    });
    const result = buildUnitFormations(
      { type: 'OFFENSE', level: 1, quantity: 50, currentHP: 10, isMercenary: false },
      user,
      'OFFENSE',
    );
    expect(result).toHaveLength(1);
    expect(result[0].combatRole).toBe('MELEE');
    expect(result[0].quantity).toBe(50);
    expect(result[0].type).toBe('OFFENSE');
    expect(result[0].level).toBe(1);
  });

  it('splits into MELEE and RANGED when ranged weapons partially cover units', () => {
    const user = makeUser({
      items: [
        { usage: 'DEFENSE', type: 'WEAPON', level: 1, quantity: 30 },
      ],
    });
    const result = buildUnitFormations(
      { type: 'DEFENSE', level: 1, quantity: 100, currentHP: 10, isMercenary: false },
      user,
      'DEFENSE',
    );
    expect(result).toHaveLength(2);

    const ranged = result.find((f) => f.combatRole === 'RANGED');
    const melee = result.find((f) => f.combatRole === 'MELEE');
    expect(ranged).toBeDefined();
    expect(melee).toBeDefined();
    expect(ranged!.quantity).toBe(30);
    expect(melee!.quantity).toBe(70);
    expect(ranged!.perUnitStats.RangedAtkPower).toBeGreaterThan(0);
  });

  it('produces only RANGED formation when all units get ranged weapons', () => {
    const user = makeUser({
      items: [
        { usage: 'DEFENSE', type: 'WEAPON', level: 1, quantity: 100 },
      ],
    });
    const result = buildUnitFormations(
      { type: 'DEFENSE', level: 1, quantity: 100, currentHP: 10, isMercenary: false },
      user,
      'DEFENSE',
    );
    expect(result).toHaveLength(1);
    expect(result[0].combatRole).toBe('RANGED');
    expect(result[0].quantity).toBe(100);
  });

  it('creates COLLATERAL role for citizen units', () => {
    const user = makeUser();
    const result = buildUnitFormations(
      { type: 'CITIZEN', level: 1, quantity: 500, currentHP: 10, isMercenary: false },
      user,
      'DEFENSE',
    );
    expect(result).toHaveLength(1);
    expect(result[0].combatRole).toBe('COLLATERAL');
    expect(result[0].quantity).toBe(500);
  });

  it('creates COLLATERAL role for worker units', () => {
    const user = makeUser();
    const result = buildUnitFormations(
      { type: 'WORKER', level: 1, quantity: 200, currentHP: 10, isMercenary: false },
      user,
      'DEFENSE',
    );
    expect(result).toHaveLength(1);
    expect(result[0].combatRole).toBe('COLLATERAL');
    expect(result[0].quantity).toBe(200);
  });

  it('ignores items for wrong usage slot', () => {
    const user = makeUser({
      items: [
        { usage: 'OFFENSE', type: 'WEAPON', level: 1, quantity: 100 },
      ],
    });
    const result = buildUnitFormations(
      { type: 'DEFENSE', level: 1, quantity: 100, currentHP: 10, isMercenary: false },
      user,
      'DEFENSE',
    );
    expect(result).toHaveLength(1);
    expect(result[0].combatRole).toBe('MELEE');
    expect(result[0].perUnitStats.RangedAtkPower).toBe(0);
  });

  it('preserves isMercenary flag', () => {
    const user = makeUser();
    const result = buildUnitFormations(
      { type: 'OFFENSE', level: 1, quantity: 10, currentHP: 10, isMercenary: true },
      user,
      'OFFENSE',
    );
    expect(result[0].isMercenary).toBe(true);
  });

  it('sets maxHP from unit definition', () => {
    const user = makeUser();
    const result = buildUnitFormations(
      { type: 'OFFENSE', level: 1, quantity: 10, currentHP: 99, isMercenary: false },
      user,
      'OFFENSE',
    );
    expect(result[0].maxHP).toBeGreaterThan(0);
  });
});

describe('buildBattleArmyState', () => {
  it('returns empty formations and collateral for user with no units', () => {
    const user = makeUser();
    const army = buildBattleArmyState(user, 'OFFENSE');
    expect(army.formations).toEqual([]);
    expect(army.collateral).toEqual([]);
  });

  it('builds offense formations from OFFENSE units only', () => {
    const user = makeUser({
      units: [
        { type: 'OFFENSE', level: 1, quantity: 50, currentHP: 10, isMercenary: false },
        { type: 'DEFENSE', level: 1, quantity: 30, currentHP: 10, isMercenary: false },
      ],
    });
    const army = buildBattleArmyState(user, 'OFFENSE');
    expect(army.formations).toHaveLength(1);
    expect(army.formations[0].type).toBe('OFFENSE');
    expect(army.formations[0].quantity).toBe(50);
  });

  it('builds defense formations from DEFENSE units only', () => {
    const user = makeUser({
      units: [
        { type: 'OFFENSE', level: 1, quantity: 50, currentHP: 10, isMercenary: false },
        { type: 'DEFENSE', level: 1, quantity: 30, currentHP: 10, isMercenary: false },
      ],
    });
    const army = buildBattleArmyState(user, 'DEFENSE');
    expect(army.formations).toHaveLength(1);
    expect(army.formations[0].type).toBe('DEFENSE');
    expect(army.formations[0].quantity).toBe(30);
  });

  it('separates citizens and workers into collateral', () => {
    const user = makeUser({
      units: [
        { type: 'DEFENSE', level: 1, quantity: 100, currentHP: 10, isMercenary: false },
        { type: 'CITIZEN', level: 1, quantity: 500, currentHP: 10, isMercenary: false },
        { type: 'WORKER', level: 1, quantity: 200, currentHP: 10, isMercenary: false },
      ],
    });
    const army = buildBattleArmyState(user, 'DEFENSE');
    expect(army.formations).toHaveLength(1);
    expect(army.formations[0].type).toBe('DEFENSE');
    expect(army.collateral).toHaveLength(2);
    expect(army.collateral.map((c) => c.type).sort()).toEqual(['CITIZEN', 'WORKER']);
  });

  it('includes mercenaries alongside regular units', () => {
    const user = makeUser({
      units: [
        { type: 'OFFENSE', level: 1, quantity: 50, currentHP: 10, isMercenary: false },
      ],
      mercenaries: [
        { type: 'OFFENSE', level: 1, quantity: 20, currentHP: 10, isMercenary: true },
      ],
    });
    const army = buildBattleArmyState(user, 'OFFENSE');
    expect(army.formations).toHaveLength(2);
    const totalQty = army.formations.reduce((sum, f) => sum + f.quantity, 0);
    expect(totalQty).toBe(70);
  });

  it('splits defense units into melee and ranged when ranged weapons exist', () => {
    const user = makeUser({
      units: [
        { type: 'DEFENSE', level: 1, quantity: 100, currentHP: 10, isMercenary: false },
      ],
      items: [
        { usage: 'DEFENSE', type: 'WEAPON', level: 1, quantity: 40 },
      ],
    });
    const army = buildBattleArmyState(user, 'DEFENSE');
    expect(army.formations).toHaveLength(2);
    const ranged = army.formations.find((f) => f.combatRole === 'RANGED');
    const melee = army.formations.find((f) => f.combatRole === 'MELEE');
    expect(ranged!.quantity).toBe(40);
    expect(melee!.quantity).toBe(60);
  });

  it('skips zero-quantity units', () => {
    const user = makeUser({
      units: [
        { type: 'OFFENSE', level: 1, quantity: 0, currentHP: 10, isMercenary: false },
        { type: 'OFFENSE', level: 1, quantity: 50, currentHP: 10, isMercenary: false },
      ],
    });
    const army = buildBattleArmyState(user, 'OFFENSE');
    expect(army.formations).toHaveLength(1);
    expect(army.formations[0].quantity).toBe(50);
  });

  it('handles multi-level units as separate formations', () => {
    const user = makeUser({
      units: [
        { type: 'DEFENSE', level: 1, quantity: 50, currentHP: 10, isMercenary: false },
        { type: 'DEFENSE', level: 2, quantity: 30, currentHP: 20, isMercenary: false },
      ],
    });
    const army = buildBattleArmyState(user, 'DEFENSE');
    expect(army.formations).toHaveLength(2);
    const levels = army.formations.map((f) => f.level).sort();
    expect(levels).toEqual([1, 2]);
  });
});

describe('no-rescramble invariant', () => {
  it('total formation quantity equals total unit quantity for offense', () => {
    const user = makeUser({
      units: [
        { type: 'OFFENSE', level: 1, quantity: 100, currentHP: 10, isMercenary: false },
      ],
    });
    const army = buildBattleArmyState(user, 'OFFENSE');
    const totalQty = army.formations.reduce((s, f) => s + f.quantity, 0);
    expect(totalQty).toBe(100);
  });

  it('total formation + collateral quantity equals all units', () => {
    const user = makeUser({
      units: [
        { type: 'OFFENSE', level: 1, quantity: 100, currentHP: 10, isMercenary: false },
        { type: 'CITIZEN', level: 1, quantity: 500, currentHP: 10, isMercenary: false },
        { type: 'WORKER', level: 1, quantity: 200, currentHP: 10, isMercenary: false },
      ],
    });
    const army = buildBattleArmyState(user, 'OFFENSE');
    const formQty = army.formations.reduce((s, f) => s + f.quantity, 0);
    const collQty = army.collateral.reduce((s, f) => s + f.quantity, 0);
    expect(formQty).toBe(100);
    expect(collQty).toBe(700);
    expect(formQty + collQty).toBe(800);
  });

  it('ranged + melee quantities sum to original unit quantity after split', () => {
    const user = makeUser({
      units: [
        { type: 'DEFENSE', level: 1, quantity: 100, currentHP: 10, isMercenary: false },
      ],
      items: [
        { usage: 'DEFENSE', type: 'WEAPON', level: 1, quantity: 30 },
      ],
    });
    const army = buildBattleArmyState(user, 'DEFENSE');
    const totalQty = army.formations.reduce((s, f) => s + f.quantity, 0);
    expect(totalQty).toBe(100);
    expect(army.formations).toHaveLength(2);
  });

  it('rebuilding army state from same user data produces identical results', () => {
    const user = makeUser({
      units: [
        { type: 'DEFENSE', level: 1, quantity: 100, currentHP: 10, isMercenary: false },
      ],
      items: [
        { usage: 'DEFENSE', type: 'WEAPON', level: 1, quantity: 40 },
      ],
    });
    const army1 = buildBattleArmyState(user, 'DEFENSE');
    const army2 = buildBattleArmyState(user, 'DEFENSE');
    expect(army1.formations).toHaveLength(army2.formations.length);
    for (let i = 0; i < army1.formations.length; i++) {
      expect(army1.formations[i].quantity).toBe(army2.formations[i].quantity);
      expect(army1.formations[i].combatRole).toBe(army2.formations[i].combatRole);
      expect(army1.formations[i].perUnitStats).toEqual(army2.formations[i].perUnitStats);
    }
  });
});

describe('calculateArmyStrengthFromFormations', () => {
  it('returns zero strength for empty army', () => {
    const army: BattleArmyState = { formations: [], collateral: [] };
    const str = calculateArmyStrengthFromFormations(army);
    expect(str.meleeAtkPower).toBe(0);
    expect(str.meleeDefPower).toBe(0);
    expect(str.rangedAtkPower).toBe(0);
    expect(str.rangedDefPower).toBe(0);
  });

  it('aggregates strength across multiple formations', () => {
    const army: BattleArmyState = {
      formations: [
        {
          type: 'DEFENSE', level: 1, combatRole: 'MELEE' as CombatRole, quantity: 50,
          currentHP: 10, maxHP: 10, isMercenary: false,
          perUnitStats: { MeleeAtkPower: 3, MeleeDefPower: 5, RangedAtkPower: 0, RangedDefPower: 0 },
        },
        {
          type: 'DEFENSE', level: 2, combatRole: 'MELEE' as CombatRole, quantity: 30,
          currentHP: 20, maxHP: 20, isMercenary: false,
          perUnitStats: { MeleeAtkPower: 5, MeleeDefPower: 10, RangedAtkPower: 0, RangedDefPower: 5 },
        },
      ],
      collateral: [],
    };
    const str = calculateArmyStrengthFromFormations(army);
    expect(str.meleeAtkPower).toBe(3 * 50 + 5 * 30);
    expect(str.meleeDefPower).toBe(5 * 50 + 10 * 30);
    expect(str.rangedDefPower).toBe(0 * 50 + 5 * 30);
  });

  it('filters by combat role when roleFilter is provided', () => {
    const army: BattleArmyState = {
      formations: [
        {
          type: 'DEFENSE', level: 1, combatRole: 'MELEE' as CombatRole, quantity: 50,
          currentHP: 10, maxHP: 10, isMercenary: false,
          perUnitStats: { MeleeAtkPower: 3, MeleeDefPower: 5, RangedAtkPower: 0, RangedDefPower: 0 },
        },
        {
          type: 'DEFENSE', level: 1, combatRole: 'RANGED' as CombatRole, quantity: 40,
          currentHP: 10, maxHP: 10, isMercenary: false,
          perUnitStats: { MeleeAtkPower: 1, MeleeDefPower: 2, RangedAtkPower: 8, RangedDefPower: 3 },
        },
      ],
      collateral: [],
    };
    const meleeStr = calculateArmyStrengthFromFormations(army, 'MELEE');
    expect(meleeStr.meleeAtkPower).toBe(3 * 50);
    expect(meleeStr.rangedAtkPower).toBe(0);

    const rangedStr = calculateArmyStrengthFromFormations(army, 'RANGED');
    expect(rangedStr.rangedAtkPower).toBe(8 * 40);
    expect(rangedStr.meleeAtkPower).toBe(1 * 40);
  });
});

describe('sumPhaseAttackPower', () => {
  it('sums melee attack for MELEE role', () => {
    const army: BattleArmyState = {
      formations: [
        {
          type: 'OFFENSE', level: 1, combatRole: 'MELEE' as CombatRole, quantity: 100,
          currentHP: 10, maxHP: 10, isMercenary: false,
          perUnitStats: { MeleeAtkPower: 5, MeleeDefPower: 2, RangedAtkPower: 0, RangedDefPower: 1 },
        },
      ],
      collateral: [],
    };
    expect(sumPhaseAttackPower(army, 'melee')).toBe(500);
    expect(sumPhaseAttackPower(army, 'ranged')).toBe(0);
  });

  it('sums ranged attack for RANGED role', () => {
    const army: BattleArmyState = {
      formations: [
        {
          type: 'DEFENSE', level: 1, combatRole: 'RANGED' as CombatRole, quantity: 30,
          currentHP: 10, maxHP: 10, isMercenary: false,
          perUnitStats: { MeleeAtkPower: 1, MeleeDefPower: 2, RangedAtkPower: 8, RangedDefPower: 3 },
        },
      ],
      collateral: [],
    };
    expect(sumPhaseAttackPower(army, 'ranged')).toBe(240);
    expect(sumPhaseAttackPower(army, 'melee')).toBe(0);
  });
});

describe('sumPhaseDefensePower', () => {
  it('sums MeleeDefPower from all formations', () => {
    const army: BattleArmyState = {
      formations: [
        {
          type: 'DEFENSE', level: 1, combatRole: 'MELEE' as CombatRole, quantity: 80,
          currentHP: 10, maxHP: 10, isMercenary: false,
          perUnitStats: { MeleeAtkPower: 3, MeleeDefPower: 5, RangedAtkPower: 0, RangedDefPower: 0 },
        },
        {
          type: 'DEFENSE', level: 1, combatRole: 'RANGED' as CombatRole, quantity: 30,
          currentHP: 10, maxHP: 10, isMercenary: false,
          perUnitStats: { MeleeAtkPower: 1, MeleeDefPower: 2, RangedAtkPower: 8, RangedDefPower: 3 },
        },
      ],
      collateral: [],
    };
    expect(sumPhaseDefensePower(army, 'MeleeDefPower')).toBe(5 * 80 + 2 * 30);
    expect(sumPhaseDefensePower(army, 'RangedDefPower')).toBe(0 * 80 + 3 * 30);
  });

  it('returns 0 for empty army', () => {
    const army: BattleArmyState = { formations: [], collateral: [] };
    expect(sumPhaseDefensePower(army, 'MeleeDefPower')).toBe(0);
  });
});

describe('formation quantity invariants', () => {
  it('formation quantities can be summed by type manually', () => {
    const army: BattleArmyState = {
      formations: [
        {
          type: 'OFFENSE', level: 1, combatRole: 'MELEE' as CombatRole, quantity: 80,
          currentHP: 10, maxHP: 10, isMercenary: false,
          perUnitStats: { MeleeAtkPower: 5, MeleeDefPower: 2, RangedAtkPower: 0, RangedDefPower: 1 },
        },
        {
          type: 'DEFENSE', level: 1, combatRole: 'MELEE' as CombatRole, quantity: 50,
          currentHP: 10, maxHP: 10, isMercenary: false,
          perUnitStats: { MeleeAtkPower: 3, MeleeDefPower: 5, RangedAtkPower: 0, RangedDefPower: 0 },
        },
      ],
      collateral: [
        {
          type: 'CITIZEN', level: 1, combatRole: 'COLLATERAL' as CombatRole, quantity: 200,
          currentHP: 10, maxHP: 10, isMercenary: false,
          perUnitStats: { MeleeAtkPower: 1, MeleeDefPower: 1, RangedAtkPower: 0, RangedDefPower: 0 },
        },
        {
          type: 'WORKER', level: 1, combatRole: 'COLLATERAL' as CombatRole, quantity: 100,
          currentHP: 10, maxHP: 10, isMercenary: false,
          perUnitStats: { MeleeAtkPower: 1, MeleeDefPower: 1, RangedAtkPower: 0, RangedDefPower: 0 },
        },
      ],
    };

    const offenseQty = army.formations.filter((f) => f.type === 'OFFENSE').reduce((s, f) => s + f.quantity, 0);
    const defenseQty = army.formations.filter((f) => f.type === 'DEFENSE').reduce((s, f) => s + f.quantity, 0);
    const citizenQty = army.collateral.filter((f) => f.type === 'CITIZEN').reduce((s, f) => s + f.quantity, 0);
    const workerQty = army.collateral.filter((f) => f.type === 'WORKER').reduce((s, f) => s + f.quantity, 0);

    expect(offenseQty).toBe(80);
    expect(defenseQty).toBe(50);
    expect(citizenQty).toBe(200);
    expect(workerQty).toBe(100);
    expect(offenseQty + defenseQty).toBe(army.formations.reduce((s, f) => s + f.quantity, 0));
    expect(citizenQty + workerQty).toBe(army.collateral.reduce((s, f) => s + f.quantity, 0));
  });
});
