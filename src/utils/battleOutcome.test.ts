import { beforeEach, describe, expect, it } from 'bun:test';
import { mtRandImpl } from 'test/utils/mockMtRand';

import { Fortifications, levelXPArray, UnitTypes } from '@/constants';
import UserModel from '@/models/Users';
import { executeAttack } from '@/utils/attackFunctions';
import MockUserGenerator from '@/utils/MockUserGenerator';
import { createSeededRandom } from '@/utils/random';

// Other test files in this process install a global mtRand mock whose fn
// ignores the caller-provided random. Restore pass-through semantics so the
// seeded battles below are deterministic regardless of execution order.
beforeEach(() => {
  mtRandImpl.fn = ((min = 0, max = 1, random?: () => number) =>
    (random ?? Math.random)() * (max - min) + min) as any;
});

/** Builds a UserModel with exact level/race and a unit roster. */
function buildUser(opts: {
  race: string;
  level: number;
  fortLevel: number;
  fortHpOverride?: number;
  gold: bigint;
  units: Array<[string, number, number]>;
}): UserModel {
  const g = new MockUserGenerator();
  g.setLevel(opts.level)
    .setFortLevel(opts.fortLevel)
    .setFortHitpoints(
      opts.fortHpOverride ??
        Fortifications.find((f) => f.level === opts.fortLevel)?.hitpoints ??
        500,
    )
    .adjustGold(opts.gold - 25000n)
    .clearUnits()
    .clearItems()
    .clearBattleUpgrades();
  g.addUnits(
    opts.units.map(([type, level, quantity], i) => ({
      id: i,
      userId: 1,
      type,
      level,
      quantity,
      isMercenary: false,
    })) as any,
  );
  const raw = g.getUser() as any;
  raw.race = opts.race;
  raw.class = 'FIGHTER';
  raw.experience = levelXPArray.find((l) => l.level === opts.level)?.xp ?? 0;
  return new UserModel(raw);
}

const PEER = {
  level: 20,
  fortLevel: 6,
  gold: 5_000_000n,
  units: [
    ['OFFENSE', 1, 1000] as [string, number, number],
    ['DEFENSE', 1, 800] as [string, number, number],
    ['CITIZEN', 1, 1600] as [string, number, number],
    ['WORKER', 1, 900] as [string, number, number],
  ],
};

function peer(
  side: 'attacker' | 'defender',
  fortHpOverride?: number,
): UserModel {
  return buildUser({
    ...PEER,
    race: side === 'attacker' ? 'HUMAN' : 'UNDEAD',
    fortHpOverride,
  });
}

