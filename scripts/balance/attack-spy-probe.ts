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
import UserModel from '@/models/Users';
import { SpyUser } from '@/models/SpyUser';
import { executeAttack } from '@/utils/attackFunctions';
import { resolveSpyMissionSuccess } from '@/utils/balance/effectiveStats';
import { captureLogs, setLogLevel } from '@/utils/logger';
import MockUserGenerator from '@/utils/MockUserGenerator';
import { createSeededRandom } from '@/utils/random';
import {
  CITIZEN_WORKERS_TARGET,
  simulateAssassination,
  simulateIntel,
} from '@/utils/spyFunctions';
import type { PlayerUnit } from '@/types/typings';

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
  items?: Array<{ id: string; usage: string; level: number; type: string; quantity: number }>;
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

function army(offs = 0, defs = 0, citz = 0, work = 0, spies = 10, sentries = 10): UnitSpec[] {
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
  for (let i = 0; i < REPEATS; i++) {
    const attacker = makeUser({ ...attackerOpts, id: 100 });
    const defender = makeUser({ ...defenderOpts, id: 200 });
    const startAttackerOffense = attacker.units
      .filter((u: any) => u.type === 'OFFENSE')
      .reduce((s: number, u: any) => s + u.quantity, 0);
    const startDefPop = [...defender.units, ...(defender.mercenaries ?? [])].reduce(
      (s: number, u: any) => s + (u.quantity ?? 0),
      0,
    );
    const random = createSeededRandom(`${label}-${i}`);
    const result = await executeAttack(
      attacker as any,
      defender as any,
      turns,
      (defender.level ?? 0) <= 9,
      { random },
    );
    if (result.result === 'WIN') acc.attackerWins++;
    const attackerOffenseLost = (result.Losses?.Attacker?.units ?? [])
      .filter((u: any) => u.type === 'OFFENSE')
      .reduce((s: number, u: any) => s + u.quantity, 0);
    acc.attackerLossPct +=
      startAttackerOffense > 0 ? (attackerOffenseLost / startAttackerOffense) * 100 : 0;
    acc.defenderLossPct +=
      startDefPop > 0 ? (result.Losses?.Defender?.total ?? 0) / startDefPop * 100 : 0;
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
  v1GateKnifeEdge: {
    defenderSentryStat: number;
    attackerSpyStatAboveParity: number;
    attackerSpyStatBelowParity: number;
    successAboveParity: boolean;
    successBelowParity: boolean;
  };
  sentryStat: { withoutItems: number; withItems: number; expectedItemPower: number };
  v2Curve: Array<{ ratio: number; successProbability: number }>;
  assassination: { successRate: number; avgKills: number };
}

const spyStats: SpyProbeStats = {
  v1GateKnifeEdge: {
    defenderSentryStat: 0,
    attackerSpyStatAboveParity: 0,
    attackerSpyStatBelowParity: 0,
    successAboveParity: false,
    successBelowParity: false,
  },
  sentryStat: { withoutItems: 0, withItems: 0, expectedItemPower: 0 },
  v2Curve: [],
  assassination: { successRate: 0, avgKills: 0 },
};

function printSpyStats(stats: SpyProbeStats): void {
  console.log('\n=== SPY PROBES ===');
  console.log(
    `V1 gate vs sentryStat=${stats.v1GateKnifeEdge.defenderSentryStat}: ` +
      `spy=${stats.v1GateKnifeEdge.attackerSpyStatAboveParity} -> success=${stats.v1GateKnifeEdge.successAboveParity} | ` +
      `spy=${stats.v1GateKnifeEdge.attackerSpyStatBelowParity} -> success=${stats.v1GateKnifeEdge.successBelowParity} ` +
      `(no RNG between near-parity outcomes = knife-edge)`,
  );
  console.log(
    `sentry stat, 500 sentries: no items=${stats.sentryStat.withoutItems} ` +
      `with 500 armors=${stats.sentryStat.withItems} (battle engine would add ~${stats.sentryStat.expectedItemPower})`,
  );
  console.log(
    `V2 logistic curve: ${stats.v2Curve
      .map((p) => `x${p.ratio}=${(p.successProbability * 100).toFixed(0)}%`)
      .join(' ')}`,
  );
  console.log(
    `assassination: successRate=${(stats.assassination.successRate * 100).toFixed(0)}%, ` +
      `avgKills=${stats.assassination.avgKills.toFixed(2)} per mission`,
  );
}

function spyProbes(): void {
  const base = { level: 20, fortLevel: 8, gold: BigInt(1_000_000) };
  const spyUser = (spies: number, sentries: number, items: any[] = []) =>
    makeUser({
      ...base,
      spyUpgradeLevel: 8,
      sentryUpgradeLevel: 8,
      units: army(0, 0, 100, 100, spies, sentries),
      items,
    });

  // A. V1 binary gate knife-edge (95% of players per current rollout).
  //    Spy and sentry stats receive different bonus multipliers, so measure a
  //    per-spy stat empirically and size two attackers just above/below parity.
  const paritySentries = spyUser(0, 1000);
  const defenderSentryStat = paritySentries.sentry;
  const calibration = spyUser(100, 0);
  const spyStatPerUnit = calibration.spy / 100;
  const above = spyUser(Math.ceil((defenderSentryStat * 1.002) / spyStatPerUnit), 0);
  const below = spyUser(Math.floor((defenderSentryStat * 0.998) / spyStatPerUnit), 0);
  spyStats.v1GateKnifeEdge = {
    defenderSentryStat,
    attackerSpyStatAboveParity: above.spy,
    attackerSpyStatBelowParity: below.spy,
    successAboveParity: simulateIntel(above as any, paritySentries as any, 5, {
      random: () => 0.5,
    }).success,
    successBelowParity: simulateIntel(below as any, paritySentries as any, 5, {
      random: () => 0.5,
    }).success,
  };

  // B. Spy items nearly ignored by the mission gate (statsService adds once per stack)
  const rawUser = (sentries: number, items: any[] = []) => {
    const g = new MockUserGenerator();
    g.setLevel(20).setFortLevel(8).setFortHitpoints(1500).adjustGold(975000n)
      .clearUnits().clearItems().clearBattleUpgrades()
      .setSentryUpgrade(8).setSpyUpgrade(8);
    g.addUnits([
      { id: 0, userId: 1, type: 'SENTRY', level: 1, quantity: sentries, isMercenary: false },
      { id: 1, userId: 1, type: 'CITIZEN', level: 1, quantity: 100, isMercenary: false },
    ] as any);
    if (items.length) g.addItems(items);
    return g.getUser();
  };
  const nakedSentry = new SpyUser(rawUser(500) as any);
  const sentryArmor = ItemTypes.find(
    (i: any) => i.usage === 'SENTRY' && i.type === 'ARMOR' && Number(i.level) === 1,
  );
  const equippedSentry = new SpyUser(
    rawUser(500, [
      { id: sentryArmor?.id ?? 'SENTRY_ARMOR', usage: 'SENTRY', level: 1, type: 'ARMOR', quantity: 500 },
    ]) as any,
  );
  spyStats.sentryStat = {
    withoutItems: nakedSentry.sentry,
    withItems: equippedSentry.sentry,
    expectedItemPower: ((sentryArmor as any)?.MeleeDefPower ?? 0) * 500,
  };

  // C. V2 logistic curve at ratios
  const ratios = [0.25, 0.5, 0.9, 1, 1.1, 2, 4];
  spyStats.v2Curve = ratios.map((r) => ({
    ratio: r,
    successProbability: resolveSpyMissionSuccess({
      attackerSpy: 1000 * r,
      defenderSentry: 1000,
      random: () => 0.5,
    }).probability,
  }));

  // D. Assassination kills even on guaranteed success
  let kills = 0;
  let successes = 0;
  for (let i = 0; i < REPEATS; i++) {
    const att = spyUser(3000, 0); // overwhelming spies
    const def = spyUser(0, 5, []); // token sentry
    const res = simulateAssassination(att as any, def as any, 5, CITIZEN_WORKERS_TARGET as any, {
      random: createSeededRandom(`assass-${i}`),
      turns: 10,
    });
    if (res.success) successes++;
    kills += Number(res.unitsKilled ?? 0);
  }
  spyStats.assassination = {
    successRate: successes / REPEATS,
    avgKills: kills / REPEATS,
  };
}

async function runAllProbes(quiet: boolean): Promise<void> {
  quietScenarioPrints = quiet;
  if (!quiet) console.log(`=== BATTLE PROBES (${REPEATS} seeded runs each) ===`);

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
    { level: 20, fortLevel: 6, gold: BigInt(1_000_000), units: army(100, 0, 100, 100) },
    { level: 20, fortLevel: 6, gold: BigInt(5_000_000), units: army(0, 2000, 1600, 900) },
  );

  // 3. Overwhelming attacker vs under-defended rich target (bank on hand)
  await runBattle(
    'goliath-attacker (5000 vs 300 def)',
    { level: 20, fortLevel: 6, gold: BigInt(1_000_000), units: army(5000, 0, 100, 100) },
    { level: 20, fortLevel: 6, gold: BigInt(50_000_000), units: army(0, 300, 4000, 2000) },
  );

  // 4. Level gap at env range (attacker +10 levels, equal armies)
  await runBattle(
    'level-gap (+10 attacker)',
    { level: 30, fortLevel: 6, gold: BigInt(1_000_000), units: army(1000, 0, 100, 100) },
    { level: 20, fortLevel: 6, gold: BigInt(5_000_000), units: army(0, 800, 1600, 900) },
  );

  // 5. Protected lowbie (defender lv8 => 0.1x damage), attacker at max range
  await runBattle(
    'protected-lv8-defender',
    { level: 18, fortLevel: 6, gold: BigInt(1_000_000), units: army(1000, 0, 100, 100) },
    { level: 8, fortLevel: 3, gold: BigInt(5_000_000), units: army(0, 300, 800, 400) },
  );

  // 6. Fort effect: full fort vs pre-flattened fort (same armies)
  const fortA = { level: 20, fortLevel: 6, gold: BigInt(5_000_000), units: army(2000, 0, 100, 100) };
  const fullFort = { ...fortA, fortHpOverride: fortHP(6) };
  const deadFort = { ...fortA, fortHpOverride: 0 };
  const fortDef = { level: 20, fortLevel: 6, gold: BigInt(5_000_000), units: army(0, 1000, 1600, 900) };
  await runBattle('def-full-fort (750hp)', fullFort, fortDef);
  await runBattle('def-fort-already-dead (0hp)', deadFort, { ...fortDef, fortHpOverride: 0 });

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
