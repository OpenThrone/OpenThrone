import {
  AutonomousRunResult,
  AutonomousRunArtifact,
  BalanceIterationReport,
  BalanceParameters,
  PersonaComparisonResult,
  PlayerState,
  SimulationConfig,
  TopPlayerSnapshot,
  TopPlayerTimelinePoint,
} from "./types";
import { getPlayerPower } from "./economy";
import { generatePopulation } from "./population";
import { runSimulation as runPopulationSimulation } from "./daycycle";

export interface AutonomousRunnerConfig {
  personaName?: string;
  populationSize?: number;
  levelRange?: [number, number];
  daysPerIteration?: number;
  maxIterations?: number;
  staleWindow?: number;
  staleAttackThreshold?: number;
  targetAttackerWinRate?: number;
  seed?: number;
  simulation?: SimulationConfig;
}

export interface BalancePersona {
  name: string;
  description: string;
  config: AutonomousRunnerConfig;
}

const DEFAULT_BALANCE: BalanceParameters = {
  attackerDamageMultiplier: 1.148,
  defenderCounterDamageMultiplier: 0.8,
  maxPillageSharePerAttack: 0.22,
  damageVarianceMin: 0.92,
  damageVarianceMax: 1.08,
};

function clonePopulation(players: PlayerState[]): PlayerState[] {
  return players.map((player) => ({
    ...player,
    units: { ...player.units },
    items: { ...player.items },
    upgrades: { ...player.upgrades },
    bonuses: { ...player.bonuses },
    dailyLimits: { ...player.dailyLimits },
    behavior: { ...player.behavior },
    intelCache: new Map(player.intelCache),
    attackHistory: new Map(
      Array.from(player.attackHistory.entries()).map(([key, value]) => [
        key,
        [...value],
      ]),
    ),
    incomingAttackHistory: new Map(
      Array.from(player.incomingAttackHistory.entries()).map(([key, value]) => [
        key,
        [...value],
      ]),
    ),
    targetMemory: new Map(
      Array.from(player.targetMemory.entries()).map(([key, value]) => [
        key,
        { ...value },
      ]),
    ),
    bankDepositHistory: [...player.bankDepositHistory],
  }));
}

function snapshotTopPlayers(
  players: PlayerState[],
  limit = 10,
): TopPlayerSnapshot[] {
  return [...players]
    .map((player) => ({
      id: player.id,
      displayName: player.displayName,
      level: player.level,
      gold: player.gold,
      goldInBank: player.goldInBank,
      status: player.status,
      power: getPlayerPower(player),
    }))
    .sort((a, b) => {
      if (b.level !== a.level) return b.level - a.level;
      if (b.power !== a.power) return b.power - a.power;
      return b.gold + b.goldInBank - (a.gold + a.goldInBank);
    })
    .slice(0, limit);
}

function computeReport(
  iteration: number,
  daysSimulated: number,
  state: Awaited<ReturnType<typeof runPopulationSimulation>>,
  adjustments: Partial<BalanceParameters>,
  notes: string[],
  heuristicChanges: string[] = [],
): BalanceIterationReport {
  const daily = state.metrics.dailyResults;
  const maxLevelReached = Math.max(
    ...Array.from(state.players.values()).map((p) => p.level),
  );
  const avgAttacksPerDay =
    daily.reduce((sum, day) => sum + day.totalAttacks, 0) /
    Math.max(daily.length, 1);
  const avgIntelSuccessRate =
    daily.reduce((sum, day) => sum + day.intelSuccessRate, 0) /
    Math.max(daily.length, 1);
  const avgAttackerWinRate =
    daily.reduce((sum, day) => sum + day.attackerWinRate, 0) /
    Math.max(daily.length, 1);
  const avgLootPerDay =
    daily.reduce((sum, day) => sum + day.totalLootTransferred, 0) /
    Math.max(daily.length, 1);
  const staleScore = avgAttacksPerDay < 1 ? 1 : avgAttacksPerDay < 3 ? 0.5 : 0;

  return {
    iteration,
    daysSimulated,
    maxLevelReached,
    avgAttacksPerDay,
    avgIntelSuccessRate,
    avgAttackerWinRate,
    avgLootPerDay,
    staleScore,
    notes,
    adjustments,
    heuristicChanges,
    topPlayers: snapshotTopPlayers(Array.from(state.players.values())),
  };
}

