import { runSimulation as runPopulationSimulation } from './daycycle';
import { getPlayerPower, getWealthGiniCoefficient } from './economy';
import { generatePopulation } from './population';
import type {
  BalanceObjectiveTargets,
  BalanceParameters,
  ClosedLoopBalanceArtifact,
  ClosedLoopBalanceConfig,
  ClosedLoopBalanceResult,
  ClosedLoopCandidateResult,
  ClosedLoopDiagnosis,
  ClosedLoopIterationReport,
  ClosedLoopMetrics,
  ClosedLoopProgressEvent,
  ClosedLoopProgressPayload,
  ClosedLoopScoreComponent,
  PlayerState,
  SimulationConfig,
  TopPlayerSnapshot,
} from './types';

const DEFAULT_BALANCE: BalanceParameters = {
  attackerDamageMultiplier: 1.238,
  defenderCounterDamageMultiplier: 0.83,
  maxPillageSharePerAttack: 0.22,
  damageVarianceMin: 0.92,
  damageVarianceMax: 1.08,
};

const DEFAULT_TARGETS: BalanceObjectiveTargets = {
  attacksPerActivePlayerDay: [1.2, 4.5],
  highTurnAttackShare: [0.45, 0.85],
  attackerWinRate: [0.42, 0.6],
  lootToProductionRatio: [0.25, 1.1],
  fortBreachRate: [0.02, 0.25],
  goldGini: [0.18, 0.62],
  averageHeldTurns: [4, 32],
};

const SCORE_WEIGHTS: Record<keyof ClosedLoopMetrics, number> = {
  daysSimulated: 0,
  activePlayers: 0,
  totalAttacks: 0,
  attacksPerActivePlayerDay: 2.8,
  highTurnAttackShare: 1.6,
  attackerWinRate: 2.2,
  avgTurnsPerAttack: 0,
  avgXpPerDay: 0,
  avgXpPerTurn: 0,
  lootToProductionRatio: 1.7,
  fortBreachRate: 1.2,
  avgLootPerAttack: 0,
  avgLootPerDay: 0,
  avgBankDepositsPerDay: 0,
  goldGini: 1.1,
  averageHeldTurns: 0.9,
  maxLevel: 0,
  avgLevel: 0,
};

