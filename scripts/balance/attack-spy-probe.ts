/**
 * Intuitive balance probe for Attack & Spy.
 *
 * Run: bun scripts/balance/attack-spy-probe.ts [--verbose] [--json] [--no-artifact]
 *
 * Output modes:
 *  - default: compact per-scenario table, collapsed log summary, and a JSON
 *    artifact at scripts/balance/output/latest-attack-spy-probe.json
 *  - --verbose: live library debug logging (the old flood), no artifact summary
 *  - --json: only the JSON report on stdout (for agents/parsers)
 *
 * Each scenario answers a player-facing question:
 *  - "If someone my size attacks me, how much do I lose?"
 *  - "Can a weak attacker still 'win' against me?"
 *  - "What happens if I attack someone way too strong?"
 *  - "Does my fort actually protect my units?"
 *  - "Do spy items matter? Does assassination do anything?"
 *  - "What does a level gap do?"
 */
import { Fortifications, ItemTypes } from '@/constants';
import { SpyUser } from '@/models/SpyUser';
import UserModel from '@/models/Users';
import type { PlayerUnit } from '@/types/typings';
import { executeAttack } from '@/utils/attackFunctions';
import { resolveSpyMissionSuccess } from '@/utils/balance/effectiveStats';
import { captureLogs, setLogLevel } from '@/utils/logger';
import MockUserGenerator from '@/utils/MockUserGenerator';
import { createSeededRandom } from '@/utils/random';
import {
  CITIZEN_WORKERS_TARGET,
  simulateAssassination,
} from '@/utils/spyFunctions';

import {
  aggregateLogEntries,
  envSnapshot,
  formatLogSummary,
  parseFlags,
  serializeReport,
  writeArtifact,
} from './lib/report';

const REPEATS = 200;
const ARTIFACT_NAME = 'latest-attack-spy-probe.json';
const SCRIPT_NAME = 'attack-spy-probe';

type UnitSpec = Pick<PlayerUnit, 'type' | 'level' | 'quantity'>;

function fortHP(level: number): number {
  return Fortifications.find((f) => f.level === level)?.hitpoints ?? 50;
}

function makeUser(opts: {
  id?: number;
  level: number;
  fortLevel: number;
  fortHpOverride?: number;
  gold?: bigint;
  units: UnitSpec[];
  items?: Array<{
    id: string;
    usage: string;
    level: number;
    type: string;
    quantity: number;
  }>;
  spyUpgradeLevel?: number;
  sentryUpgradeLevel?: number;
}): UserModel {
  const g = new MockUserGenerator();
  g.setLevel(opts.level)
    .setFortLevel(opts.fortLevel)
    .setFortHitpoints(opts.fortHpOverride ?? fortHP(opts.fortLevel))
    .adjustGold((opts.gold ?? BigInt(1_000_000)) - BigInt(25000))
    .clearUnits()
    .clearItems()
    .clearBattleUpgrades();
  if (opts.spyUpgradeLevel) g.setSpyUpgrade(opts.spyUpgradeLevel);
  if (opts.sentryUpgradeLevel) g.setSentryUpgrade(opts.sentryUpgradeLevel);
  g.addUnits(
    opts.units.map((u, i) => ({
      id: i,
      userId: opts.id ?? 1,
      type: u.type,
      level: u.level,
      quantity: u.quantity,
      isMercenary: false,
    })) as any,
  );
  if (opts.items?.length) g.addItems(opts.items as any);
  const user = new UserModel(g.getUser() as any);
  return user;
}

function army(
  offs = 0,
  defs = 0,
  citz = 0,
  work = 0,
  spies = 10,
  sentries = 10,
): UnitSpec[] {
  const units: UnitSpec[] = [];
  if (offs) units.push({ type: 'OFFENSE', level: 1, quantity: offs });
  if (defs) units.push({ type: 'DEFENSE', level: 1, quantity: defs });
  if (citz) units.push({ type: 'CITIZEN', level: 1, quantity: citz });
  if (work) units.push({ type: 'WORKER', level: 1, quantity: work });
  if (spies) units.push({ type: 'SPY', level: 1, quantity: spies });
  if (sentries) units.push({ type: 'SENTRY', level: 1, quantity: sentries });
  return units;
}