function proposeAdjustments(
  report: BalanceIterationReport,
  current: BalanceParameters,
  targetAttackerWinRate: number,
): {
  next: BalanceParameters;
  notes: string[];
  adjustments: Partial<BalanceParameters>;
} {
  const next = { ...current };
  const notes: string[] = [];
  const adjustments: Partial<BalanceParameters> = {};

  if (report.avgAttacksPerDay < 1) {
    next.attackerDamageMultiplier = Math.min(
      1.35,
      next.attackerDamageMultiplier + 0.03,
    );
    next.maxPillageSharePerAttack = Math.min(
      0.3,
      next.maxPillageSharePerAttack + 0.03,
    );
    adjustments.attackerDamageMultiplier = next.attackerDamageMultiplier;
    adjustments.maxPillageSharePerAttack = next.maxPillageSharePerAttack;
    notes.push("Low attack volume, nudged attacker damage and loot upward.");
  }

  if (report.avgIntelSuccessRate < 0.15) {
    next.defenderCounterDamageMultiplier = Math.max(
      0.65,
      next.defenderCounterDamageMultiplier - 0.02,
    );
    adjustments.defenderCounterDamageMultiplier =
      next.defenderCounterDamageMultiplier;
    notes.push(
      "Intel conversion is poor, reduced defender counter pressure slightly.",
    );
  }

  if (report.avgAttackerWinRate < targetAttackerWinRate - 0.08) {
    next.attackerDamageMultiplier = Math.min(
      1.4,
      next.attackerDamageMultiplier + 0.04,
    );
    adjustments.attackerDamageMultiplier = next.attackerDamageMultiplier;
    notes.push("Attackers underperform target, increased attacker damage.");
  } else if (report.avgAttackerWinRate > targetAttackerWinRate + 0.08) {
    next.attackerDamageMultiplier = Math.max(
      0.9,
      next.attackerDamageMultiplier - 0.04,
    );
    next.defenderCounterDamageMultiplier = Math.min(
      1.0,
      next.defenderCounterDamageMultiplier + 0.03,
    );
    adjustments.attackerDamageMultiplier = next.attackerDamageMultiplier;
    adjustments.defenderCounterDamageMultiplier =
      next.defenderCounterDamageMultiplier;
    notes.push(
      "Attackers overperform target, shifted power back to defenders.",
    );
  }

  if (report.avgLootPerDay < 50000) {
    next.maxPillageSharePerAttack = Math.min(
      0.3,
      next.maxPillageSharePerAttack + 0.02,
    );
    adjustments.maxPillageSharePerAttack = next.maxPillageSharePerAttack;
    notes.push("Loot economy is too quiet, increased pillage share.");
  }

  if (notes.length === 0) {
    notes.push(
      "Metrics were close enough to target; no change this iteration.",
    );
  }

  return { next, notes, adjustments };
}

