/**
 * combat-v10 casualty spread (#203).
 *
 * The shadow roster runs combat-v9's lowest-first algorithm for the whole
 * battle, so a v10 battle must match the v9 battle fought on the same seed in
 * every total, while its dead are spread over the unit tiers by headcount.
 */
import { beforeEach, describe, expect, it } from 'bun:test';
import { mtRandImpl } from 'test/utils/mockMtRand';

import { executeAttack } from '@/utils/attackFunctions';
import { COMBAT_RULESETS } from '@/utils/balance/combatRulesets';
import {
  allocateWounded,
  allocateWoundedByType,
  shadowWoundedByType,
  SpreadRoster,
} from '@/utils/casualtySpread';
import { createSeededRandom, type RandomFn } from '@/utils/random';

const V9 = COMBAT_RULESETS['combat-v9']!;
const V10 = COMBAT_RULESETS['combat-v10']!;
const CAP = V10.constants.PER_STACK_CASUALTY_CAP;

// Other test files in this process may leak a global mtRand mock; restore the
// seeded pass-through so these battles consume their own stream.
beforeEach(() => {
  mtRandImpl.fn = ((min = 0, max = 1, random?: () => number) =>
    (random ?? Math.random)() * (max - min) + min) as any;
});

type Row = {
  id: number;
  userId: number;
  type: string;
  level: number;
  quantity: number;
  isMercenary: boolean;
  forceContractId?: number;
  forceKind?: 'MERCENARY';
};

type Army = {
  id: number;
  displayName: string;
  level: number;
  race: string;
  class: string;
  gold: bigint;
  fortLevel: number;
  fortHitpoints: number;
  units: Row[];
  mercenaries: Row[];
  items: never[];
  structure_upgrades: never[];
  battle_upgrades: never[];
  bonus_points: never[];
};

const int = (r: RandomFn, lo: number, hi: number) =>
  lo + Math.floor(r() * (hi - lo + 1));

/** Skewed toward tiny stacks so the per-stack cap and one-unit floor bind. */
function size(r: RandomFn, max: number): number {
  const roll = r();
  if (roll < 0.25) return int(r, 1, 6);
  if (roll < 0.5) return int(r, 7, 60);
  return int(r, 20, max);
}

function buildArmy(r: RandomFn, id: number, role: 'attacker' | 'defender') {
  const fighting = role === 'attacker' ? 'OFFENSE' : 'DEFENSE';
  let next = id * 1000;
  const units: Row[] = [];
  const mercenaries: Row[] = [];
  const add = (
    list: Row[],
    type: string,
    level: number,
    quantity: number,
    extra: Partial<Row> = {},
  ) =>
    list.push({
      id: next++,
      userId: id,
      type,
      level,
      quantity,
      isMercenary: list === mercenaries,
      ...extra,
    });
  for (const level of [1, 2, 3]) {
    if (r() < 0.8) add(units, fighting, level, size(r, 800));
    // A second row of the same stack: the allowance must be shared.
    if (r() < 0.25) add(units, fighting, level, size(r, 80));
  }
  if (!units.some((u) => u.type === fighting))
    add(units, fighting, 1, size(r, 800));
  if (r() < 0.5) {
    for (const level of [1, 2]) {
      if (r() < 0.7)
        add(mercenaries, fighting, level, size(r, 400), {
          forceContractId: 100 * id + level,
          forceKind: 'MERCENARY',
        });
    }
    // Two contracts in one tier.
    if (r() < 0.3)
      add(mercenaries, fighting, 1, size(r, 100), {
        forceContractId: 100 * id + 9,
        forceKind: 'MERCENARY',
      });
  }
  if (role === 'defender') {
    add(units, 'CITIZEN', 1, size(r, 3000));
    add(units, 'WORKER', 1, size(r, 3000));
  }
  return {
    id,
    displayName: `${role}-${id}`,
    level: int(r, 10, 40),
    race: 'HUMAN',
    class: 'FIGHTER',
    gold: BigInt(int(r, 0, 5_000_000)),
    fortLevel: int(r, 1, 6),
    fortHitpoints: r() < 0.3 ? 0 : int(r, 1, 3000),
    units,
    mercenaries,
    items: [],
    structure_upgrades: [],
    battle_upgrades: [],
    bonus_points: [],
  } as Army;
}

