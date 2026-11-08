import { beforeEach, describe, expect, it } from 'bun:test';
import { mtRandImpl } from 'test/utils/mockMtRand';

import {
  ArmoryUpgrades,
  BattleUpgrades,
  Bonuses,
  Fortifications,
  HouseUpgrades,
  ItemTypes,
  levelXPArray,
  OffensiveUpgrades,
  SentryUpgrades,
  SpyUpgrades,
  UnitTypes,
} from '@/constants';
import {
  DEFENDER_FATIGUE_MIN_MULTIPLIER,
  DEFENDER_FATIGUE_PER_PRESSURE,
} from '@/constants/KingdomMorale';
import { BattleUser } from '@/models/BattleUser';
import { SpyUser } from '@/models/SpyUser';
import { UserStatsService } from '@/services/UserStatsService';
import { runSingleBattle } from '@/sim/engine';
import { createSimPlayer } from '@/sim/presets';
import {
  calculatePillageBudget,
  calculateProgressionXpPerTurn,
  executeAttack,
} from '@/utils/attackFunctions';
import {
  type CombatRuleset,
  deriveCombatRuleset,
} from '@/utils/balance/combatRuleset';
import {
  COMBAT_RULESETS,
  CURRENT_COMBAT_RULESET,
  getCombatRuleset,
} from '@/utils/balance/combatRulesets';
import { getRaceIdentity, V5_COMBAT_CONSTANTS } from '@/utils/balance/v5Combat';
import { createSeededRandom } from '@/utils/random';

beforeEach(() => {
  // Other test files in this process may leak a global mtRand mock.
  mtRandImpl.fn = ((min = 0, max = 1, random?: () => number) =>
    (random ?? Math.random)() * (max - min) + min) as any;
});

const pick = (row: object, keys: string[]) =>
  Object.fromEntries(
    keys
      .filter((key) => (row as Record<string, unknown>)[key] !== undefined)
      .map((key) => [key, (row as Record<string, unknown>)[key]]),
  );

describe('combat ruleset registry', () => {
  it('holds combat-v9 and combat-v10, which is the current ruleset', () => {
    expect(Object.keys(COMBAT_RULESETS)).toEqual(['combat-v9', 'combat-v10']);
    expect(CURRENT_COMBAT_RULESET).toBe(COMBAT_RULESETS['combat-v10']!);
    expect(CURRENT_COMBAT_RULESET.version).toBe('combat-v10');
  });

  it('spreads casualties from combat-v10 on and leaves v9 lowest-first', () => {
    expect(COMBAT_RULESETS['combat-v9']!.casualtySpread).toBeUndefined();
    expect(COMBAT_RULESETS['combat-v10']!.casualtySpread).toBe(true);
    // v10 changes nothing else: every table and constant is v9's.
    const {
      casualtySpread: _spread,
      version: _v,
      ...v10
    } = COMBAT_RULESETS['combat-v10']!;
    const {
      casualtySpread: _s9,
      version: _v9,
      ...v9
    } = COMBAT_RULESETS['combat-v9']!;
    expect(JSON.stringify(v10)).toBe(JSON.stringify(v9));
  });

  it('picks a ruleset by the stored formula version', () => {
    expect(getCombatRuleset('combat-v10')).toBe(CURRENT_COMBAT_RULESET);
    expect(getCombatRuleset('combat-v9')).toBe(COMBAT_RULESETS['combat-v9']);
    // v7 and v8 were fought under rules a ruleset cannot rebuild.
    expect(getCombatRuleset('combat-v8')).toBeUndefined();
    expect(getCombatRuleset('combat-v7')).toBeUndefined();
    expect(getCombatRuleset('unsupported-formula')).toBeUndefined();
    expect(getCombatRuleset('toString')).toBeUndefined();
    expect(getCombatRuleset(undefined)).toBeUndefined();
    expect(getCombatRuleset(9)).toBeUndefined();
  });

  it('is frozen all the way down', () => {
    const ruleset = CURRENT_COMBAT_RULESET as any;
    expect(() => {
      ruleset.constants.WOUNDED_SHARE = 0.9;
    }).toThrow();
    expect(() => {
      ruleset.units[0].hp = 1;
    }).toThrow();
    expect(() => ruleset.fortifications.push({})).toThrow();
    expect(() => {
      ruleset.race.HUMAN.offenseMultiplier = 9;
    }).toThrow();
  });
});