function tunePopulationBehaviors(
  players: PlayerState[],
  report: BalanceIterationReport,
  personaName: string,
): { players: PlayerState[]; changes: string[] } {
  let conservativeToBalanced = 0;
  let balancedToAggressive = 0;
  let aggressionRaised = 0;
  let riskRaised = 0;
  let spyReduced = 0;

  const rewrittenPlayers = players.map((player) => {
    const next = {
      ...player,
      behavior: { ...player.behavior },
      intelCache: new Map(),
    };

    if (report.avgAttacksPerDay < 1) {
      next.behavior.aggression = Math.min(1, next.behavior.aggression + 0.08);
      aggressionRaised++;
      next.behavior.spyPreference = Math.max(0.35, next.behavior.spyPreference);
      if (next.behavior.turnStrategy === "conservative") {
        next.behavior.turnStrategy = "balanced";
        conservativeToBalanced++;
      }
    }

    if (report.avgIntelSuccessRate < 0.15) {
      next.behavior.spyPreference = Math.max(
        0.2,
        next.behavior.spyPreference - 0.05,
      );
      spyReduced++;
      next.behavior.riskTolerance = Math.min(
        1,
        next.behavior.riskTolerance + 0.05,
      );
      riskRaised++;
    }

    if (report.avgAttackerWinRate > 0.65) {
      next.behavior.riskTolerance = Math.max(
        0.2,
        next.behavior.riskTolerance - 0.03,
      );
    }

    if (personaName === "aggression" && report.avgAttacksPerDay < 2) {
      if (next.behavior.turnStrategy === "balanced") {
        next.behavior.turnStrategy = "aggressive";
        balancedToAggressive++;
      }
      next.behavior.aggression = Math.min(1, next.behavior.aggression + 0.04);
    }

    if (personaName === "fortress" && report.avgAttackerWinRate > 0.5) {
      next.behavior.riskTolerance = Math.max(
        0.15,
        next.behavior.riskTolerance - 0.05,
      );
      next.behavior.spyPreference = Math.min(
        1,
        next.behavior.spyPreference + 0.04,
      );
    }

    if (personaName === "progression" && report.maxLevelReached < 40) {
      next.behavior.wealthPreference = Math.max(
        0.2,
        next.behavior.wealthPreference - 0.05,
      );
      next.behavior.activityLevel = Math.min(
        1,
        next.behavior.activityLevel + 0.03,
      );
    }

    return next;
  });

  const changes: string[] = [];
  if (aggressionRaised > 0) {
    changes.push(`Raised aggression across ${aggressionRaised} agents.`);
  }
  if (conservativeToBalanced > 0) {
    changes.push(
      `Rewrote ${conservativeToBalanced} conservative agents to balanced probing.`,
    );
  }
  if (balancedToAggressive > 0) {
    changes.push(
      `Escalated ${balancedToAggressive} balanced agents to aggressive follow-ups.`,
    );
  }
  if (riskRaised > 0) {
    changes.push(
      `Raised risk tolerance for ${riskRaised} agents after low intel conversion.`,
    );
  }
  if (spyReduced > 0) {
    changes.push(
      `Reduced spy dependence for ${spyReduced} agents after weak intel returns.`,
    );
  }
  if (changes.length === 0) {
    changes.push("No heuristic rewrite required this iteration.");
  }

  return { players: rewrittenPlayers, changes };
}

function isMetaStale(
  reports: BalanceIterationReport[],
  window: number,
  threshold: number,
): boolean {
  if (reports.length < window) return false;
  const recent = reports.slice(-window);
  const levels = recent.map((report) => report.maxLevelReached);
  const attacks = recent.map((report) => report.avgAttacksPerDay);
  const progressionGain = levels[levels.length - 1] - levels[0];
  const avgRecentAttacks =
    attacks.reduce((sum, value) => sum + value, 0) / recent.length;

  return progressionGain <= 1 && avgRecentAttacks <= threshold;
}

