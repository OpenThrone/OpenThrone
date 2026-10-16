/* eslint-disable no-console -- fuzz diagnostics print the failing seed and measured envelopes. */
/**
 * Fuzzed invariant gates for the battle engine.
 *
 * Every group generates thousands of seeded random armies and asserts a rule
 * the engine must never break. Each violation message carries the scenario
 * seed: rebuild it with `buildScenario(<seed>)` to reproduce the battle.
 */
import { beforeEach, describe, expect, it } from 'bun:test';
import { mtRandImpl } from 'test/utils/mockMtRand';

import { Fortifications } from '@/constants';
import { calculateStrength, executeAttack } from '@/utils/attackFunctions';
import { V5_COMBAT_CONSTANTS } from '@/utils/balance/v5Combat';
import { createSeededRandom, type RandomFn } from '@/utils/random';

// Other test files in this process may leak a global mtRand mock; restore the
// seeded pass-through so these battles consume their own stream.
beforeEach(() => {
  mtRandImpl.fn = ((min = 0, max = 1, random?: () => number) =>
    (random ?? Math.random)() * (max - min) + min) as any;
});

const BATTLES_PER_GROUP = 4000;
const GROUP_TIMEOUT_MS = 60_000;
const MAX_REPORTED = 8;
const RACES = ['HUMAN', 'ELF', 'GOBLIN', 'UNDEAD'] as const;
const GEAR_SLOTS = ['WEAPON', 'HELM', 'ARMOR', 'BOOTS', 'BRACERS', 'SHIELD'];
const C = V5_COMBAT_CONSTANTS;

type Unit = {
  id: number;
  userId: number;
  type: string;
  level: number;
  quantity: number;
  isMercenary: boolean;
};

type Item = { usage: string; type: string; level: number; quantity: number };

type FuzzUser = {
  id: number;
  displayName: string;
  level: number;
  race: string;
  class: string;
  gold: bigint;
  fortLevel: number;
  fortHitpoints: number;
  units: Unit[];
  mercenaries: Unit[];
  items: Item[];
  structure_upgrades: Array<{ type: string; level: number }>;
  battle_upgrades: never[];
  bonus_points: never[];
};

type Scenario = {
  seed: string;
  attacker: FuzzUser;
  defender: FuzzUser;
  turns: number;
  isDefenderProtected: boolean;
  defenderDailyCasualtyRemaining?: number;
  defenderDailyGoldRemaining?: bigint;
};

type ScenarioOverrides = {
  turns?: number;
  dailyCasualty?: 'always' | 'never' | 'random';
  dailyGold?: 'always' | 'never' | 'random';
};

const int = (r: RandomFn, lo: number, hi: number) =>
  lo + Math.floor(r() * (hi - lo + 1));
const chance = (r: RandomFn, p: number) => r() < p;
const pick = <T>(r: RandomFn, values: readonly T[]): T =>
  values[Math.floor(r() * values.length)]!;
const randomBigInt = (r: RandomFn, max: number): bigint =>
  BigInt(Math.floor(r() * max));

/** Skewed toward empty and tiny stacks so edge cases come up often. */
function quantity(r: RandomFn, max: number): number {
  const roll = r();
  if (roll < 0.2) return 0;
  if (roll < 0.45) return int(r, 1, 20);
  if (roll < 0.65) return int(r, 21, 500);
  return int(r, 0, max);
}