describe('deriveCombatRuleset', () => {
  it('builds the next version as the previous one plus overrides', () => {
    const next = deriveCombatRuleset(CURRENT_COMBAT_RULESET, 'combat-test', {
      constants: {
        WOUNDED_SHARE: 0.5,
        FORT_DAMAGE: { MAX_SHARE_PER_TURN: 0.1 },
      },
      defenderFatigue: { minMultiplier: 0.9 },
    });
    expect(next.version).toBe('combat-test');
    expect(next.constants.WOUNDED_SHARE).toBe(0.5);
    expect(next.constants.FORT_DAMAGE.MAX_SHARE_PER_TURN).toBe(0.1);
    // Unlisted keys carry over, nested ones included.
    expect(next.constants.FORT_DAMAGE.MIN_SHARE_PER_TURN).toBe(
      CURRENT_COMBAT_RULESET.constants.FORT_DAMAGE.MIN_SHARE_PER_TURN,
    );
    expect(next.defenderFatigue).toEqual({
      perPressure: CURRENT_COMBAT_RULESET.defenderFatigue.perPressure,
      minMultiplier: 0.9,
    });
    expect(next.units).toBe(CURRENT_COMBAT_RULESET.units);
    expect(Object.isFrozen(next.constants)).toBe(true);
  });

  it('leaves the base untouched so earlier versions keep replaying', () => {
    const before = JSON.stringify(CURRENT_COMBAT_RULESET);
    deriveCombatRuleset(CURRENT_COMBAT_RULESET, 'combat-test', {
      constants: { WOUNDED_SHARE: 0.5, CHIP_FROM_TROOPS_ONLY: false },
      fortifications: [],
    });
    expect(JSON.stringify(CURRENT_COMBAT_RULESET)).toBe(before);
    expect(CURRENT_COMBAT_RULESET.constants.WOUNDED_SHARE).toBe(0.3);
  });

  it('replaces tables whole instead of merging them row by row', () => {
    const units = CURRENT_COMBAT_RULESET.units.slice(0, 2);
    const next = deriveCombatRuleset(CURRENT_COMBAT_RULESET, 'combat-test', {
      units,
    });
    expect(next.units).toHaveLength(2);
  });
});

describe('the current ruleset mirrors the live game constants', () => {
  // The economy and UI read the live constants; combat reads the ruleset. A
  // balance change must append a new ruleset, so this fails if the live game
  // moves without one.
  const current = CURRENT_COMBAT_RULESET;
  const POWERS = [
    'MeleeAtkPower',
    'MeleeDefPower',
    'RangedAtkPower',
    'RangedDefPower',
  ];

  it('combat constants', () => {
    expect(current.constants).toEqual(V5_COMBAT_CONSTANTS);
    expect(current.battle.MAX_TURNS).toBe(V5_COMBAT_CONSTANTS.MAX_ATTACK_TURNS);
    expect(current.battle.MAX_PILLAGE_SHARE_PER_ATTACK).toBe(
      V5_COMBAT_CONSTANTS.MAX_GOLD_PILLAGE_SHARE,
    );
  });

  it('racial identity', () => {
    for (const race of ['ALL', 'HUMAN', 'ELF', 'GOBLIN', 'UNDEAD'] as const) {
      expect(getRaceIdentity(race, current.race)).toEqual(
        getRaceIdentity(race),
      );
    }
  });

  it('defender fatigue', () => {
    expect(current.defenderFatigue).toEqual({
      perPressure: DEFENDER_FATIGUE_PER_PRESSURE,
      minMultiplier: DEFENDER_FATIGUE_MIN_MULTIPLIER,
    });
  });

  it('XP per turn bands', () => {
    for (const level of [1, 10, 11, 25, 26, 50, 51, 75, 76, 100]) {
      const bandXp =
        current.xpPerTurn.bands.find((band) => level <= band.upToLevel)?.xp ??
        current.xpPerTurn.beyond;
      expect(calculateProgressionXpPerTurn(level, current)).toBe(bandXp);
    }
    expect(
      [1, 11, 26, 51, 76].map((l) => calculateProgressionXpPerTurn(l)),
    ).toEqual([360, 300, 260, 230, 200]);
  });

  it('unit, item and upgrade tables', () => {
    expect(current.units).toEqual(
      UnitTypes.map((u) =>
        pick(u, ['type', 'level', 'hp', 'cost', 'fortLevel', ...POWERS]),
      ),
    );
    expect(current.items).toEqual(
      ItemTypes.map((i) =>
        pick(i, ['id', 'usage', 'type', 'level', 'armoryLevel', ...POWERS]),
      ),
    );
    expect(current.battleUpgrades).toEqual(
      BattleUpgrades.map((u) =>
        pick(u, [
          'type',
          'level',
          'SiegeUpgradeLevel',
          'minUnitLevel',
          'unitsCovered',
          ...POWERS,
        ]),
      ),
    );
  });

  it('fort, armory, house, structure and racial bonus tables', () => {
    expect(current.levelXp).toEqual(levelXPArray.map((l) => ({ ...l })));
    expect(current.fortifications).toEqual(
      Fortifications.map((f) =>
        pick(f, [
          'level',
          'hitpoints',
          'costPerRepairPoint',
          'casualtyMitigation',
          'MeleeDefPower',
          'RangedDefPower',
          'defenseBonusPercentage',
        ]),
      ),
    );
    expect(current.armoryUpgrades).toEqual(
      ArmoryUpgrades.map((a) =>
        pick(a, ['level', 'casualtyMitigationPercentage']),
      ),
    );
    expect(current.houseUpgrades).toEqual(
      Object.keys(HouseUpgrades)
        .map(Number)
        .sort((a, b) => a - b)
        .map((key) =>
          pick((HouseUpgrades as Record<number, object>)[key]!, [
            'citizensDaily',
          ]),
        ),
    );
    expect(current.offensiveUpgrades).toEqual(
      OffensiveUpgrades.map((u) =>
        pick(u, ['level', 'offenseBonusPercentage']),
      ),
    );
    expect(current.spyUpgrades).toEqual(
      SpyUpgrades.map((u) =>
        pick(u, [
          'level',
          'offenseBonusPercentage',
          'maxInfiltratorsPerMission',
          'maxAssassinsPerMission',
        ]),
      ),
    );
    expect(current.sentryUpgrades).toEqual(
      SentryUpgrades.map((u) => pick(u, ['level', 'defenseBonusPercentage'])),
    );
    expect(current.bonuses).toEqual(
      Bonuses.map((b) => pick(b, ['race', 'bonusType', 'bonusAmount'])),
    );
  });
});