describe('canonical outcome', () => {
  it('declares exactly one outcome, consistent between result and canonical data', async () => {
    const result = await executeAttack(
      peer('attacker') as any,
      peer('defender') as any,
      10,
      false,
      { random: createSeededRandom('canonical-peer') },
    );

    // Peer assaults are genuinely contested; what must hold on every seed is
    // that the declared result and the canonical outcome agree.
    const canonical = (result as any).canonicalOutcome;
    expect(['WIN', 'LOSS']).toContain(result.result);
    expect(canonical.winner).toBe(
      result.result === 'WIN' ? 'ATTACKER' : 'DEFENDER',
    );
    expect([
      'DEFENSE_WIPED',
      'FORT_BREACHED',
      'ASSAULT_SUCCEEDED',
      'DEFENDER_HELD',
    ]).toContain(canonical.reason);
    expect(canonical.attackerValueLost).toBeGreaterThanOrEqual(0);
    expect(canonical.defenderValueLost).toBeGreaterThanOrEqual(0);
    expect(canonical.fortValueDamage).toBeGreaterThanOrEqual(0);
    expect(canonical.defenseUnitsBroken).toBeGreaterThanOrEqual(0);
    expect(canonical.assaultSucceeded).toBe(result.result === 'WIN');
  });

  it('a weak defended probe cannot win or take gold, even against a zero-HP fort', async () => {
    for (const fortHpOverride of [undefined, 0]) {
      for (let seed = 0; seed < 20; seed++) {
        const attacker = buildUser({
          race: 'HUMAN',
          level: 20,
          fortLevel: 6,
          gold: 0n,
          units: [['OFFENSE', 1, 100]],
        });
        const defender = buildUser({
          race: 'UNDEAD',
          level: 20,
          fortLevel: 6,
          fortHpOverride,
          gold: 50_000_000n,
          units: [['DEFENSE', 1, 2000]],
        });
        const startHp = defender.fortHitpoints;
        const result = await executeAttack(attacker, defender, 10, false, {
          random: createSeededRandom(`denied-probe-${seed}`),
        });
        expect(result.result).toBe('LOSS');
        expect(result.pillagedGold).toBe(0n);
        expect(result.finalFortHP).toBe(startHp);
        expect(result.canonicalOutcome?.assaultSucceeded).toBe(false);
        expect(result.canonicalOutcome?.reason).toBe('DEFENDER_HELD');
      }
    }
  });

  it('wiping an undefended target is an objective win', async () => {
    const attacker = buildUser({
      race: 'HUMAN',
      level: 20,
      fortLevel: 6,
      gold: 1_000_000n,
      units: [['OFFENSE', 1, 1000]],
    });
    const naked = buildUser({
      race: 'UNDEAD',
      level: 20,
      fortLevel: 3,
      gold: 5_000_000n,
      units: [['WORKER', 1, 2000]],
    });

    const result = await executeAttack(
      attacker as any,
      naked as any,
      10,
      false,
      {
        random: createSeededRandom('canonical-naked'),
      },
    );

    expect(result.result).toBe('WIN');
    expect(result.canonicalOutcome?.assaultSucceeded).toBe(true);
  });

  it('an overwhelming raid on a weakly defended rich target wins', async () => {
    const attacker = buildUser({
      race: 'HUMAN',
      level: 20,
      fortLevel: 6,
      gold: 1_000_000n,
      units: [['OFFENSE', 1, 5000]],
    });
    const weakRich = buildUser({
      race: 'UNDEAD',
      level: 20,
      fortLevel: 6,
      gold: 50_000_000n,
      units: [
        ['DEFENSE', 1, 300],
        ['CITIZEN', 1, 4000],
        ['WORKER', 1, 2000],
      ],
    });

    const result = await executeAttack(
      attacker as any,
      weakRich as any,
      10,
      false,
      {
        random: createSeededRandom('canonical-goliath'),
      },
    );

    expect(result.result).toBe('WIN');
    expect(result.pillagedGold).toBeGreaterThan(0);
  });

  it('XP always agrees with the canonical winner', async () => {
    // A knight probe is genuinely out-pressured by the standing archer garrison.
    const siegeAttacker = buildUser({
      race: 'HUMAN',
      level: 25,
      fortLevel: 6,
      gold: 1_000_000n,
      units: [['OFFENSE', 2, 1000]],
    });
    const fortress = buildUser({
      race: 'UNDEAD',
      level: 20,
      fortLevel: 12,
      gold: 100_000n, // banked treasury: almost nothing on hand to raid
      units: [
        ['DEFENSE', 2, 4000],
        ['DEFENSE', 1, 1000],
        ['WORKER', 1, 5000],
        ['OFFENSE', 2, 5000],
      ],
    });
    const loss = await executeAttack(
      siegeAttacker as any,
      fortress as any,
      10,
      false,
      { random: createSeededRandom('xp-loss') },
    );
    expect(loss.result).toBe('LOSS');
    expect(loss.experienceGained.defender).toBeGreaterThan(
      loss.experienceGained.attacker,
    );

    const attacker = buildUser({
      race: 'HUMAN',
      level: 20,
      fortLevel: 6,
      gold: 1_000_000n,
      units: [['OFFENSE', 1, 5000]],
    });
    const weakRich = buildUser({
      race: 'UNDEAD',
      level: 20,
      fortLevel: 3,
      gold: 50_000_000n,
      units: [
        ['DEFENSE', 1, 50],
        ['WORKER', 1, 1000],
      ],
    });
    const win = await executeAttack(
      attacker as any,
      weakRich as any,
      10,
      false,
      {
        random: createSeededRandom('xp-win'),
      },
    );
    expect(win.result).toBe('WIN');
    expect(win.experienceGained.attacker).toBeGreaterThan(
      win.experienceGained.defender,
    );
  });

  it('the same engine inputs and seeded stream produce the same full combat decisions', async () => {
    const attackerInput = {
      id: 1,
      level: 20,
      fortLevel: 6,
      fortHitpoints: 500,
      race: 'ALL',
      gold: 1000n,
      units: [
        {
          id: 1,
          userId: 1,
          type: 'OFFENSE',
          level: 2,
          quantity: 1500,
          isMercenary: false,
        },
      ],
      items: [{ usage: 'OFFENSE', type: 'WEAPON', level: 1, quantity: 12 }],
    };
    const defenderInput = {
      id: 2,
      level: 20,
      fortLevel: 6,
      fortHitpoints: 500,
      race: 'ALL',
      gold: 10000000n,
      units: [
        {
          id: 2,
          userId: 2,
          type: 'DEFENSE',
          level: 2,
          quantity: 1000,
          isMercenary: false,
        },
      ],
    };
    const first = await executeAttack(
      structuredClone(attackerInput),
      structuredClone(defenderInput),
      10,
      false,
      { random: createSeededRandom('repeat-engine') },
    );
    const second = await executeAttack(
      structuredClone(attackerInput),
      structuredClone(defenderInput),
      10,
      false,
      { random: createSeededRandom('repeat-engine') },
    );
    expect(second).toEqual(first);
  });

  it('equipped ranged counter-pressure fires on both phases', async () => {
    const attackerInput = {
      id: 1,
      level: 20,
      fortLevel: 6,
      race: 'ALL',
      gold: 0n,
      units: [
        {
          id: 1,
          userId: 1,
          type: 'OFFENSE',
          level: 1,
          quantity: 1000,
          isMercenary: false,
        },
      ],
    };
    const defenderInput = {
      id: 2,
      level: 20,
      fortLevel: 6,
      fortHitpoints: 500,
      race: 'ALL',
      gold: 100000n,
      units: [
        {
          id: 2,
          userId: 2,
          type: 'DEFENSE',
          level: 1,
          quantity: 100,
          isMercenary: false,
        },
      ],
    };
    const unarmed = await executeAttack(
      structuredClone(attackerInput),
      structuredClone(defenderInput),
      2,
      false,
      { random: () => 0.5 },
    );
    const ranged = await executeAttack(
      structuredClone(attackerInput),
      {
        ...structuredClone(defenderInput),
        items: [{ usage: 'DEFENSE', type: 'WEAPON', level: 1, quantity: 100 }],
      },
      2,
      false,
      { random: () => 0.5 },
    );
    const attrition = (result: typeof ranged) =>
      result.Losses.Attacker.total +
      result.wounded.attacker.reduce((sum, group) => sum + group.quantity, 0);
    expect(attrition(ranged)).toBeGreaterThan(attrition(unarmed));
    const shots = ranged.mitigationLog.filter(
      (entry) => entry.source === 'DEFENDER' && entry.attackType === 'RANGED',
    );
    // Ranged defenders answer on the attacker's own turn and again on theirs.
    expect(shots.map((entry) => entry.turn)).toEqual([1, 2]);
    expect(shots.every((entry) => entry.mitigatedDamage > 0)).toBe(true);
  });

  it('an assault can succeed through ranged pressure even without melee pressure', async () => {
    // Exercise the catalog-driven channel against a standing line, not a mocked damage result.
    // The live catalog currently has no offensive ranged troop; balance catalogs may add one.
    const soldier = UnitTypes.find(
      (unit) => unit.type === 'OFFENSE' && unit.level === 1,
    )!;
    const original = {
      melee: soldier.MeleeAtkPower,
      ranged: soldier.RangedAtkPower,
    };
    try {
      soldier.MeleeAtkPower = 0;
      soldier.RangedAtkPower = 250;
      const attacker = buildUser({
        race: 'HUMAN',
        level: 20,
        fortLevel: 6,
        gold: 0n,
        units: [['OFFENSE', 1, 100]],
      });
      const defender = buildUser({
        race: 'UNDEAD',
        level: 20,
        fortLevel: 6,
        gold: 1000000n,
        units: [['DEFENSE', 1, 2000]],
      });
      const result = await executeAttack(attacker, defender, 1, false, {
        random: () => 0.5,
      });
      expect(result.result).toBe('WIN');
      expect(result.canonicalOutcome?.assaultSucceeded).toBe(true);
      expect(result.pillagedGold).toBeGreaterThan(0n);
      expect(
        result.mitigationLog.some(
          (entry) =>
            entry.source === 'ATTACKER' &&
            entry.attackType === 'RANGED' &&
            entry.mitigatedDamage > 0,
        ),
      ).toBe(true);
    } finally {
      soldier.MeleeAtkPower = original.melee;
      soldier.RangedAtkPower = original.ranged;
    }
  });

  it('ten committed turns alternate five assaults and five counters without a final-turn extra assault', async () => {
    const attacker = buildUser({
      race: 'HUMAN',
      level: 20,
      fortLevel: 6,
      gold: 0n,
      units: [['OFFENSE', 1, 10000]],
    });
    const defender = buildUser({
      race: 'UNDEAD',
      level: 20,
      fortLevel: 6,
      gold: 1000000n,
      units: [['DEFENSE', 1, 2000]],
    });
    const result = await executeAttack(attacker, defender, 100, false, {
      random: () => 0.5,
    });
    expect(result.turnsTaken).toBe(10);
    expect(
      result.mitigationLog
        .filter(
          (entry) =>
            entry.source === 'ATTACKER' && entry.attackType === 'MELEE',
        )
        .map((entry) => entry.turn),
    ).toEqual([1, 3, 5, 7, 9]);
    expect(
      result.mitigationLog
        .filter(
          (entry) =>
            entry.source === 'DEFENDER' && entry.attackType === 'MELEE',
        )
        .map((entry) => entry.turn),
    ).toEqual([2, 4, 6, 8, 10]);
  });
});