function buildUser(
  r: RandomFn,
  id: number,
  role: 'attacker' | 'defender',
): FuzzUser {
  const fortLevel = int(r, 1, 10);
  const maxHP = Fortifications.find((f) => f.level === fortLevel)!.hitpoints;
  const fortRoll = r();
  const fortHitpoints =
    fortRoll < 0.1 ? 0 : fortRoll < 0.4 ? maxHP : int(r, 0, maxHP);
  const units: Unit[] = [];
  let nextId = id * 1000;
  const add = (
    type: string,
    level: number,
    qty: number,
    isMercenary = false,
  ) => {
    if (qty > 0)
      units.push({
        id: nextId++,
        userId: id,
        type,
        level,
        quantity: qty,
        isMercenary,
      });
  };
  for (const level of [1, 2, 3]) {
    if (chance(r, role === 'attacker' ? 0.7 : 0.5))
      add('OFFENSE', level, quantity(r, 5000));
    if (chance(r, role === 'defender' ? 0.7 : 0.4))
      add('DEFENSE', level, quantity(r, 5000));
  }
  add('CITIZEN', 1, quantity(r, 20000));
  add('WORKER', 1, quantity(r, 20000));
  add('SPY', 1, quantity(r, 500));
  add('SENTRY', 1, quantity(r, 500));

  const mercenaries: Unit[] = [];
  if (chance(r, 0.15)) {
    const qty = int(r, 1, 2000);
    mercenaries.push({
      id: nextId++,
      userId: id,
      type: role === 'attacker' ? 'OFFENSE' : 'DEFENSE',
      level: 1,
      quantity: qty,
      isMercenary: true,
    });
  }

  const items: Item[] = [];
  for (const usage of ['OFFENSE', 'DEFENSE'] as const) {
    if (!chance(r, 0.35)) continue;
    const stacks = [...units, ...mercenaries].filter((u) => u.type === usage);
    if (!stacks.length) continue;
    const level = pick(
      r,
      stacks.map((u) => u.level),
    );
    const eligible = stacks
      .filter((u) => u.level >= level)
      .reduce((sum, u) => sum + u.quantity, 0);
    for (const slot of GEAR_SLOTS) {
      if (chance(r, 0.6))
        items.push({
          usage,
          type: slot,
          level,
          quantity: int(r, 1, Math.max(1, eligible)),
        });
    }
  }

  const structure_upgrades = chance(r, 0.4)
    ? [{ type: 'ARMORY', level: int(r, 1, 3) }]
    : [];

  return {
    id,
    displayName: `${role}-${id}`,
    level: int(r, 1, 40),
    race: pick(r, RACES),
    class: 'FIGHTER',
    gold: chance(r, 0.1) ? 0n : randomBigInt(r, 5e9),
    fortLevel,
    fortHitpoints,
    units,
    mercenaries,
    items,
    structure_upgrades,
    battle_upgrades: [],
    bonus_points: [],
  };
}

function buildScenario(seed: string, overrides: ScenarioOverrides = {}) {
  const r = createSeededRandom(`gen:${seed}`);
  const attacker = buildUser(r, 1, 'attacker');
  const defender = buildUser(r, 2, 'defender');
  const turns = overrides.turns ?? int(r, 1, 10);
  const wants = (mode: ScenarioOverrides['dailyCasualty'] = 'random') =>
    mode === 'always' ? true : mode === 'never' ? false : chance(r, 0.3);
  const scenario: Scenario = {
    seed,
    attacker,
    defender,
    turns,
    isDefenderProtected: defender.level <= 9,
  };
  if (wants(overrides.dailyCasualty))
    scenario.defenderDailyCasualtyRemaining = chance(r, 0.3)
      ? int(r, 0, 3)
      : int(r, 0, 500);
  if (wants(overrides.dailyGold))
    scenario.defenderDailyGoldRemaining = chance(r, 0.2)
      ? 0n
      : randomBigInt(r, 2e8);
  return scenario;
}

async function run(scenario: Scenario) {
  const attacker = structuredClone(scenario.attacker);
  const defender = structuredClone(scenario.defender);
  const options: Parameters<typeof executeAttack>[4] = {
    random: createSeededRandom(`battle:${scenario.seed}`),
  };
  if (scenario.defenderDailyCasualtyRemaining !== undefined)
    options.defenderDailyCasualtyRemaining =
      scenario.defenderDailyCasualtyRemaining;
  if (scenario.defenderDailyGoldRemaining !== undefined)
    options.defenderDailyGoldRemaining = scenario.defenderDailyGoldRemaining;
  const result = await executeAttack(
    attacker as any,
    defender as any,
    scenario.turns,
    scenario.isDefenderProtected,
    options,
  );
  return { result, attacker, defender };
}

type Side = { type?: string; level?: number; quantity?: number };
const sumQty = (entries: readonly Side[] | undefined) =>
  (entries ?? []).reduce((sum, e) => sum + Number(e.quantity ?? 0), 0);
const stackKey = (u: {
  type?: string;
  level?: number;
  isMercenary?: boolean;
}) => `${u.type}:${u.level}:${!!u.isMercenary}`;
const roster = (u: { units?: Unit[]; mercenaries?: Unit[] }) =>
  [...(u.units ?? []), ...(u.mercenaries ?? [])] as Unit[];