interface BattleStats {
  attackerWinRate: number;
  attackerLossPct: number; // % of attacker offense lost
  defenderLossPct: number; // % of defender population lost
  avgPillage: number;
  fortBreachRate: number;
}

const scenarios: Record<string, BattleStats> = {};

/** Set for --json runs so only the final JSON reaches stdout. */
let quietScenarioPrints = false;

function printScenario(label: string, stats: BattleStats): void {
  if (quietScenarioPrints) return;
  console.log(
    `${label}: winRate=${(stats.attackerWinRate * 100).toFixed(0)}% ` +
      `attLoss=${stats.attackerLossPct.toFixed(1)}% defLoss=${stats.defenderLossPct.toFixed(1)}% ` +
      `pillage=${Math.round(stats.avgPillage).toLocaleString()} breached=${(stats.fortBreachRate * 100).toFixed(0)}%`,
  );
}

async function runBattle(
  label: string,
  attackerOpts: Parameters<typeof makeUser>[0],
  defenderOpts: Parameters<typeof makeUser>[0],
  turns = 10,
): Promise<void> {
  const acc = {
    attackerWins: 0,
    attackerLossPct: 0,
    defenderLossPct: 0,
    avgPillage: 0,
    fortBreached: 0,
  };
  const random = createSeededRandom(label);
  for (let i = 0; i < REPEATS; i++) {
    const attacker = makeUser({ ...attackerOpts, id: 100 });
    const defender = makeUser({ ...defenderOpts, id: 200 });
    const startAttackerOffense = attacker.units
      .filter((u: any) => u.type === 'OFFENSE')
      .reduce((s: number, u: any) => s + u.quantity, 0);
    const startDefPop = [
      ...defender.units,
      ...(defender.mercenaries ?? []),
    ].reduce((s: number, u: any) => s + (u.quantity ?? 0), 0);
    const result = await executeAttack(
      attacker as any,
      defender as any,
      turns,
      (defender.level ?? 0) <= 9,
      { random },
    );
    if (result.result === 'WIN') acc.attackerWins++;
    const attackerOffenseLost = [
      ...(result.Losses?.Attacker?.units ?? []),
      ...(result.wounded?.attacker ?? []),
    ]
      .filter((unit) => unit.type === 'OFFENSE')
      .reduce((sum, unit) => sum + unit.quantity, 0);
    const defenderAttrition =
      (result.Losses?.Defender?.total ?? 0) +
      (result.wounded?.defender ?? []).reduce(
        (sum, unit) => sum + unit.quantity,
        0,
      );
    acc.attackerLossPct +=
      startAttackerOffense > 0
        ? (attackerOffenseLost / startAttackerOffense) * 100
        : 0;
    acc.defenderLossPct +=
      startDefPop > 0 ? (defenderAttrition / startDefPop) * 100 : 0;
    acc.avgPillage += Number(result.pillagedGold ?? 0);
    if ((result as any).finalFortHP <= 0) acc.fortBreached++;
  }
  const stats: BattleStats = {
    attackerWinRate: acc.attackerWins / REPEATS,
    attackerLossPct: acc.attackerLossPct / REPEATS,
    defenderLossPct: acc.defenderLossPct / REPEATS,
    avgPillage: acc.avgPillage / REPEATS,
    fortBreachRate: acc.fortBreached / REPEATS,
  };
  scenarios[label] = stats;
  printScenario(label, stats);
}

interface SpyProbeStats {
  sentryStat: {
    withoutItems: number;
    withOneArmor: number;
    withFullArmor: number;
    rawArmorPower: number;
  };
  successCurve: Array<{ ratio: number; successProbability: number }>;
  assassination: { successRate: number; avgKills: number };
}

const spyStats: SpyProbeStats = {
  sentryStat: {
    withoutItems: 0,
    withOneArmor: 0,
    withFullArmor: 0,
    rawArmorPower: 0,
  },
  successCurve: [],
  assassination: { successRate: 0, avgKills: 0 },
};