describe('fort-shielded treasury', () => {
  const goliath = () =>
    buildUser({
      race: 'HUMAN',
      level: 20,
      fortLevel: 6,
      gold: 1_000_000n,
      units: [['OFFENSE', 1, 5000]],
    });
  // Fort 10 (2,500 HP): strong enough that a 5,000-soldier assault cannot
  // breach it even with overkill scaling — the loot cap stays at the floor.
  const hardTarget = (fortHpOverride?: number) =>
    buildUser({
      race: 'UNDEAD',
      level: 20,
      fortLevel: 10,
      fortHpOverride,
      gold: 50_000_000n,
      units: [
        ['DEFENSE', 1, 300],
        ['CITIZEN', 1, 4000],
        ['WORKER', 1, 2000],
      ],
    });

  it('a breached fort yields far more loot than a standing one', async () => {
    const standing = await executeAttack(
      goliath() as any,
      hardTarget() as any,
      10,
      false,
      { random: createSeededRandom('loot-standing') },
    );
    const breached = await executeAttack(
      goliath() as any,
      hardTarget(0) as any,
      10,
      false,
      { random: createSeededRandom('loot-breached') },
    );

    expect(standing.result).toBe('WIN');
    expect(breached.result).toBe('WIN');
    expect(breached.canonicalOutcome?.reason).toBe('ASSAULT_SUCCEEDED');
    expect(breached.pillagedGold).toBeGreaterThan(standing.pillagedGold * 2n);
  });

  it('the daily dogpile gold allowance caps what leaves the treasury', async () => {
    const result = await executeAttack(
      goliath() as any,
      hardTarget(0) as any,
      10,
      false,
      {
        random: createSeededRandom('loot-allowance'),
        defenderDailyGoldRemaining: 1000n,
      },
    );

    expect(result.result).toBe('WIN');
    expect(result.pillagedGold).toBeLessThanOrEqual(1000n);
  });
});