const population = (u: FuzzUser, type?: string) =>
  roster(u)
    .filter((x) => !type || x.type === type)
    .reduce((sum, x) => sum + x.quantity, 0);
const describeScenario = (s: Scenario) =>
  JSON.stringify(s, (_k, v) => (typeof v === 'bigint' ? `${v}n` : v));
const jsonWithBigInt = (value: unknown) =>
  JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? `${v}n` : v));

async function fuzz(
  group: string,
  check: (
    scenario: Scenario,
    outcome: Awaited<ReturnType<typeof run>>,
  ) => string[] | Promise<string[]>,
  overrides: ScenarioOverrides = {},
  count = BATTLES_PER_GROUP,
): Promise<string[]> {
  const violations: string[] = [];
  for (let i = 0; i < count; i++) {
    const seed = `${group}-${i}`;
    const scenario = buildScenario(seed, overrides);
    const outcome = await run(scenario);
    const problems = await check(scenario, outcome);
    if (problems.length && !violations.length)
      console.log(
        `${group}: first failing input ${describeScenario(scenario)}`,
      );
    for (const problem of problems)
      violations.push(`[seed ${seed}] ${problem}`);
  }
  return violations;
}

function report(group: string, violations: string[]) {
  if (violations.length)
    console.log(
      `${group}: ${violations.length} violation(s)\n${violations
        .slice(0, MAX_REPORTED)
        .join('\n')}`,
    );
  expect(violations.slice(0, MAX_REPORTED)).toEqual([]);
}