function printSpyStats(stats: SpyProbeStats): void {
  console.log('\n=== SPY PROBES ===');
  console.log(
    `sentry defense, 500 sentries: naked=${stats.sentryStat.withoutItems} ` +
      `one armor=${stats.sentryStat.withOneArmor} ` +
      `500 armors=${stats.sentryStat.withFullArmor} ` +
      `(raw power per armor=${stats.sentryStat.rawArmorPower})`,
  );
  console.log(
    `spy success curve: ${stats.successCurve
      .map(
        (entry) =>
          `x${entry.ratio}=${(entry.successProbability * 100).toFixed(1)}%`,
      )
      .join(' ')}`,
  );
  console.log(
    `unlocked assassination: successRate=${(stats.assassination.successRate * 100).toFixed(1)}%, ` +
      `avgKills=${stats.assassination.avgKills.toFixed(2)} per mission`,
  );
}

function spyProbes(): void {
  const base = {
    level: 80,
    fortLevel: 16,
    gold: BigInt(1_000_000),
    spyUpgradeLevel: 16,
    sentryUpgradeLevel: 8,
  };
  const armor = ItemTypes.find(
    (item) =>
      item.usage === 'SENTRY' && item.type === 'ARMOR' && item.level === 1,
  )!;
  const sentryUser = (armorQuantity: number) => {
    const generator = new MockUserGenerator();
    generator
      .setLevel(base.level)
      .setFortLevel(base.fortLevel)
      .setFortHitpoints(fortHP(base.fortLevel))
      .setSentryUpgrade(base.sentryUpgradeLevel)
      .clearUnits()
      .clearItems()
      .clearBattleUpgrades();
    generator.addUnits([
      {
        id: 0,
        userId: 1,
        type: 'SENTRY',
        level: 1,
        quantity: 500,
        isMercenary: false,
      },
    ] as PlayerUnit[]);
    if (armorQuantity > 0) {
      generator.addItems([
        {
          id: armor.id,
          usage: armor.usage,
          type: armor.type,
          level: armor.level,
          quantity: armorQuantity,
        },
      ] as Parameters<MockUserGenerator['addItems']>[0]);
    }
    return new SpyUser(generator.getUser());
  };
  spyStats.sentryStat = {
    withoutItems: sentryUser(0).sentry,
    withOneArmor: sentryUser(1).sentry,
    withFullArmor: sentryUser(500).sentry,
    rawArmorPower: armor.MeleeDefPower,
  };

  spyStats.successCurve = [0.25, 0.5, 0.9, 1, 1.1, 2, 4].map((ratio) => ({
    ratio,
    successProbability: resolveSpyMissionSuccess({
      attackerSpy: 1000 * ratio,
      defenderSentry: 1000,
      random: () => 0.5,
    }).probability,
  }));

  let kills = 0;
  let successes = 0;
  const random = createSeededRandom('unlocked-assassination-probe');
  for (let i = 0; i < REPEATS; i += 1) {
    const attacker = makeUser({
      ...base,
      units: [
        ...army(0, 0, 100, 100, 3000, 0),
        { type: 'SPY', level: 3, quantity: 5 },
      ],
    });
    const defender = makeUser({
      ...base,
      units: army(0, 0, 100, 100, 0, 5),
    });
    const result = simulateAssassination(
      attacker,
      defender,
      5,
      CITIZEN_WORKERS_TARGET,
      { random, turns: 10 },
    );
    if (result.success) successes += 1;
    kills += result.unitsKilled;
  }
  spyStats.assassination = {
    successRate: successes / REPEATS,
    avgKills: kills / REPEATS,
  };
}

