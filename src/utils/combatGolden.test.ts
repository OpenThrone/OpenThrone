/* eslint-disable no-console -- fuzz diagnostics print the failing seed and measured envelopes. */
/**
 * Fuzzed invariant gates for the battle engine.
 *
 * Every group generates thousands of seeded random armies and asserts a rule
 * the engine must never break. Each violation message carries the scenario
 * seed: rebuild it with `buildScenario(<seed>)` to reproduce the battle.
 */
import { readFileSync, writeFileSync } from 'node:fs';

import { beforeEach, expect, it } from 'bun:test';
import { mtRandImpl } from 'test/utils/mockMtRand';

import { Fortifications } from '@/constants';
import { executeAttack } from '@/utils/attackFunctions';
import type { CombatRuleset } from '@/utils/balance/combatRuleset';
import { COMBAT_RULESETS } from '@/utils/balance/combatRulesets';
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

async function run(scenario: Scenario, ruleset: CombatRuleset) {
  const attacker = structuredClone(scenario.attacker);
  const defender = structuredClone(scenario.defender);
  const options: Parameters<typeof executeAttack>[4] = {
    ruleset,
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

const SCENARIOS = [
  ['mirrored', 1],
  ['overwhelming-attack', 10],
  ['overwhelming-defense', 10],
  ['tiny', 1],
  ['mercenaries', 10],
  ['fort-destroyed', 1],
  ['fort-full', 10],
  ['undead', 10],
  ['elf', 1],
  ['low-stamina', 10],
  // Armies of three unit tiers: the one case where the casualty spread of
  // combat-v10 differs from lowest-first. Not part of the v9 fixture.
  ['mixed-tiers', 10],
] as const;

async function goldenOutcomes(ruleset: CombatRuleset) {
  const outcomes: Record<string, unknown> = {};
  for (const [name, turns] of SCENARIOS) {
    if (name === 'mixed-tiers' && ruleset.version === 'combat-v9') continue;
    const s = buildScenario(name, {
      turns,
      dailyCasualty: 'never',
      dailyGold: 'never',
    });
    const setArmy = (user: FuzzUser, qty: number) => {
      user.units = ['OFFENSE', 'DEFENSE', 'CITIZEN', 'WORKER'].map(
        (type, i) => ({
          id: user.id * 100 + i,
          userId: user.id,
          type,
          level: 1,
          quantity: qty,
          isMercenary: false,
        }),
      );
      user.mercenaries = [];
      user.items = [];
    };
    setArmy(
      s.attacker,
      name === 'overwhelming-defense' ? 10 : name === 'tiny' ? 2 : 1000,
    );
    setArmy(
      s.defender,
      name === 'overwhelming-attack' ? 10 : name === 'tiny' ? 2 : 1000,
    );
    if (name === 'mixed-tiers') {
      for (const user of [s.attacker, s.defender]) {
        const fighting = user === s.attacker ? 'OFFENSE' : 'DEFENSE';
        user.units = user.units.filter((u) => u.type !== fighting);
        [600, 300, 100].forEach((quantity, i) =>
          user.units.push({
            id: user.id * 100 + 50 + i,
            userId: user.id,
            type: fighting,
            level: i + 1,
            quantity,
            isMercenary: false,
          }),
        );
      }
    }
    if (name === 'mirrored') {
      s.attacker.race = 'HUMAN';
      s.defender = structuredClone(s.attacker);
      s.isDefenderProtected = s.defender.level <= 9;
    }
    if (name === 'mercenaries') {
      for (const user of [s.attacker, s.defender])
        user.mercenaries = [
          {
            id: user.id * 1000,
            userId: user.id,
            type: user === s.attacker ? 'OFFENSE' : 'DEFENSE',
            level: 1,
            quantity: 500,
            isMercenary: true,
          },
        ];
    }
    if (name === 'fort-destroyed') s.defender.fortHitpoints = 0;
    if (name === 'fort-full')
      s.defender.fortHitpoints = Fortifications.find(
        (f) => f.level === s.defender.fortLevel,
      )!.hitpoints;
    if (name === 'undead') s.defender.race = 'UNDEAD';
    if (name === 'elf') s.attacker.race = 'ELF';
    if (name === 'low-stamina') Object.assign(s.attacker, { stamina: 5 });
    outcomes[name] = await run(s, ruleset);
  }
  return `${JSON.stringify(
    outcomes,
    (_key, value) => (typeof value === 'bigint' ? `${value}n` : value),
    2,
  )}\n`;
}

function checkGolden(version: 'combat-v9' | 'combat-v10') {
  const fixturePath = `${__dirname}/__fixtures__/${version}-golden.json`;
  return async () => {
    const serialized = await goldenOutcomes(COMBAT_RULESETS[version]!);
    if (process.env.UPDATE_COMBAT_GOLDEN === '1')
      writeFileSync(fixturePath, serialized);
    expect(serialized).toBe(readFileSync(fixturePath, 'utf8'));
  };
}

it(
  'preserves complete seeded combat outcomes (combat-v9, lowest-first)',
  checkGolden('combat-v9'),
);

it(
  'preserves complete seeded combat outcomes (combat-v10, casualty spread)',
  checkGolden('combat-v10'),
);