describe('battle engine invariant gates (fuzzed)', () => {
  it(
    'A. fort HP stays within the per-battle siege cap and breach reason matches',
    async () => {
      let repelledMaxShare = 0;
      let repelledMaxHP = 0;
      let repelledSeed = '';
      const breachedButLost: string[] = [];
      let breachedWiped = 0;
      const violations = await fuzz('A', (s, { result }) => {
        const out: string[] = [];
        const start = s.defender.fortHitpoints;
        const maxHP = Math.max(
          Fortifications.find((f) => f.level === s.defender.fortLevel)!
            .hitpoints,
          start,
        );
        const final = result.finalFortHP;
        const floor =
          start - Math.round(C.FORT_DAMAGE.PER_BATTLE_CAP_SHARE * maxHP);
        if (!Number.isInteger(final))
          out.push(`finalFortHP ${final} not integer`);
        if (final < 0) out.push(`finalFortHP ${final} negative`);
        if (final > start) out.push(`finalFortHP ${final} > start ${start}`);
        if (final < floor)
          out.push(`finalFortHP ${final} < start ${start} - 30% of ${maxHP}`);

        const reason = result.canonicalOutcome?.reason;
        const breached = start > 0 && final === 0;
        if (reason === 'FORT_BREACHED' && !breached)
          out.push(`FORT_BREACHED with start ${start} final ${final}`);
        // FORT_BREACHED heads a WIN whose walls fell; a majority-rule LOSS may
        // still carry a breach from the turns the attacker won.
        if (breached && result.result === 'WIN' && reason !== 'FORT_BREACHED')
          out.push(`walls ${start}->0 on a WIN but reason ${reason}`);
        if (breached && result.canonicalOutcome?.assaultSucceeded === false)
          out.push(`walls ${start}->0 without any won assault turn`);
        if (breached && result.result === 'LOSS')
          breachedButLost.push(
            `${s.seed}:${reason}:assault=${result.canonicalOutcome?.assaultSucceeded}`,
          );
        if (breached && reason === 'DEFENSE_WIPED') breachedWiped++;

        if (
          result.result === 'LOSS' &&
          result.canonicalOutcome?.assaultSucceeded === false
        ) {
          const removed = start - final;
          const share = maxHP > 0 ? removed / maxHP : 0;
          if (share > repelledMaxShare) {
            repelledMaxShare = share;
            repelledMaxHP = removed;
            repelledSeed = s.seed;
          }
        }
        return out;
      });
      console.log(
        `A. repelled battles: max fort HP removed ${repelledMaxHP} (${(
          repelledMaxShare * 100
        ).toFixed(
          2,
        )}% of max) [seed ${repelledSeed}]; breached-but-LOSS battles: ${breachedButLost.length} ${breachedButLost.slice(0, 5).join(' ')}; breached-but-DEFENSE_WIPED: ${breachedWiped}`,
      );
      report('A', violations);
    },
    GROUP_TIMEOUT_MS,
  );

  // Majority-of-turns rule: only a WIN is judged here, since a defender can
  // hold the verdict after the walls fell on turns the attacker won. A
  // repelled assault can scratch the walls but never breaches them.
  it(
    'A2. a WIN reports FORT_BREACHED if and only if the walls fell from >0 to 0',
    async () => {
      const violations = await fuzz('A2', (s, { result }) => {
        if (result.result !== 'WIN') return [];
        const start = s.defender.fortHitpoints;
        const breached = start > 0 && result.finalFortHP === 0;
        const reason = result.canonicalOutcome?.reason;
        return breached === (reason === 'FORT_BREACHED')
          ? []
          : [
              `walls ${start}->${result.finalFortHP} but reason ${reason} (${result.result})`,
            ];
      });
      report('A2', violations);
    },
    GROUP_TIMEOUT_MS,
  );

  it(
    'B. casualties respect population, protection and per-stack caps and match the roster',
    async () => {
      const violations = await fuzz(
        'B',
        (s, { result, attacker, defender }) => {
          const out: string[] = [];
          const defPop = population(s.defender);
          const offPop = population(s.attacker, 'OFFENSE');
          const defLost =
            result.Losses.Defender.total + sumQty(result.wounded.defender);
          const attLost =
            result.Losses.Attacker.total + sumQty(result.wounded.attacker);

          // A won assault always lands one hit, so the 8% cap floors at 1.
          const defCap = Math.max(
            result.result === 'WIN' ? 1 : 0,
            Math.floor(defPop * C.SINGLE_ATTACK_POPULATION_LOSS_CAP),
          );
          if (defLost > defCap)
            out.push(
              `defender lost ${defLost} > 8% cap ${defCap} (pop ${defPop})`,
            );
          if (s.isDefenderProtected) {
            const protCap = Math.max(
              1,
              Math.floor(defPop * C.PROTECTED_LOSS_CAP_SHARE),
            );
            if (defLost > protCap)
              out.push(
                `protected defender lost ${defLost} > 1.5% cap ${protCap} (pop ${defPop})`,
              );
          }
          const attCap =
            Math.floor(offPop * C.SINGLE_ATTACK_POPULATION_LOSS_CAP) + 1;
          if (attLost > attCap)
            out.push(
              `attacker lost ${attLost} > 8%+1 cap ${attCap} (offense ${offPop})`,
            );

          for (const [label, before, after, killed, wounded] of [
            [
              'A',
              s.attacker,
              attacker,
              result.Losses.Attacker.units,
              result.wounded.attacker,
            ],
            [
              'D',
              s.defender,
              defender,
              result.Losses.Defender.units,
              result.wounded.defender,
            ],
          ] as const) {
            const start = new Map<string, number>();
            for (const u of roster(before))
              start.set(
                stackKey(u),
                (start.get(stackKey(u)) ?? 0) + u.quantity,
              );
            const end = new Map<string, number>();
            for (const u of roster(after as FuzzUser)) {
              if (u.quantity < 0 || !Number.isFinite(u.quantity))
                out.push(
                  `${label} roster ${stackKey(u)} quantity ${u.quantity}`,
                );
              end.set(stackKey(u), (end.get(stackKey(u)) ?? 0) + u.quantity);
            }
            const lost = new Map<string, number>();
            for (const e of [...killed, ...wounded] as Array<
              Side & { isMercenary?: boolean }
            >) {
              if (Number(e.quantity) < 0)
                out.push(
                  `${label} loss entry ${stackKey(e)} quantity ${e.quantity}`,
                );
              lost.set(
                stackKey(e),
                (lost.get(stackKey(e)) ?? 0) + Number(e.quantity),
              );
            }
            for (const key of new Set([
              ...start.keys(),
              ...end.keys(),
              ...lost.keys(),
            ])) {
              const initial = start.get(key) ?? 0;
              const delta = initial - (end.get(key) ?? 0);
              const recorded = lost.get(key) ?? 0;
              if (delta !== recorded)
                out.push(
                  `${label} ${key}: roster ${initial}->${end.get(key) ?? 0} but killed+wounded ${recorded}`,
                );
              const stackCap = Math.max(
                1,
                Math.floor(initial * C.PER_STACK_CASUALTY_CAP),
              );
              if (recorded > stackCap)
                out.push(
                  `${label} ${key}: lost ${recorded} of ${initial} > stack cap ${stackCap}`,
                );
            }
          }
          return out;
        },
      );
      report('B', violations);
    },
    GROUP_TIMEOUT_MS,
  );

  // The per-battle casualty cap floors at 1 for a won assault unless the
  // defender's daily allowance is already spent (group F takes precedence).
  it(
    'C. a won assault against a manned line always lands at least one casualty',
    async () => {
      let applicable = 0;
      const violations = await fuzz(
        'C',
        (s, { result }) => {
          const defenseUnits = population(s.defender, 'DEFENSE');
          if (result.result !== 'WIN' || defenseUnits < 1) return [];
          applicable++;
          const defLost =
            result.Losses.Defender.total + sumQty(result.wounded.defender);
          return defLost >= 1
            ? []
            : [
                `WIN (${result.canonicalOutcome?.reason}) vs ${defenseUnits} defense units but 0 defender casualties`,
              ];
        },
        { dailyCasualty: 'never' },
      );
      console.log(`C. applicable WIN-vs-manned-line battles: ${applicable}`);
      expect(applicable).toBeGreaterThan(100);
      report('C', violations);
    },
    GROUP_TIMEOUT_MS,
  );

  it(
    'D. pillage stays within the treasury, the per-attack cap and the daily allowance',
    async () => {
      const violations = await fuzz(
        'D',
        (s, { result }) => {
          const out: string[] = [];
          const loot = result.pillagedGold;
          const start = s.defender.gold;
          const shareCap = s.isDefenderProtected
            ? (start * 22n) / 1000n
            : (start * 22n) / 100n;
          if (typeof loot !== 'bigint') out.push(`pillagedGold ${typeof loot}`);
          if (loot < 0n) out.push(`pillagedGold ${loot} negative`);
          if (loot > start) out.push(`pillaged ${loot} > treasury ${start}`);
          if (loot > shareCap)
            out.push(
              `pillaged ${loot} > ${s.isDefenderProtected ? '2.2' : '22'}% cap ${shareCap}`,
            );
          // Loot accrues per won assault turn; a majority-rule LOSS may keep
          // it, but a battle with no won turn takes nothing.
          if (
            result.canonicalOutcome?.assaultSucceeded === false &&
            loot !== 0n
          )
            out.push(
              `no won assault turn (${result.canonicalOutcome?.reason}) but pillaged ${loot}`,
            );
          if (
            s.defenderDailyGoldRemaining !== undefined &&
            loot > s.defenderDailyGoldRemaining
          )
            out.push(
              `pillaged ${loot} > daily allowance ${s.defenderDailyGoldRemaining}`,
            );
          return out;
        },
        { dailyGold: 'random', dailyCasualty: 'never' },
      );
      report('D', violations);
    },
    GROUP_TIMEOUT_MS,
  );

  it(
    'E. identical inputs and seed replay to an identical result',
    async () => {
      const violations = await fuzz('E', async (s, first) => {
        const second = await run(s);
        const a = jsonWithBigInt(first.result);
        const b = jsonWithBigInt(second.result);
        if (a === b) return [];
        let at = 0;
        while (a[at] === b[at]) at++;
        return [
          `replay diverged at char ${at}: ${a.slice(at - 40, at + 40)} vs ${b.slice(at - 40, at + 40)}`,
        ];
      });
      report('E', violations);
    },
    GROUP_TIMEOUT_MS,
  );

  it(
    'F. the daily casualty allowance bounds defender losses',
    async () => {
      const violations = await fuzz(
        'F',
        (s, { result }) => {
          const allowance = s.defenderDailyCasualtyRemaining!;
          const defLost =
            result.Losses.Defender.total + sumQty(result.wounded.defender);
          return defLost > allowance
            ? [`defender lost ${defLost} > daily allowance ${allowance}`]
            : [];
        },
        { dailyCasualty: 'always' },
      );
      report('F', violations);
    },
    GROUP_TIMEOUT_MS,
  );

  it(
    'G. ranged defenders counter on turn 1, and only ranged defenders do',
    async () => {
      let rangedCases = 0;
      let unrangedCases = 0;
      const violations: string[] = [];
      for (let i = 0; i < BATTLES_PER_GROUP; i++) {
        const seed = `G-${i}`;
        const s = buildScenario(seed, { turns: 1 });
        const r = createSeededRandom(`ranged:${seed}`);
        // Every other scenario gets a guaranteed ranged line; the rest are
        // stripped of every ranged source. Random rosters are checked too.
        const mode = i % 3;
        const def = s.defender;
        if (mode === 0) {
          def.items = def.items.filter(
            (item) => !(item.usage === 'DEFENSE' && item.type === 'WEAPON'),
          );
          if (chance(r, 0.5)) {
            def.fortLevel = int(r, 4, 10);
            def.units.push({
              id: 2999,
              userId: 2,
              type: 'DEFENSE',
              level: 2,
              quantity: int(r, 1, 3000),
              isMercenary: false,
            });
          } else {
            const guards = int(r, 1, 3000);
            def.units = def.units.filter(
              (u) => !(u.type === 'DEFENSE' && u.level === 1),
            );
            def.units.push({
              id: 2999,
              userId: 2,
              type: 'DEFENSE',
              level: 1,
              quantity: guards,
              isMercenary: false,
            });
            def.items.push({
              usage: 'DEFENSE',
              type: 'WEAPON',
              level: 1,
              quantity: int(r, 1, guards),
            });
          }
          def.fortHitpoints = Math.min(
            def.fortHitpoints,
            Fortifications.find((f) => f.level === def.fortLevel)!.hitpoints,
          );
        } else if (mode === 1) {
          def.items = def.items.filter(
            (item) => !(item.usage === 'DEFENSE' && item.type === 'WEAPON'),
          );
          def.units = def.units.filter(
            (u) => !(u.type === 'DEFENSE' && u.level === 2),
          );
        }
        // Oracle: the defender's turn-1 ranged attack power, computed from the
        // untouched roster with the same support flags the engine uses.
        const defenseCount = population(def, 'DEFENSE');
        const includeCitz = defenseCount === 0 || def.fortHitpoints <= 0;
        const includeOffense = def.fortHitpoints <= 0 && defenseCount === 0;
        const rangedPower = calculateStrength(
          structuredClone(def) as any,
          'DEFENSE',
          includeCitz,
          includeOffense,
        ).totalStats.RangedAtkPower;
        if (mode === 0 && !(rangedPower > 0))
          violations.push(
            `[seed ${seed}] forced ranged line has power ${rangedPower}`,
          );
        if (mode === 1 && rangedPower !== 0)
          violations.push(
            `[seed ${seed}] stripped line has ranged power ${rangedPower}`,
          );

        const { result } = await run(s);
        const shots = result.mitigationLog.filter(
          (e) => e.source === 'DEFENDER' && e.turn === 1,
        );
        if (rangedPower > 0) {
          rangedCases++;
          if (!shots.some((e) => e.attackType === 'RANGED'))
            violations.push(
              `[seed ${seed}] ranged power ${rangedPower} but no DEFENDER RANGED entry on turn 1`,
            );
        } else {
          unrangedCases++;
          if (shots.length)
            violations.push(
              `[seed ${seed}] no ranged power but ${shots.length} DEFENDER entries on turn 1`,
            );
        }
      }
      console.log(
        `G. ranged cases ${rangedCases}, unranged cases ${unrangedCases}`,
      );
      expect(rangedCases).toBeGreaterThan(300);
      expect(unrangedCases).toBeGreaterThan(300);
      report('G', violations);
    },
    GROUP_TIMEOUT_MS,
  );

  it(
    'H. XP is a non-negative integer and no reported stat is NaN or infinite',
    async () => {
      const violations = await fuzz('H', (_s, { result }) => {
        const out: string[] = [];
        for (const side of ['attacker', 'defender'] as const) {
          const xp = result.experienceGained?.[side];
          if (!Number.isInteger(xp) || (xp as number) < 0)
            out.push(`${side} XP ${xp}`);
        }
        const walk = (value: unknown, path: string) => {
          if (typeof value === 'number') {
            if (!Number.isFinite(value)) out.push(`${path} = ${value}`);
          } else if (value && typeof value === 'object') {
            for (const [k, v] of Object.entries(value)) walk(v, `${path}.${k}`);
          }
        };
        walk(result.casualtySummary, 'casualtySummary');
        walk(result.attackerStats, 'attackerStats');
        walk(result.defenderStats, 'defenderStats');
        walk(result.finalFortHP, 'finalFortHP');
        walk(result.turnsTaken, 'turnsTaken');
        return out;
      });
      report('H', violations);
    },
    GROUP_TIMEOUT_MS,
  );
});