async function runAllProbes(quiet: boolean): Promise<void> {
  quietScenarioPrints = quiet;
  if (!quiet)
    console.log(`=== BATTLE PROBES (${REPEATS} seeded runs each) ===`);

  // 1. Mirror: two identical mid-game players
  const mirror = {
    level: 20,
    fortLevel: 6,
    gold: BigInt(5_000_000),
    units: army(1000, 800, 1600, 900),
  };
  await runBattle('mirror-lv20 (equal armies)', mirror, mirror);

  // 2. Attacker with 10x LESS offense than defender defense (baited / bad intel)
  await runBattle(
    'weak-attacker (100 vs 2000 def)',
    {
      level: 20,
      fortLevel: 6,
      gold: BigInt(1_000_000),
      units: army(100, 0, 100, 100),
    },
    {
      level: 20,
      fortLevel: 6,
      gold: BigInt(5_000_000),
      units: army(0, 2000, 1600, 900),
    },
  );

  // 3. Overwhelming attacker vs under-defended rich target (bank on hand)
  await runBattle(
    'goliath-attacker (5000 vs 300 def)',
    {
      level: 20,
      fortLevel: 6,
      gold: BigInt(1_000_000),
      units: army(5000, 0, 100, 100),
    },
    {
      level: 20,
      fortLevel: 6,
      gold: BigInt(50_000_000),
      units: army(0, 300, 4000, 2000),
    },
  );

  // 4. Level gap at env range (attacker +10 levels, equal armies)
  await runBattle(
    'level-gap (+10 attacker)',
    {
      level: 30,
      fortLevel: 6,
      gold: BigInt(1_000_000),
      units: army(1000, 0, 100, 100),
    },
    {
      level: 20,
      fortLevel: 6,
      gold: BigInt(5_000_000),
      units: army(0, 800, 1600, 900),
    },
  );

  // 5. Protected lowbie (defender lv8 => 0.1x damage), attacker at max range
  await runBattle(
    'protected-lv8-defender',
    {
      level: 18,
      fortLevel: 6,
      gold: BigInt(1_000_000),
      units: army(1000, 0, 100, 100),
    },
    {
      level: 8,
      fortLevel: 3,
      gold: BigInt(5_000_000),
      units: army(0, 300, 800, 400),
    },
  );

  // 6. Fort effect: full fort vs pre-flattened fort (same armies)
  const fortA = {
    level: 20,
    fortLevel: 6,
    gold: BigInt(5_000_000),
    units: army(2000, 0, 100, 100),
  };
  const fullFort = { ...fortA, fortHpOverride: fortHP(6) };
  const deadFort = { ...fortA, fortHpOverride: 0 };
  const fortDef = {
    level: 20,
    fortLevel: 6,
    gold: BigInt(5_000_000),
    units: army(0, 1000, 1600, 900),
  };
  await runBattle('def-full-fort (750hp)', fullFort, fortDef);
  await runBattle('def-fort-already-dead (0hp)', deadFort, {
    ...fortDef,
    fortHpOverride: 0,
  });

  // 7. Turn commitment: 1-turn poke vs 10-turn full assault (mirror)
  await runBattle('mirror-1turn-poke', mirror, mirror, 1);

  spyProbes();
  if (!quiet) printSpyStats(spyStats);
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));

  // Diagnostics always want DEBUG data; capture keeps the console clean unless
  // --verbose explicitly opts into live (old-style) logging.
  setLogLevel('DEBUG');

  let logs: import('@/utils/logger').LogEntry[] = [];
  if (flags.verbose) {
    await runAllProbes(flags.json);
  } else {
    const captured = await captureLogs(() => runAllProbes(flags.json));
    logs = captured.logs;
  }

  const report = {
    generatedAt: new Date().toISOString(),
    script: SCRIPT_NAME,
    repeats: REPEATS,
    env: envSnapshot(),
    battleScenarios: scenarios,
    spyProbes: spyStats,
    logSummary: logs.length
      ? { totalEntries: logs.length, groups: aggregateLogEntries(logs) }
      : { totalEntries: 0, groups: [] },
  };

  if (flags.json) {
    console.log(serializeReport(report));
    return;
  }

  if (!flags.verbose && logs.length) {
    console.log('');
    for (const line of formatLogSummary(logs)) console.log(line);
  }

  if (flags.artifact) {
    const artifactPath = await writeArtifact(report, ARTIFACT_NAME);
    console.log(`\nartifact: ${artifactPath}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