export async function runAutonomousBalanceLoop(
  config: AutonomousRunnerConfig = {},
): Promise<AutonomousRunResult> {
  const personaName = config.personaName ?? "equilibrium";
  const populationSize = config.populationSize ?? 100;
  const levelRange = config.levelRange ?? [5, 20];
  const daysPerIteration = config.daysPerIteration ?? 14;
  const maxIterations = config.maxIterations ?? 20;
  const staleWindow = config.staleWindow ?? 3;
  const staleAttackThreshold = config.staleAttackThreshold ?? 0.75;
  const targetAttackerWinRate = config.targetAttackerWinRate ?? 0.5;

  let balance = { ...DEFAULT_BALANCE, ...(config.simulation?.balance ?? {}) };
  let baselinePopulation = generatePopulation(
    populationSize,
    levelRange,
    config.seed,
  );
  const reports: BalanceIterationReport[] = [];
  const topPlayerTimelines: Record<string, TopPlayerTimelinePoint[]> = {};
  let finalState = await runPopulationSimulation(
    clonePopulation(baselinePopulation),
    1,
    config.simulation ?? {},
  );

  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    const state = await runPopulationSimulation(
      clonePopulation(baselinePopulation),
      daysPerIteration,
      {
        ...(config.simulation ?? {}),
        balance,
      },
    );
    finalState = state;

    const provisional = computeReport(
      iteration,
      daysPerIteration,
      state,
      {},
      [],
    );
    const tuning = proposeAdjustments(
      provisional,
      balance,
      targetAttackerWinRate,
    );
    const behaviorRewrite = tunePopulationBehaviors(
      Array.from(state.players.values()).map((player) => ({
        ...player,
        intelCache: new Map(),
        dailyLimits: {
          attacksUsed: 0,
          intelUsed: 0,
          assassinationUsed: 0,
          infiltrationUsed: 0,
        },
      })),
      provisional,
      personaName,
    );
    const report = computeReport(
      iteration,
      daysPerIteration,
      state,
      tuning.adjustments,
      [...tuning.notes, ...behaviorRewrite.changes],
      behaviorRewrite.changes,
    );
    reports.push(report);

    for (const player of report.topPlayers ?? []) {
      if (!topPlayerTimelines[player.id]) {
        topPlayerTimelines[player.id] = [];
      }
      topPlayerTimelines[player.id].push({
        iteration,
        level: player.level,
        gold: player.gold,
        goldInBank: player.goldInBank,
        status: player.status,
        power: player.power,
      });
    }

    balance = tuning.next;
    baselinePopulation = behaviorRewrite.players;

    if (report.maxLevelReached >= 100) {
      const artifact = buildArtifact(
        personaName,
        reports,
        state,
        balance,
        topPlayerTimelines,
        "level_100",
      );
      return {
        finalState: state,
        reports,
        stopReason: "level_100",
        finalBalance: balance,
        persona: personaName,
        artifact,
      };
    }

    if (isMetaStale(reports, staleWindow, staleAttackThreshold)) {
      const artifact = buildArtifact(
        personaName,
        reports,
        state,
        balance,
        topPlayerTimelines,
        "stale_meta",
      );
      return {
        finalState: state,
        reports,
        stopReason: "stale_meta",
        finalBalance: balance,
        persona: personaName,
        artifact,
      };
    }
  }

  const artifact = buildArtifact(
    personaName,
    reports,
    finalState,
    balance,
    topPlayerTimelines,
    "iteration_limit",
  );
  return {
    finalState,
    reports,
    stopReason: "iteration_limit",
    finalBalance: balance,
    persona: personaName,
    artifact,
  };
}

function buildArtifact(
  persona: string,
  reports: BalanceIterationReport[],
  state: Awaited<ReturnType<typeof runPopulationSimulation>>,
  finalBalance: Partial<BalanceParameters>,
  topPlayerTimelines: Record<string, TopPlayerTimelinePoint[]>,
  stopReason: AutonomousRunResult["stopReason"],
): AutonomousRunArtifact {
  return {
    generatedAt: new Date().toISOString(),
    persona,
    stopReason,
    finalBalance,
    reports,
    dailyResults: state.metrics.dailyResults,
    finalPopulation: snapshotTopPlayers(Array.from(state.players.values()), 25),
    topPlayerTimelines,
  };
}