describe('ranged defense assault support (CHG-001)', () => {
  const constantRandom = () => 0.5;

  it('counts Archer support against melee assaults to repel underpowered raids', async () => {
    // Attacker: 100 Knights (L2 Offense). MeleeAtk = 15 * 100 * 1.02 = 1530.
    const attacker = buildUser({
      race: 'HUMAN',
      level: 20,
      fortLevel: 8,
      gold: 50_000n,
      units: [['OFFENSE', 2, 100]],
    });

    // Defender 1: 150 Archers (L2 Defense). MeleeDef = 5 * 150 * 1.02 = 765. RangedDef = 15 * 150 * 1.02 = 2295.
    // Threshold at w=0.5: 765 + 0.5 * 2295 = 1912.5.
    // 1530 < 1912.5 -> Assault fails!
    const archerDefender = buildUser({
      race: 'HUMAN',
      level: 20,
      fortLevel: 8,
      gold: 1_000_000n,
      units: [['DEFENSE', 2, 150]],
    });

    const archerBattle = await executeAttack(
      attacker as any,
      archerDefender as any,
      1,
      false,
      {
        random: constantRandom,
        defenderDailyCasualtyRemaining: 0,
      },
    );

    expect(archerBattle.result).toBe('LOSS');
    expect(archerBattle.canonicalOutcome?.assaultSucceeded).toBe(false);
    expect(archerBattle.pillagedGold).toBe(0n);
    // A repelled near-miss scorches the walls but cannot take a siege bite.
    expect(archerBattle.finalFortHP).toBeLessThanOrEqual(
      archerDefender.fortHitpoints,
    );
    expect(archerBattle.finalFortHP).toBeGreaterThan(
      archerDefender.fortHitpoints * 0.98,
    );

    // Control Defender: 150 Guards (L1 Defense). MeleeDef = 765, RangedDef = 0.
    // Threshold: 765. 1530 > 765 -> Assault succeeds!
    const guardDefender = buildUser({
      race: 'HUMAN',
      level: 20,
      fortLevel: 8,
      gold: 1_000_000n,
      units: [['DEFENSE', 1, 150]],
    });

    const guardBattle = await executeAttack(
      attacker as any,
      guardDefender as any,
      1,
      false,
      {
        random: constantRandom,
        defenderDailyCasualtyRemaining: 0,
      },
    );

    expect(guardBattle.result).toBe('WIN');
    expect(guardBattle.canonicalOutcome?.assaultSucceeded).toBe(true);
    expect(guardBattle.pillagedGold).toBeGreaterThan(0n);
  });

  it('preserves viable offense when attackers commit sufficient force against Archers', async () => {
    // 160 Knights vs 150 Archers: Attack pressure overcomes the combined defense threshold.
    const attacker = buildUser({
      race: 'HUMAN',
      level: 20,
      fortLevel: 8,
      gold: 50_000n,
      units: [['OFFENSE', 2, 160]],
    });
    const defender = buildUser({
      race: 'HUMAN',
      level: 20,
      fortLevel: 8,
      gold: 1_000_000n,
      units: [['DEFENSE', 2, 150]],
    });

    const battle = await executeAttack(
      attacker as any,
      defender as any,
      1,
      false,
      {
        random: constantRandom,
      },
    );

    expect(battle.result).toBe('WIN');
    expect(battle.canonicalOutcome?.assaultSucceeded).toBe(true);
    expect(battle.pillagedGold).toBeGreaterThan(0n);
  });

  it('retains Royal Guard defense control against Knight assaults', async () => {
    // 150 Knights vs 150 Royal Guards (Tier 3 Defense): Def threshold exceeds 5700 >> 2295.
    const attacker = buildUser({
      race: 'HUMAN',
      level: 20,
      fortLevel: 8,
      gold: 50_000n,
      units: [['OFFENSE', 2, 150]],
    });
    const defender = buildUser({
      race: 'HUMAN',
      level: 20,
      fortLevel: 8,
      gold: 1_000_000n,
      units: [['DEFENSE', 3, 150]],
    });

    const battle = await executeAttack(
      attacker as any,
      defender as any,
      1,
      false,
      {
        random: constantRandom,
      },
    );

    expect(battle.result).toBe('LOSS');
    expect(battle.canonicalOutcome?.assaultSucceeded).toBe(false);
  });
});