function buildScenario(seed: string) {
  const r = createSeededRandom(`spread:${seed}`);
  // Attacks lean strong so several turns land and the caps come into play.
  const attacker = buildArmy(r, 1, 'attacker');
  const defender = buildArmy(r, 2, 'defender');
  return { attacker, defender, turns: int(r, 1, 10) };
}

type Scenario = ReturnType<typeof buildScenario>;

async function fight(
  scenario: Scenario,
  seed: string,
  ruleset: typeof V9,
  options: { dailyCasualty?: number } = {},
) {
  const attacker = structuredClone(scenario.attacker);
  const defender = structuredClone(scenario.defender);
  const result = await executeAttack(
    attacker as any,
    defender as any,
    scenario.turns,
    false,
    {
      ruleset,
      random: createSeededRandom(`battle:${seed}`),
      defenderDailyCasualtyRemaining: options.dailyCasualty,
    },
  );
  return { result, attacker, defender };
}

type Fought = Awaited<ReturnType<typeof fight>>;

const key = (u: {
  type: string;
  level: number;
  isMercenary?: boolean;
  forceContractId?: number;
}) =>
  `${u.type}:${u.level}:${u.isMercenary ? 'm' : 'r'}:${u.forceContractId ?? 0}`;

/** Killed plus wounded, per stack key. */
function lostByStack(fought: Fought, side: 'Attacker' | 'Defender') {
  const out = new Map<string, number>();
  const wounded =
    fought.result.wounded[side === 'Attacker' ? 'attacker' : 'defender'];
  for (const u of [...fought.result.Losses[side].units, ...wounded])
    out.set(key(u), (out.get(key(u)) ?? 0) + u.quantity);
  return out;
}

function sumByType(fought: Fought, side: 'Attacker' | 'Defender') {
  const out: Record<string, number> = {};
  for (const [k, n] of lostByStack(fought, side)) {
    const type = k.split(':')[0]!;
    out[type] = (out[type] ?? 0) + n;
  }
  return out;
}

/** Killed and wounded kept apart, per unit type: neither may move between types. */
function splitByType(fought: Fought, side: 'Attacker' | 'Defender') {
  const sum = (units: Array<{ type: string; quantity: number }>) => {
    const out: Record<string, number> = {};
    for (const u of units) out[u.type] = (out[u.type] ?? 0) + u.quantity;
    return out;
  };
  return {
    killed: sum(fought.result.Losses[side].units),
    wounded: sum(
      fought.result.wounded[side === 'Attacker' ? 'attacker' : 'defender'],
    ),
  };
}

function startingByStack(user: Army) {
  const out = new Map<string, number>();
  for (const u of [...user.units, ...user.mercenaries])
    out.set(key(u), (out.get(key(u)) ?? 0) + u.quantity);
  return out;
}

function survivorsByType(user: Army) {
  const out: Record<string, number> = {};
  for (const u of [...user.units, ...user.mercenaries])
    out[u.type] = (out[u.type] ?? 0) + u.quantity;
  return out;
}

const SEEDS = Array.from({ length: 400 }, (_, i) => `p${i}`);