export const BALANCE_PERSONAS: BalancePersona[] = [
  {
    name: "equilibrium",
    description: "Targets stable 50/50-ish combat with moderate activity.",
    config: {
      personaName: "equilibrium",
      populationSize: 100,
      levelRange: [5, 20],
      daysPerIteration: 14,
      maxIterations: 12,
      staleWindow: 3,
      staleAttackThreshold: 0.75,
      targetAttackerWinRate: 0.5,
      seed: 42,
      simulation: { logLevel: "info" },
    },
  },
  {
    name: "aggression",
    description:
      "Prefers higher attack volume and slightly attacker-favored outcomes.",
    config: {
      personaName: "aggression",
      populationSize: 100,
      levelRange: [5, 20],
      daysPerIteration: 14,
      maxIterations: 12,
      staleWindow: 4,
      staleAttackThreshold: 1.5,
      targetAttackerWinRate: 0.58,
      seed: 43,
      simulation: { logLevel: "info" },
    },
  },
  {
    name: "fortress",
    description: "Prefers defender resilience and slower economic bleed.",
    config: {
      personaName: "fortress",
      populationSize: 100,
      levelRange: [5, 20],
      daysPerIteration: 14,
      maxIterations: 12,
      staleWindow: 3,
      staleAttackThreshold: 0.6,
      targetAttackerWinRate: 0.42,
      seed: 44,
      simulation: { logLevel: "info" },
    },
  },
  {
    name: "progression",
    description:
      "Optimizes for reaching late levels without the world going stale too early.",
    config: {
      personaName: "progression",
      populationSize: 120,
      levelRange: [8, 24],
      daysPerIteration: 21,
      maxIterations: 12,
      staleWindow: 4,
      staleAttackThreshold: 0.5,
      targetAttackerWinRate: 0.52,
      seed: 45,
      simulation: { logLevel: "info" },
    },
  },
];

export async function runAllBalancePersonas(
  personas: BalancePersona[] = BALANCE_PERSONAS,
): Promise<{
  results: AutonomousRunResult[];
  comparison: PersonaComparisonResult[];
}> {
  const results: AutonomousRunResult[] = [];

  for (const persona of personas) {
    const result = await runAutonomousBalanceLoop(persona.config);
    results.push(result);
  }

  const comparison = results.map((result) => {
    const reports = result.reports;
    const avgAttacksPerDay =
      reports.reduce((sum, report) => sum + report.avgAttacksPerDay, 0) /
      Math.max(reports.length, 1);
    const avgAttackerWinRate =
      reports.reduce((sum, report) => sum + report.avgAttackerWinRate, 0) /
      Math.max(reports.length, 1);
    const avgIntelSuccessRate =
      reports.reduce((sum, report) => sum + report.avgIntelSuccessRate, 0) /
      Math.max(reports.length, 1);
    const finalMaxLevel = reports[reports.length - 1]?.maxLevelReached ?? 0;

    return {
      persona: result.persona ?? "unknown",
      stopReason: result.stopReason,
      finalBalance: result.finalBalance,
      finalMaxLevel,
      avgAttacksPerDay,
      avgAttackerWinRate,
      avgIntelSuccessRate,
    };
  });

  return { results, comparison };
}

export function printAutonomousRun(result: AutonomousRunResult): void {
  console.log("\n=== Autonomous Balance Run ===");
  console.log(`Stop reason: ${result.stopReason}`);
  console.log(`Iterations: ${result.reports.length}`);
  const last = result.reports[result.reports.length - 1];
  if (last) {
    console.log(`Last max level: ${last.maxLevelReached}`);
    console.log(`Last avg attacks/day: ${last.avgAttacksPerDay.toFixed(2)}`);
    console.log(
      `Last attacker win rate: ${(last.avgAttackerWinRate * 100).toFixed(1)}%`,
    );
    console.log(
      `Last intel success: ${(last.avgIntelSuccessRate * 100).toFixed(1)}%`,
    );
  }
  console.log("Final balance:", JSON.stringify(result.finalBalance, null, 2));
  console.log("================================\n");
}