describe('the engine fights under the ruleset it is given', () => {
  const makeUser = (id: number, offense: number, defense: number) => ({
    id,
    userId: id,
    displayName: `user-${id}`,
    level: 20,
    race: 'HUMAN',
    class: 'FIGHTER',
    gold: 50_000_000n,
    fortLevel: 3,
    fortHitpoints: 200,
    units: [
      ['OFFENSE', offense],
      ['DEFENSE', defense],
      ['CITIZEN', 3000],
      ['WORKER', 3000],
    ].map(([type, quantity], index) => ({
      id: id * 100 + index,
      userId: id,
      type: type as string,
      level: 1,
      quantity: quantity as number,
      isMercenary: false,
    })),
    mercenaries: [],
    items: [],
    structure_upgrades: [],
    battle_upgrades: [],
    bonus_points: [],
  });
  const fight = async (ruleset?: CombatRuleset) =>
    JSON.parse(
      JSON.stringify(
        await executeAttack(
          makeUser(1, 3000, 100) as any,
          makeUser(2, 100, 2500) as any,
          6,
          false,
          { random: createSeededRandom('ruleset-test'), ruleset },
        ),
        (_key, value) => (typeof value === 'bigint' ? `${value}n` : value),
      ),
    );

  it('defaults to the current ruleset', async () => {
    expect(await fight()).toEqual(await fight(CURRENT_COMBAT_RULESET));
  });

  it('reads constants from the ruleset, not from module globals', async () => {
    const base = await fight();
    const noWounded = await fight(
      deriveCombatRuleset(CURRENT_COMBAT_RULESET, 'combat-test', {
        constants: { WOUNDED_SHARE: 0 },
      }),
    );
    const woundedOf = (result: any) =>
      [...result.wounded.attacker, ...result.wounded.defender].reduce(
        (sum: number, row: any) => sum + row.quantity,
        0,
      );
    expect(woundedOf(base)).toBeGreaterThan(0);
    expect(woundedOf(noWounded)).toBe(0);
  });

  it('reads unit stats from the ruleset', async () => {
    const strongKnights = deriveCombatRuleset(
      CURRENT_COMBAT_RULESET,
      'combat-test',
      {
        units: CURRENT_COMBAT_RULESET.units.map((unit) =>
          unit.type === 'OFFENSE' && unit.level === 1
            ? { ...unit, MeleeAtkPower: (unit.MeleeAtkPower ?? 0) * 2 }
            : unit,
        ),
      },
    );
    const base = await fight();
    const boosted = await fight(strongKnights);
    expect(boosted.attackerStats.meleeAtkPower).toBeGreaterThan(
      base.attackerStats.meleeAtkPower,
    );
  });

  it('reads fort and XP tables from the ruleset', async () => {
    const base = await fight();
    const next = await fight(
      deriveCombatRuleset(CURRENT_COMBAT_RULESET, 'combat-test', {
        xpPerTurn: { bands: [], beyond: 1 },
      }),
    );
    expect(next.experienceGained.attacker).toBeLessThan(
      base.experienceGained.attacker,
    );
  });

  it('keeps simulator tuning off the frozen registry rulesets', async () => {
    const before = await fight(CURRENT_COMBAT_RULESET);
    const pillageCap = (ruleset: CombatRuleset) =>
      calculatePillageBudget(1_000_000n, 0, false, 20, ruleset);
    const capBefore = pillageCap(CURRENT_COMBAT_RULESET);
    // The simulator derives a ruleset per battle instead of mutating globals,
    // so a v9 calculation made while a tuned battle is in flight is unchanged.
    const running = runSingleBattle(
      createSimPlayer({ id: 'a', level: 10, gold: 1_000_000 }),
      createSimPlayer({ id: 'd', level: 10, gold: 1_000_000 }),
      { maxPillageShare: 0.9, attackerMultiplier: 3, random: () => 0.5 },
    );
    expect(pillageCap(CURRENT_COMBAT_RULESET)).toBe(capBefore);
    await running;
    expect(pillageCap(CURRENT_COMBAT_RULESET)).toBe(capBefore);
    expect(await fight(CURRENT_COMBAT_RULESET)).toEqual(before);
    expect(await fight()).toEqual(before);
  });
});