function mergeTargets(
  targets?: Partial<BalanceObjectiveTargets>,
): BalanceObjectiveTargets {
  return {
    ...DEFAULT_TARGETS,
    ...targets,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function nowIso(): string {
  return new Date().toISOString();
}

function createProgressEmitter(
  callback?: (event: ClosedLoopProgressEvent) => void,
): (event: ClosedLoopProgressPayload) => void {
  return (event) =>
    callback?.({ ...event, timestamp: nowIso() } as ClosedLoopProgressEvent);
}

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
  limit = 25,
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

function scoreRange(value: number, target: [number, number]): number {
  const [min, max] = target;
  if (value >= min && value <= max) return 0;
  const width = Math.max(0.0001, max - min);
  const distance = value < min ? min - value : value - max;
  return distance / width;
}

function calculateMetrics(
  state: Awaited<ReturnType<typeof runPopulationSimulation>>,
): ClosedLoopMetrics {
  const daily = state.metrics.dailyResults;
  const daysSimulated = Math.max(1, daily.length);
  const players = Array.from(state.players.values());
  const activePlayers = Math.max(
    1,
    players.filter((player) => player.status === 'active').length,
  );
  const totalAttacks = daily.reduce((sum, day) => sum + day.totalAttacks, 0);
  const highTurnAttacks = daily.reduce(
    (sum, day) => sum + day.highTurnAttacks,
    0,
  );
  const totalLoot = daily.reduce(
    (sum, day) => sum + day.totalLootTransferred,
    0,
  );
  const totalProduction = daily.reduce(
    (sum, day) => sum + day.totalTurnIncome,
    0,
  );
  const totalFortBreaches = daily.reduce(
    (sum, day) => sum + day.fortBreaches,
    0,
  );
  const totalSpentTurns = daily.reduce(
    (sum, day) => sum + day.attackTurnsSpent,
    0,
  );
  const totalXpAwarded = daily.reduce(
    (sum, day) => sum + day.totalXpAwarded,
    0,
  );
  const totalBankDeposits = daily.reduce(
    (sum, day) => sum + day.totalBankDeposits,
    0,
  );
  const resolvedWinDays = daily.filter((day) => day.totalAttacks > 0);
  const attackerWinRate =
    resolvedWinDays.reduce((sum, day) => sum + day.attackerWinRate, 0) /
    Math.max(1, resolvedWinDays.length);
  const heldTurns =
    players.reduce((sum, player) => sum + player.attackTurns, 0) /
    Math.max(1, players.length);

  return {
    daysSimulated,
    activePlayers,
    totalAttacks,
    attacksPerActivePlayerDay: totalAttacks / activePlayers / daysSimulated,
    highTurnAttackShare: highTurnAttacks / Math.max(1, totalAttacks),
    attackerWinRate,
    avgTurnsPerAttack: totalSpentTurns / Math.max(1, totalAttacks),
    avgXpPerDay: totalXpAwarded / daysSimulated,
    avgXpPerTurn: totalXpAwarded / Math.max(1, totalSpentTurns),
    lootToProductionRatio: totalLoot / Math.max(1, totalProduction),
    fortBreachRate: totalFortBreaches / Math.max(1, totalAttacks),
    avgLootPerAttack: totalLoot / Math.max(1, totalAttacks),
    avgLootPerDay: totalLoot / daysSimulated,
    avgBankDepositsPerDay: totalBankDeposits / daysSimulated,
    goldGini: getWealthGiniCoefficient(players),
    averageHeldTurns: heldTurns,
    maxLevel: Math.max(...players.map((player) => player.level), 1),
    avgLevel:
      players.reduce((sum, player) => sum + player.level, 0) /
      Math.max(1, players.length),
  };
}

function scoreMetrics(
  metrics: ClosedLoopMetrics,
  targets: BalanceObjectiveTargets,
): { score: number; components: ClosedLoopScoreComponent[] } {
  const components = Object.entries(targets).map(([metric, target]) => {
    const key = metric as keyof BalanceObjectiveTargets &
      keyof ClosedLoopMetrics;
    const weight = SCORE_WEIGHTS[key] ?? 0;
    const penalty = scoreRange(metrics[key] as number, target) * weight;
    return {
      metric: key,
      value: metrics[key] as number,
      target,
      weight,
      penalty,
    };
  });

  return {
    score: components.reduce((sum, component) => sum + component.penalty, 0),
    components,
  };
}

function diagnose(
  metrics: ClosedLoopMetrics,
  targets: BalanceObjectiveTargets,
): ClosedLoopDiagnosis[] {
  const diagnoses: ClosedLoopDiagnosis[] = [];
  const add = (
    code: string,
    message: string,
    severity: ClosedLoopDiagnosis['severity'] = 'warn',
  ) => diagnoses.push({ code, message, severity });

  if (
    metrics.attacksPerActivePlayerDay < targets.attacksPerActivePlayerDay[0]
  ) {
    add(
      'pvp_activity_low',
      'Players are not spending enough turns attacking; PvP needs stronger rewards or less defensive drag.',
      'critical',
    );
  }
  if (
    metrics.attacksPerActivePlayerDay > targets.attacksPerActivePlayerDay[1]
  ) {
    add(
      'pvp_activity_high',
      'Attack volume is above target; the game may feel too punishing or chaotic.',
    );
  }
  if (metrics.highTurnAttackShare < targets.highTurnAttackShare[0]) {
    add(
      'turn_commitment_low',
      'Too many attacks are low-turn probes; committed raids should be more attractive.',
    );
  }
  if (metrics.attackerWinRate < targets.attackerWinRate[0]) {
    add(
      'attacker_winrate_low',
      'Attackers are losing too often, which discourages PvP.',
      'critical',
    );
  }
  if (metrics.attackerWinRate > targets.attackerWinRate[1]) {
    add(
      'attacker_winrate_high',
      'Attackers are winning too easily; defense investment is not paying enough.',
    );
  }
  if (metrics.lootToProductionRatio < targets.lootToProductionRatio[0]) {
    add(
      'loot_pressure_low',
      'Pillage is too small compared with generated gold, so attacking may not feel economically relevant.',
    );
  }
  if (metrics.lootToProductionRatio > targets.lootToProductionRatio[1]) {
    add(
      'loot_pressure_high',
      'Pillage is too large compared with generated gold, risking runaway raiding.',
    );
  }
  if (metrics.goldGini > targets.goldGini[1]) {
    add(
      'wealth_concentration_high',
      'Gold concentration is high; top players may snowball too hard.',
    );
  }
  if (metrics.averageHeldTurns > targets.averageHeldTurns[1]) {
    add(
      'turn_hoarding_high',
      'Players are hoarding turns instead of spending them on PvP.',
    );
  }

  if (diagnoses.length === 0) {
    add(
      'within_targets',
      'Closed-loop metrics are within target bands.',
      'info',
    );
  }

  return diagnoses;
}

function uniqueCandidates(
  candidates: Array<{ label: string; balance: BalanceParameters }>,
): Array<{ label: string; balance: BalanceParameters }> {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = JSON.stringify(candidate.balance);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildCandidates(
  current: BalanceParameters,
  metrics: ClosedLoopMetrics,
  targets: BalanceObjectiveTargets,
): Array<{ label: string; balance: BalanceParameters }> {
  const candidates: Array<{ label: string; balance: BalanceParameters }> = [
    { label: 'current', balance: current },
  ];

  const add = (label: string, patch: Partial<BalanceParameters>) => {
    candidates.push({
      label,
      balance: {
        attackerDamageMultiplier: clamp(
          patch.attackerDamageMultiplier ?? current.attackerDamageMultiplier,
          0.85,
          1.55,
        ),
        defenderCounterDamageMultiplier: clamp(
          patch.defenderCounterDamageMultiplier ??
            current.defenderCounterDamageMultiplier,
          0.55,
          1.1,
        ),
        maxPillageSharePerAttack: clamp(
          patch.maxPillageSharePerAttack ?? current.maxPillageSharePerAttack,
          0.12,
          0.3,
        ),
        damageVarianceMin: clamp(
          patch.damageVarianceMin ?? current.damageVarianceMin,
          0.82,
          0.98,
        ),
        damageVarianceMax: clamp(
          patch.damageVarianceMax ?? current.damageVarianceMax,
          1.02,
          1.22,
        ),
      },
    });
  };

  if (
    metrics.attacksPerActivePlayerDay < targets.attacksPerActivePlayerDay[0] ||
    metrics.attackerWinRate < targets.attackerWinRate[0]
  ) {
    add('pvp_reward_up', {
      attackerDamageMultiplier: current.attackerDamageMultiplier + 0.04,
      maxPillageSharePerAttack: current.maxPillageSharePerAttack + 0.03,
    });
    add('defender_pressure_down', {
      defenderCounterDamageMultiplier:
        current.defenderCounterDamageMultiplier - 0.04,
    });
  }

  if (metrics.attackerWinRate > targets.attackerWinRate[1]) {
    add('defense_value_up', {
      attackerDamageMultiplier: current.attackerDamageMultiplier - 0.04,
      defenderCounterDamageMultiplier:
        current.defenderCounterDamageMultiplier + 0.04,
    });
  }

  if (metrics.lootToProductionRatio < targets.lootToProductionRatio[0]) {
    add('loot_up', {
      maxPillageSharePerAttack: current.maxPillageSharePerAttack + 0.04,
    });
  }

  if (metrics.lootToProductionRatio > targets.lootToProductionRatio[1]) {
    add('loot_down', {
      maxPillageSharePerAttack: current.maxPillageSharePerAttack - 0.05,
    });
  }

  if (metrics.fortBreachRate > targets.fortBreachRate[1]) {
    add('fort_destruction_down', {
      attackerDamageMultiplier: current.attackerDamageMultiplier - 0.03,
      defenderCounterDamageMultiplier:
        current.defenderCounterDamageMultiplier + 0.03,
    });
  }

  add('small_attacker_probe', {
    attackerDamageMultiplier: current.attackerDamageMultiplier + 0.02,
  });
  add('small_defender_probe', {
    defenderCounterDamageMultiplier:
      current.defenderCounterDamageMultiplier + 0.02,
  });

  return uniqueCandidates(candidates);
}

async function evaluateCandidate(params: {
  label: string;
  balance: BalanceParameters;
  baselinePopulation: PlayerState[];
  daysPerIteration: number;
  simulation: SimulationConfig;
  targets: BalanceObjectiveTargets;
  iteration: number;
  totalIterations: number;
  candidateIndex: number;
  candidateCount: number;
  emitProgress?: (event: ClosedLoopProgressPayload) => void;
}): Promise<{
  candidate: ClosedLoopCandidateResult;
  state: Awaited<ReturnType<typeof runPopulationSimulation>>;
}> {
  const startedAt = Date.now();
  params.emitProgress?.({
    type: 'candidate_start',
    iteration: params.iteration,
    totalIterations: params.totalIterations,
    candidateIndex: params.candidateIndex,
    candidateCount: params.candidateCount,
    label: params.label,
    balance: params.balance,
  });
  const state = await runPopulationSimulation(
    clonePopulation(params.baselinePopulation),
    params.daysPerIteration,
    {
      ...params.simulation,
      logLevel: params.simulation.logLevel ?? 'none',
      balance: params.balance,
    },
  );
  const metrics = calculateMetrics(state);
  const { score, components } = scoreMetrics(metrics, params.targets);
  const diagnoses = diagnose(metrics, params.targets);
  const elapsedMs = Date.now() - startedAt;

  const candidate: ClosedLoopCandidateResult = {
    label: params.label,
    balance: params.balance,
    metrics,
    score,
    scoreComponents: components,
    diagnoses,
  };
  params.emitProgress?.({
    type: 'candidate_complete',
    iteration: params.iteration,
    totalIterations: params.totalIterations,
    candidateIndex: params.candidateIndex,
    candidateCount: params.candidateCount,
    label: params.label,
    elapsedMs,
    score,
    metrics,
    diagnoses,
  });

  return {
    state,
    candidate,
  };
}

function rewritePopulationForPvp(
  players: PlayerState[],
  metrics: ClosedLoopMetrics,
  targets: BalanceObjectiveTargets,
): PlayerState[] {
  const attackLow =
    metrics.attacksPerActivePlayerDay < targets.attacksPerActivePlayerDay[0];
  const hoardingHigh = metrics.averageHeldTurns > targets.averageHeldTurns[1];
  const attackerWeak = metrics.attackerWinRate < targets.attackerWinRate[0];
  const attackerStrong = metrics.attackerWinRate > targets.attackerWinRate[1];

  return players.map((player) => {
    const next: PlayerState = {
      ...player,
      units: { ...player.units },
      items: { ...player.items },
      upgrades: { ...player.upgrades },
      bonuses: { ...player.bonuses },
      dailyLimits: {
        attacksUsed: 0,
        intelUsed: 0,
        assassinationUsed: 0,
        infiltrationUsed: 0,
      },
      behavior: { ...player.behavior },
      intelCache: new Map(),
      attackHistory: new Map(),
      incomingAttackHistory: new Map(),
      targetMemory: new Map(player.targetMemory),
      bankDepositHistory: [],
    };

    if (attackLow || hoardingHigh) {
      next.behavior.aggression = clamp(next.behavior.aggression + 0.06, 0, 1);
      next.behavior.riskTolerance = clamp(
        next.behavior.riskTolerance + 0.04,
        0,
        1,
      );
      if (next.behavior.turnStrategy === 'conservative') {
        next.behavior.turnStrategy = 'balanced';
      } else if (
        next.behavior.turnStrategy === 'balanced' &&
        next.behavior.aggression > 0.65
      ) {
        next.behavior.turnStrategy = 'aggressive';
      }
      if (
        next.behavior.primaryGoal === 'defense' &&
        next.behavior.aggression > 0.45
      ) {
        next.behavior.primaryGoal = 'growth';
      }
    }

    if (attackerWeak) {
      next.behavior.spyPreference = clamp(
        next.behavior.spyPreference - 0.03,
        0,
        1,
      );
      next.behavior.riskTolerance = clamp(
        next.behavior.riskTolerance + 0.03,
        0,
        1,
      );
    }

    if (attackerStrong) {
      next.behavior.riskTolerance = clamp(
        next.behavior.riskTolerance - 0.03,
        0,
        1,
      );
      next.behavior.wealthPreference = clamp(
        next.behavior.wealthPreference + 0.03,
        0,
        1,
      );
    }

    return next;
  });
}

function buildNotes(
  baseline: ClosedLoopCandidateResult,
  selected: ClosedLoopCandidateResult,
  accepted: boolean,
): string[] {
  const notes = [
    `Baseline score ${baseline.score.toFixed(3)}; selected ${selected.label} score ${selected.score.toFixed(3)}.`,
  ];
  if (accepted) {
    notes.push(
      `Accepted ${selected.label}; balance moved to selected candidate.`,
    );
  } else {
    notes.push(
      'Kept current balance; no candidate improved the objective score.',
    );
  }

  for (const diagnosis of selected.diagnoses) {
    notes.push(`${diagnosis.code}: ${diagnosis.message}`);
  }

  return notes;
}

function buildArtifact(params: {
  config: ClosedLoopBalanceConfig;
  resolvedConfig: Required<
    Omit<
      ClosedLoopBalanceConfig,
      'simulation' | 'startingBalance' | 'targets' | 'onProgress'
    >
  > & {
    simulation: SimulationConfig;
    startingBalance: BalanceParameters;
    targets: BalanceObjectiveTargets;
  };
  finalState: Awaited<ReturnType<typeof runPopulationSimulation>>;
  finalBalance: BalanceParameters;
  finalCandidate: ClosedLoopCandidateResult;
  iterations: ClosedLoopIterationReport[];
}): ClosedLoopBalanceArtifact {
  return {
    generatedAt: new Date().toISOString(),
    config: params.resolvedConfig,
    finalBalance: params.finalBalance,
    finalMetrics: params.finalCandidate.metrics,
    finalScore: params.finalCandidate.score,
    iterations: params.iterations,
    finalPopulation: snapshotTopPlayers(
      Array.from(params.finalState.players.values()),
      25,
    ),
  };
}

export async function runClosedLoopBalance(
  config: ClosedLoopBalanceConfig = {},
): Promise<ClosedLoopBalanceResult> {
  const emitProgress = createProgressEmitter(config.onProgress);
  const startedAt = Date.now();
  const resolvedConfig = {
    populationSize: config.populationSize ?? 80,
    levelRange: config.levelRange ?? [1, 18],
    daysPerIteration: config.daysPerIteration ?? 60,
    maxIterations: config.maxIterations ?? 8,
    seed: config.seed ?? 42,
    simulation: {
      ...(config.simulation ?? {}),
      seed: config.simulation?.seed ?? config.seed ?? 42,
      logLevel: config.simulation?.logLevel ?? 'none',
    },
    startingBalance: {
      ...DEFAULT_BALANCE,
      ...(config.startingBalance ?? {}),
      ...(config.simulation?.balance ?? {}),
    },
    targets: mergeTargets(config.targets),
  };
  emitProgress({
    type: 'start',
    totalIterations: resolvedConfig.maxIterations,
    populationSize: resolvedConfig.populationSize,
    daysPerIteration: resolvedConfig.daysPerIteration,
    candidateCountEstimate: 6,
  });

  let balance = resolvedConfig.startingBalance;
  let baselinePopulation = generatePopulation(
    resolvedConfig.populationSize,
    resolvedConfig.levelRange,
    resolvedConfig.seed,
  );
  const iterations: ClosedLoopIterationReport[] = [];
  let finalState = await runPopulationSimulation(
    clonePopulation(baselinePopulation),
    1,
    resolvedConfig.simulation,
  );
  let finalCandidate: ClosedLoopCandidateResult | undefined;

  for (
    let iteration = 1;
    iteration <= resolvedConfig.maxIterations;
    iteration++
  ) {
    const iterationStartedAt = Date.now();
    emitProgress({
      type: 'iteration_start',
      iteration,
      totalIterations: resolvedConfig.maxIterations,
      balance,
    });
    const candidatePopulation = baselinePopulation;
    const baseline = await evaluateCandidate({
      label: 'current',
      balance,
      baselinePopulation: candidatePopulation,
      daysPerIteration: resolvedConfig.daysPerIteration,
      simulation: resolvedConfig.simulation,
      targets: resolvedConfig.targets,
      iteration,
      totalIterations: resolvedConfig.maxIterations,
      candidateIndex: 1,
      candidateCount: 1,
      emitProgress,
    });
    const candidateSpecs = buildCandidates(
      balance,
      baseline.candidate.metrics,
      resolvedConfig.targets,
    ).filter((candidate) => candidate.label !== 'current');
    const candidateCount = candidateSpecs.length + 1;
    const evaluated = await Promise.all(
      candidateSpecs.map((candidate, index) =>
        evaluateCandidate({
          ...candidate,
          baselinePopulation: candidatePopulation,
          daysPerIteration: resolvedConfig.daysPerIteration,
          simulation: resolvedConfig.simulation,
          targets: resolvedConfig.targets,
          iteration,
          totalIterations: resolvedConfig.maxIterations,
          candidateIndex: index + 2,
          candidateCount,
          emitProgress,
        }),
      ),
    );
    const candidates = [baseline, ...evaluated].sort(
      (a, b) => a.candidate.score - b.candidate.score,
    );
    const selected = candidates[0];
    const accepted =
      selected.candidate.score < baseline.candidate.score * 0.985;

    if (accepted) {
      balance = selected.candidate.balance;
      finalState = selected.state;
      finalCandidate = selected.candidate;
    } else {
      finalState = baseline.state;
      finalCandidate = baseline.candidate;
    }

    const selectedCandidate = accepted
      ? selected.candidate
      : baseline.candidate;
    const report: ClosedLoopIterationReport = {
      iteration,
      accepted,
      baseline: baseline.candidate,
      selected: selectedCandidate,
      candidates: candidates.map((candidate) => candidate.candidate),
      notes: buildNotes(baseline.candidate, selectedCandidate, accepted),
    };
    iterations.push(report);
    emitProgress({
      type: 'iteration_complete',
      iteration,
      totalIterations: resolvedConfig.maxIterations,
      elapsedMs: Date.now() - iterationStartedAt,
      accepted,
      selectedLabel: selectedCandidate.label,
      baselineScore: baseline.candidate.score,
      selectedScore: selected.candidate.score,
      finalScore: selectedCandidate.score,
      balance,
      diagnoses: selectedCandidate.diagnoses,
    });

    baselinePopulation = rewritePopulationForPvp(
      Array.from(finalState.players.values()),
      selectedCandidate.metrics,
      resolvedConfig.targets,
    );

    if (selectedCandidate.score <= 0.05) break;
  }

  if (!finalCandidate) {
    const evaluated = await evaluateCandidate({
      label: 'current',
      balance,
      baselinePopulation,
      daysPerIteration: resolvedConfig.daysPerIteration,
      simulation: resolvedConfig.simulation,
      targets: resolvedConfig.targets,
      iteration: 1,
      totalIterations: 1,
      candidateIndex: 1,
      candidateCount: 1,
      emitProgress,
    });
    finalState = evaluated.state;
    finalCandidate = evaluated.candidate;
  }

  const artifact = buildArtifact({
    config,
    resolvedConfig,
    finalState,
    finalBalance: balance,
    finalCandidate,
    iterations,
  });
  emitProgress({
    type: 'complete',
    elapsedMs: Date.now() - startedAt,
    finalScore: finalCandidate.score,
    finalBalance: balance,
    finalMetrics: finalCandidate.metrics,
  });

  return {
    finalState,
    finalBalance: balance,
    finalMetrics: finalCandidate.metrics,
    finalScore: finalCandidate.score,
    iterations,
    artifact,
  };
}