describe('combat-v10 casualty spread', () => {
  it('is the current ruleset and v9 keeps lowest-first', () => {
    expect(V10.casualtySpread).toBe(true);
    expect(V9.casualtySpread).toBeUndefined();
  });

  it('matches the lowest-first battle on the same seed in every total', async () => {
    let spreadSeen = 0;
    for (const seed of SEEDS) {
      const scenario = buildScenario(seed);
      const a = await fight(scenario, seed, V9);
      const b = await fight(scenario, seed, V10);
      const label = `seed ${seed}`;
      for (const side of ['Attacker', 'Defender'] as const) {
        const wounded = side === 'Attacker' ? 'attacker' : 'defender';
        // Killed, wounded and killed + wounded per side, and per unit type.
        expect([label, b.result.Losses[side].total]).toEqual([
          label,
          a.result.Losses[side].total,
        ]);
        expect([label, splitByType(b, side)]).toEqual([
          label,
          splitByType(a, side),
        ]);
        expect([label, sumByType(b, side)]).toEqual([
          label,
          sumByType(a, side),
        ]);
        const units = side === 'Attacker' ? 'attacker' : 'defender';
        expect([label, survivorsByType(b[units])]).toEqual([
          label,
          survivorsByType(a[units]),
        ]);
      }
      // The fight itself is the lowest-first fight.
      expect([label, b.result.result]).toEqual([label, a.result.result]);
      expect(b.result.pillagedGold).toBe(a.result.pillagedGold);
      expect(b.result.finalFortHP).toBe(a.result.finalFortHP);
      expect(b.result.turnsTaken).toBe(a.result.turnsTaken);
      expect(b.result.experienceGained).toEqual(a.result.experienceGained);
      expect(b.result.mitigationLog).toEqual(a.result.mitigationLog);
      expect(b.result.damageAudit).toEqual(a.result.damageAudit);
      expect(b.result.attackerStats).toEqual(a.result.attackerStats);
      expect(b.result.defenderStats).toEqual(a.result.defenderStats);
      expect(b.result.canonicalOutcome?.winner).toBe(
        a.result.canonicalOutcome?.winner,
      );
      expect(b.result.canonicalOutcome?.defenseUnitsBroken).toBe(
        a.result.canonicalOutcome?.defenseUnitsBroken,
      );
      if (
        JSON.stringify([...lostByStack(a, 'Attacker')]) !==
        JSON.stringify([...lostByStack(b, 'Attacker')])
      )
        spreadSeen++;
    }
    // The spread did something in a good share of the battles.
    expect(spreadSeen).toBeGreaterThan(SEEDS.length / 4);
  }, 120_000);

  it('keeps every real stack inside its shared cap and its own roster', async () => {
    for (const seed of SEEDS) {
      const scenario = buildScenario(seed);
      const fought = await fight(scenario, seed, V10);
      for (const [side, user, start] of [
        ['Attacker', fought.attacker, scenario.attacker],
        ['Defender', fought.defender, scenario.defender],
      ] as const) {
        const starting = startingByStack(start);
        for (const [k, lost] of lostByStack(fought, side)) {
          const initial = starting.get(k) ?? 0;
          expect([
            seed,
            k,
            lost <= Math.max(1, Math.floor(initial * CAP)),
          ]).toEqual([seed, k, true]);
        }
        // Survivors plus the dead are the starting roster, stack by stack.
        const alive = startingByStack(user);
        const lost = lostByStack(fought, side);
        for (const [k, initial] of starting)
          expect([seed, k, (alive.get(k) ?? 0) + (lost.get(k) ?? 0)]).toEqual([
            seed,
            k,
            initial,
          ]);
      }
    }
  }, 120_000);

  it('holds across a battle of any length and a binding daily allowance', async () => {
    for (const seed of SEEDS.slice(0, 120)) {
      const scenario = buildScenario(seed);
      for (const turns of [1, 2, 5, 10]) {
        for (const dailyCasualty of [undefined, 3, 40]) {
          const s = { ...scenario, turns };
          const a = await fight(s, seed, V9, { dailyCasualty });
          const b = await fight(s, seed, V10, { dailyCasualty });
          for (const side of ['Attacker', 'Defender'] as const) {
            expect([seed, turns, dailyCasualty, splitByType(b, side)]).toEqual([
              seed,
              turns,
              dailyCasualty,
              splitByType(a, side),
            ]);
            expect([seed, turns, dailyCasualty, sumByType(b, side)]).toEqual([
              seed,
              turns,
              dailyCasualty,
              sumByType(a, side),
            ]);
          }
        }
      }
    }
  }, 240_000);

  it('reaches every tier in proportion to headcount', async () => {
    const row = (
      id: number,
      level: number,
      quantity: number,
      extra: Partial<Row> = {},
    ): Row => ({
      id,
      userId: 1,
      type: 'OFFENSE',
      level,
      quantity,
      isMercenary: false,
      ...extra,
    });
    const attacker: Army = {
      ...buildArmy(createSeededRandom('prop'), 1, 'attacker'),
      level: 30,
      units: [row(1, 1, 3000), row(2, 2, 2000), row(3, 3, 1000)],
      mercenaries: [],
    };
    const defender: Army = {
      ...buildArmy(createSeededRandom('prop2'), 2, 'defender'),
      level: 30,
      fortHitpoints: 0,
    };
    const scenario = { attacker, defender, turns: 10 };
    let v9HigherTierLosses = 0;
    let checked = 0;
    for (let i = 0; i < 40; i++) {
      const seed = `prop-${i}`;
      const a = await fight(scenario, seed, V9);
      const b = await fight(scenario, seed, V10);
      v9HigherTierLosses += [...lostByStack(a, 'Attacker')]
        .filter(([k]) => !k.startsWith('OFFENSE:1:'))
        .reduce((n, [, q]) => n + q, 0);
      const lost = lostByStack(b, 'Attacker');
      const total = [...lost.values()].reduce((n, q) => n + q, 0);
      if (total < 12) continue;
      checked++;
      // No cap binds on a fraction this small: the split is proportional to
      // headcount, within one unit per tier and one more for the wounded split.
      for (const [level, headcount] of [
        [1, 3000],
        [2, 2000],
        [3, 1000],
      ] as const) {
        const share = (total * headcount) / 6000;
        expect(
          Math.abs((lost.get(`OFFENSE:${level}:r:0`) ?? 0) - share),
        ).toBeLessThanOrEqual(1.01);
      }
    }
    expect(checked).toBeGreaterThan(10);
    // Lowest-first never touches the higher tiers while level 1 has room.
    expect(v9HigherTierLosses).toBe(0);
  }, 120_000);

  it('hired troops take the front line within every tier', async () => {
    const mk = (
      id: number,
      level: number,
      quantity: number,
      merc: boolean,
    ): Row => ({
      id,
      userId: 1,
      type: 'OFFENSE',
      level,
      quantity,
      isMercenary: merc,
      ...(merc ? { forceContractId: 7, forceKind: 'MERCENARY' as const } : {}),
    });
    const roster = new SpreadRoster(
      [mk(1, 1, 1000, false), mk(2, 2, 1000, false)],
      [mk(3, 1, 500, true), mk(4, 2, 500, true)],
      V10.constants,
    );
    roster.project([
      { type: 'OFFENSE', level: 1, quantity: 600, isMercenary: false },
    ]);
    const lost = new Map(
      roster
        .realLosses()
        .map((e) => [`${e.level}:${e.isMercenary}`, e.quantity]),
    );
    // Regulars and mercenaries carry weights 1000 and 2 x 500 in each tier;
    // tiers split evenly, and within a tier the weights are equal here.
    expect(
      (lost.get('1:true') ?? 0) + (lost.get('1:false') ?? 0),
    ).toBeGreaterThanOrEqual(299);
    expect(
      (lost.get('2:true') ?? 0) + (lost.get('2:false') ?? 0),
    ).toBeGreaterThanOrEqual(299);
    const unequal = new SpreadRoster(
      [mk(1, 1, 1000, false)],
      [mk(2, 1, 500, true)],
      V10.constants,
    );
    unequal.project([
      { type: 'OFFENSE', level: 1, quantity: 300, isMercenary: false },
    ]);
    const split = new Map(
      unequal.realLosses().map((e) => [e.isMercenary, e.quantity]),
    );
    // A merc takes twice a regular's share per head: 1000 : 1000.
    expect(split.get(true)).toBe(150);
    expect(split.get(false)).toBe(150);
  });

  it('spreads the wounded split to the lowest-first count of each type', () => {
    const real = [
      { type: 'OFFENSE', level: 1, quantity: 7, isMercenary: false },
      { type: 'OFFENSE', level: 2, quantity: 7, isMercenary: false },
      { type: 'CITIZEN', level: 1, quantity: 10, isMercenary: false },
    ];
    // Lowest-first charged 14 OFFENSE to one entry (floor(14 * 0.3) = 4
    // wounded) and 10 CITIZEN to another (3 wounded).
    const shadow = [
      { type: 'OFFENSE', level: 1, quantity: 14, isMercenary: false },
      { type: 'CITIZEN', level: 1, quantity: 10, isMercenary: false },
    ];
    const byType = shadowWoundedByType(shadow, 0.3);
    expect(Object.fromEntries(byType)).toEqual({ OFFENSE: 4, CITIZEN: 3 });
    const shares = allocateWoundedByType(real, byType);
    expect(shares[0]! + shares[1]!).toBe(4);
    expect(shares[2]).toBe(3);
    expect(shares.every((q, i) => q <= real[i]!.quantity)).toBe(true);
    expect(allocateWounded(real, 0)).toEqual([0, 0, 0]);
    expect(allocateWounded([], 4)).toEqual([]);
  });

  it('keeps killed and wounded per unit type (review S1 repro, seed case3)', async () => {
    const row = (
      id: number,
      userId: number,
      type: string,
      level: number,
      quantity: number,
    ): Row => ({ id, userId, type, level, quantity, isMercenary: false });
    const base = buildArmy(createSeededRandom('s1'), 1, 'attacker');
    const scenario = {
      attacker: {
        ...base,
        id: 1,
        level: 30,
        fortLevel: 20,
        units: [row(1, 1, 'OFFENSE', 3, 10_000)],
        mercenaries: [],
      },
      defender: {
        ...base,
        id: 2,
        level: 30,
        fortLevel: 20,
        fortHitpoints: 0,
        units: [
          row(2, 2, 'OFFENSE', 1, 13),
          row(3, 2, 'OFFENSE', 2, 13),
          row(4, 2, 'CITIZEN', 1, 1000),
          row(5, 2, 'WORKER', 1, 1000),
        ],
        mercenaries: [],
      },
      turns: 10,
    } as Scenario;
    const a = await fight(scenario, 'case3', V9);
    const b = await fight(scenario, 'case3', V10);
    // Lowest-first: OFFENSE 8 killed / 2 wounded, CITIZEN 107 / 45.
    const v9 = splitByType(a, 'Defender');
    expect([v9.killed.OFFENSE, v9.wounded.OFFENSE]).toEqual([8, 2]);
    expect([v9.killed.CITIZEN, v9.wounded.CITIZEN]).toEqual([107, 45]);
    expect(splitByType(b, 'Defender')).toEqual(v9);
    expect(splitByType(b, 'Attacker')).toEqual(splitByType(a, 'Attacker'));
  });

  it('can always place the shadow increment under the cap', () => {
    // Duplicate rows of a stack share one allowance of floor(10 * 0.4) = 4.
    const rows: Row[] = [
      {
        id: 1,
        userId: 1,
        type: 'OFFENSE',
        level: 1,
        quantity: 6,
        isMercenary: false,
      },
      {
        id: 2,
        userId: 1,
        type: 'OFFENSE',
        level: 1,
        quantity: 4,
        isMercenary: false,
      },
    ];
    const roster = new SpreadRoster(rows, [], V10.constants);
    roster.project([
      { type: 'OFFENSE', level: 1, quantity: 4, isMercenary: false },
    ]);
    expect(roster.realLosses()).toHaveLength(1);
    expect(roster.realLosses()[0]!.quantity).toBe(4);
    expect(rows[0]!.quantity + rows[1]!.quantity).toBe(6);
  });
});