describe('user stats follow the ruleset', () => {
  const noPerks = deriveCombatRuleset(CURRENT_COMBAT_RULESET, 'combat-test', {
    bonuses: [],
    fortifications: CURRENT_COMBAT_RULESET.fortifications.map((fort) => ({
      ...fort,
      defenseBonusPercentage: 0,
    })),
  });
  const data = {
    race: 'HUMAN',
    class: 'FIGHTER',
    fortLevel: 2,
    units: [{ type: 'OFFENSE', level: 1, quantity: 100 }] as any,
  };

  it('reads racial bonuses and fort defense from the ruleset', () => {
    const live = new UserStatsService(data, CURRENT_COMBAT_RULESET);
    const frozen = new UserStatsService(data, noPerks);
    expect(live.getAttackBonus()).toBe(10);
    expect(frozen.getAttackBonus()).toBe(0);
    expect(live.getDefenseBonus()).toBe(10);
    expect(frozen.getDefenseBonus()).toBe(0);
    expect(
      frozen.calculateArmyStat('OFFENSE').totalStats.MeleeAtkPower,
    ).toBeLessThan(live.calculateArmyStat('OFFENSE').totalStats.MeleeAtkPower);
  });

  it('restores replayed users under their own ruleset', () => {
    const user = (ruleset?: CombatRuleset) =>
      new BattleUser(
        {
          id: 1,
          race: 'HUMAN',
          class: 'FIGHTER',
          experience: 0,
          fort_level: 2,
          fort_hitpoints: 100,
          UserUnit: [
            {
              id: 1,
              userId: 1,
              type: 'OFFENSE',
              level: 1,
              quantity: 100,
              isMercenary: false,
            },
          ],
        } as any,
        {},
        ruleset,
      );
    expect(user(noPerks).offense).toBeLessThan(user().offense);
    expect(user().offense).toBe(user(CURRENT_COMBAT_RULESET).offense);
  });

  it('derives replayed levels from the ruleset XP table, not the live one', () => {
    const userData = {
      id: 1,
      race: 'HUMAN',
      class: 'FIGHTER',
      experience: 89_000,
      fort_level: 2,
    } as any;
    const level11 = () => new BattleUser(userData).level;
    const spyLevel11 = () => new SpyUser(userData).level;
    expect(level11()).toBe(11);
    // A later balance change to the live level curve must not move a v9 replay.
    const row = levelXPArray.find((entry) => entry.level === 11)!;
    row.xp = 95_000;
    try {
      expect(level11()).toBe(11);
      expect(spyLevel11()).toBe(11);
      expect(new BattleUser(userData, {}, CURRENT_COMBAT_RULESET).level).toBe(
        11,
      );
      expect(new SpyUser(userData, {}, CURRENT_COMBAT_RULESET).level).toBe(11);
    } finally {
      row.xp = 89_000;
    }
    // A ruleset with its own curve does move it.
    const steeper = deriveCombatRuleset(CURRENT_COMBAT_RULESET, 'combat-test', {
      levelXp: CURRENT_COMBAT_RULESET.levelXp.map((entry) =>
        entry.level === 11 ? { ...entry, xp: 95_000 } : entry,
      ),
    });
    expect(new BattleUser(userData, {}, steeper).level).toBe(10);
    expect(new SpyUser(userData, {}, steeper).level).toBe(10);
  });
});
