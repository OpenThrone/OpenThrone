import {
  type DecisionProvider,
  getDecisionProvider,
  HeuristicProvider,
} from '@/lib/decisions';

import { runSimulation } from './daycycle';
import {
  type AdvisorMode,
  type AdvisorStats,
  assignRacesAndObjectives,
  DecisionAdvisor,
  DEFAULT_EPSILON,
  DEFAULT_MAX_DECISIONS,
  defenseScore,
  type LastAdvice,
  objectiveScorer,
  offenseScore,
  SIM_OBJECTIVES,
  SIM_RACES,
  type SimObjective,
  type SimRace,
} from './decisionAdvisor';
import { SimulationInvariantError } from './invariants';
import { createPlayerState } from './population';
import { createRng, normalizeRngSeed } from './random';
import type {
  AgentDecision,
  PlayerState,
  PlayStyle,
  SimAdvisorContext,
  SimDecisionAdvisor,
} from './types';

/**
 * AI-guided playtest runner (#448 step 2). Runs isolated, seeded simulations of
 * bot kingdoms whose per-round choices come from a decision provider (or from
 * a random-legal baseline), watches for rule violations, and reports balance
 * signals per race x objective. The model never touches game rules: the report
 * is data about the engine, not the model's opinion.
 */

export const MAX_KINGDOMS = 200;
export const DEFAULT_KINGDOMS = 16;
export const MAX_FINDINGS = 100;

const OBJECTIVE_STYLE: Record<SimObjective, PlayStyle> = {
  aggressive: 'aggressive',
  economic: 'economist',
  defensive: 'defensive',
  adaptive: 'balanced',
};

export interface PlaytestConfig {
  kingdoms: number;
  days: number;
  seed: number;
  mode: AdvisorMode;
  epsilon?: number;
  maxDecisions?: number;
  /** Required for `model` mode. */
  provider?: DecisionProvider;
  /** Test seam: wrap or replace the advisor the engine sees. */
  advisorWrapper?: (inner: SimDecisionAdvisor) => SimDecisionAdvisor;
}

export type FindingKind =
  | 'invariant'
  | 'crash'
  | 'negative-quantity'
  | 'fort-hp-out-of-bounds'
  | 'gold-created'
  | 'win-with-zero-offense';

export interface PlayerSnapshot {
  id: string;
  race: string;
  objective: SimObjective;
  level: number;
  gold: number;
  goldInBank: number;
  attackTurns: number;
  fortHp: number;
  fortMaxHp: number;
  units: Record<string, number>;
}

export interface Finding {
  kind: FindingKind;
  detail: string;
  /** One-based day and absolute tick, as the engine reports them. */
  day: number;
  tick: number;
  playerId: string;
  seed: number;
  /** What the advisor chose for the player, with the executed decision. */
  decision?: {
    option: string;
    source: string;
    attacks: AgentDecision['attacks'];
    intelMissions: AgentDecision['intelMissions'];
    recruitment: AgentDecision['recruitment'];
    bankGold?: number;
  };
  snapshot: PlayerSnapshot | null;
}

export interface CellOutcome {
  race: SimRace;
  objective: SimObjective;
  kingdoms: number;
  avgFinalLevel: number;
  avgFinalGold: number;
  avgStartPower: number;
  avgFinalPower: number;
  attacks: number;
  attackWins: number;
  attackWinRate: number;
  goldLost: number;
  fallbacks: number;
  decisions: Record<string, number>;
}

export interface PlaytestReport {
  generatedAt: string;
  seed: number;
  days: number;
  kingdoms: number;
  mode: AdvisorMode;
  epsilon: number;
  /** False when a violation stopped the run early. */
  completed: boolean;
  provider: { name: string; model: string };
  advisor: AdvisorStats & { meanLatencyMs: number };
  cells: CellOutcome[];
  findings: Finding[];
  findingCounts: Record<string, number>;
}

const snapshotOf = (
  player: PlayerState,
  objective: SimObjective,
): PlayerSnapshot => ({
  id: player.id,
  race: player.race ?? 'HUMAN',
  objective,
  level: player.level,
  gold: player.gold,
  goldInBank: player.goldInBank,
  attackTurns: player.attackTurns,
  fortHp: player.fortHp,
  fortMaxHp: player.fortMaxHp,
  units: { ...player.units },
});

const totalGold = (player: PlayerState): number =>
  player.gold + player.goldInBank;

const memoryTotals = (player: PlayerState) => {
  let attacks = 0;
  let wins = 0;
  for (const memory of player.targetMemory.values()) {
    attacks += memory.attacks;
    wins += memory.wins;
  }
  return { attacks, wins };
};

const rawOffenseUnits = (player: PlayerState): number =>
  player.units.soldier + player.units.knight + player.units.berserker;

/** Wraps the advisor to watch every round for rule violations. */
class PlaytestChecker implements SimDecisionAdvisor {
  readonly findings: Finding[] = [];

  readonly findingCounts: Record<string, number> = {};

  readonly goldLost = new Map<string, number>();

  lastContext?: SimAdvisorContext;

  private readonly seen = new Set<string>();

  private pre = new Map<string, number>();

  private preOffense = 0;

  private preWins = 0;

  private readonly inner: DecisionAdvisor;

  private readonly seed: number;

  constructor(inner: DecisionAdvisor, seed: number) {
    this.inner = inner;
    this.seed = seed;
  }

  get lastAdvice(): LastAdvice | undefined {
    return this.inner.lastAdvice;
  }

  async advise(context: SimAdvisorContext): Promise<AgentDecision> {
    this.lastContext = context;
    this.pre = new Map(context.population.map((p) => [p.id, totalGold(p)]));
    this.preOffense = rawOffenseUnits(context.player);
    this.preWins = memoryTotals(context.player).wins;
    return this.inner.advise(context);
  }

  afterRound(context: SimAdvisorContext, decision: AgentDecision): void {
    const { player, population } = context;
    let preSum = 0;
    let postSum = 0;
    for (const other of population) {
      const before = this.pre.get(other.id) ?? totalGold(other);
      const after = totalGold(other);
      preSum += before;
      postSum += after;
      if (other.id !== player.id && after < before) {
        this.goldLost.set(
          other.id,
          (this.goldLost.get(other.id) ?? 0) + (before - after),
        );
      }
      this.checkQuantities(context, other, decision);
    }
    if (postSum > preSum) {
      this.record(context, 'gold-created', player, decision, {
        key: 'gold-created',
        detail: `total gold rose by ${postSum - preSum} in one round (no income is paid inside a round)`,
      });
    }
    if (this.preOffense === 0 && memoryTotals(player).wins > this.preWins) {
      this.record(context, 'win-with-zero-offense', player, decision, {
        key: 'zero-offense',
        detail: 'an attack was won with no offensive units',
      });
    }
  }

  private checkQuantities(
    context: SimAdvisorContext,
    player: PlayerState,
    decision: AgentDecision,
  ): void {
    const bad = (value: number) => !Number.isFinite(value) || value < 0;
    const quantities: [string, number][] = [
      ['gold', player.gold],
      ['goldInBank', player.goldInBank],
      ['attackTurns', player.attackTurns],
      ...Object.entries(player.units),
    ];
    const negative = quantities.find(([, value]) => bad(value));
    if (negative) {
      this.record(context, 'negative-quantity', player, decision, {
        key: `negative:${player.id}`,
        detail: `${negative[0]} is ${negative[1]}`,
      });
    }
    if (
      !Number.isFinite(player.fortHp) ||
      player.fortHp < 0 ||
      player.fortHp > player.fortMaxHp
    ) {
      this.record(context, 'fort-hp-out-of-bounds', player, decision, {
        key: `fort:${player.id}`,
        detail: `fort HP ${player.fortHp} outside 0..${player.fortMaxHp}`,
      });
    }
  }

  record(
    context: SimAdvisorContext | undefined,
    kind: FindingKind,
    subject: PlayerState | undefined,
    decision: AgentDecision | undefined,
    info: { key: string; detail: string; day?: number; playerId?: string },
  ): void {
    this.findingCounts[kind] = (this.findingCounts[kind] ?? 0) + 1;
    const dedupe = `${kind}:${info.key}:${info.playerId ?? subject?.id ?? ''}`;
    if (this.seen.has(dedupe) || this.findings.length >= MAX_FINDINGS) return;
    this.seen.add(dedupe);
    const advice = this.inner.lastAdvice;
    const playerId = info.playerId ?? subject?.id ?? context?.player.id ?? '';
    const actor =
      subject ?? context?.population.find((p) => p.id === playerId) ?? null;
    this.findings.push({
      kind,
      detail: info.detail,
      day: info.day ?? (context ? context.day + 1 : 0),
      tick: context?.tick ?? advice?.tick ?? 0,
      playerId,
      seed: this.seed,
      decision: advice
        ? {
            option: advice.option,
            source: advice.source,
            attacks: (decision ?? advice.decision).attacks,
            intelMissions: (decision ?? advice.decision).intelMissions,
            recruitment: (decision ?? advice.decision).recruitment,
            bankGold: (decision ?? advice.decision).bankGold,
          }
        : undefined,
      snapshot: actor
        ? snapshotOf(actor, this.inner.objectiveOf(actor.id))
        : null,
    });
  }
}

/** Builds the isolated, seeded bot population. */
export function buildPlaytestPopulation(
  kingdoms: number,
  seed: number,
): {
  players: PlayerState[];
  objectives: Map<string, SimObjective>;
} {
  const rng = createRng(normalizeRngSeed(seed + 625_341_585));
  const cells = assignRacesAndObjectives(kingdoms, seed);
  const objectives = new Map<string, SimObjective>();
  const players = cells.map(({ race, objective }, i) => {
    const level = rng.int(6, 12);
    const player = createPlayerState(
      level,
      OBJECTIVE_STYLE[objective],
      normalizeRngSeed(seed) + i,
      `kingdom_${i}`,
    );
    player.displayName = `Kingdom ${i}`;
    player.race = race;
    objectives.set(player.id, objective);
    return player;
  });
  return { players, objectives };
}

const mean = (values: number[]): number =>
  values.length === 0
    ? 0
    : Math.round(values.reduce((a, b) => a + b, 0) / values.length);

/** Runs one playtest and returns the report. Never throws on a violation. */
export async function runDecisionPlaytest(
  config: PlaytestConfig,
): Promise<PlaytestReport> {
  const kingdoms = Math.floor(config.kingdoms);
  if (!(kingdoms >= 2 && kingdoms <= MAX_KINGDOMS)) {
    throw new RangeError(`kingdoms must be 2-${MAX_KINGDOMS}`);
  }
  const days = Math.floor(config.days);
  if (!(days >= 1)) throw new RangeError('days must be at least 1');

  const { players, objectives } = buildPlaytestPopulation(
    kingdoms,
    config.seed,
  );
  const startPower = new Map(
    players.map((p) => [p.id, offenseScore(p) + defenseScore(p)]),
  );
  const epsilon = config.epsilon ?? DEFAULT_EPSILON;
  const advisor = new DecisionAdvisor({
    mode: config.mode,
    seed: config.seed,
    provider: config.provider,
    epsilon,
    maxDecisions: config.maxDecisions,
    objectives,
  });
  const checker = new PlaytestChecker(advisor, config.seed);
  const engineAdvisor = config.advisorWrapper
    ? config.advisorWrapper(checker)
    : checker;

  let finalPlayers: PlayerState[] = players;
  let completed = true;
  try {
    const state = await runSimulation(players, days, {
      seed: config.seed,
      logLevel: 'none',
      decisionAdvisor: engineAdvisor,
    });
    finalPlayers = Array.from(state.players.values());
  } catch (error) {
    completed = false;
    const context = checker.lastContext;
    if (context) finalPlayers = context.population;
    const invariant = error instanceof SimulationInvariantError;
    const playerId =
      invariant && error.playerId
        ? error.playerId
        : (checker.lastAdvice?.playerId ?? '');
    const subject = finalPlayers.find((p) => p.id === playerId);
    checker.record(
      context,
      invariant ? 'invariant' : 'crash',
      subject,
      undefined,
      {
        key: 'thrown',
        playerId,
        day: invariant ? error.day : undefined,
        detail: error instanceof Error ? error.message : String(error),
      },
    );
  }

  const cells: CellOutcome[] = [];
  for (const race of SIM_RACES) {
    for (const objective of SIM_OBJECTIVES) {
      const members = finalPlayers.filter(
        (p) => p.race === race && objectives.get(p.id) === objective,
      );
      if (members.length === 0) continue;
      const decisions: Record<string, number> = {};
      let fallbacks = 0;
      let attacks = 0;
      let wins = 0;
      let goldLost = 0;
      for (const member of members) {
        const own = advisor.perPlayer.get(member.id);
        fallbacks += own?.fallbacks ?? 0;
        for (const [option, count] of Object.entries(own?.decisions ?? {})) {
          decisions[option] = (decisions[option] ?? 0) + (count ?? 0);
        }
        const totals = memoryTotals(member);
        attacks += totals.attacks;
        wins += totals.wins;
        goldLost += checker.goldLost.get(member.id) ?? 0;
      }
      cells.push({
        race,
        objective,
        kingdoms: members.length,
        avgFinalLevel: mean(members.map((p) => p.level)),
        avgFinalGold: mean(members.map(totalGold)),
        avgStartPower: mean(members.map((p) => startPower.get(p.id) ?? 0)),
        avgFinalPower: mean(
          members.map((p) => offenseScore(p) + defenseScore(p)),
        ),
        attacks,
        attackWins: wins,
        attackWinRate:
          attacks > 0 ? Math.round((wins / attacks) * 1000) / 1000 : 0,
        goldLost,
        fallbacks,
        decisions,
      });
    }
  }

  const { calls } = advisor.stats;
  return {
    generatedAt: new Date().toISOString(),
    seed: config.seed,
    days,
    kingdoms,
    mode: config.mode,
    epsilon,
    completed,
    provider: { name: advisor.stats.provider, model: advisor.stats.model },
    advisor: {
      ...advisor.stats,
      meanLatencyMs:
        calls > 0 ? Math.round(advisor.stats.latencyMsTotal / calls) : 0,
    },
    cells,
    findings: checker.findings,
    findingCounts: checker.findingCounts,
  };
}

const PRIVATE_HOST =
  /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$|.*\.local$|.*\.lan$)/i;

/** True when the base URL points outside this machine and private networks. */
export function isHostedBaseUrl(baseUrl: string | undefined): boolean {
  if (!baseUrl) return false;
  try {
    return !PRIVATE_HOST.test(new URL(baseUrl).hostname);
  } catch {
    return false;
  }
}

export interface ParsedPlaytestArgs {
  config: PlaytestConfig;
  outDir: string | null;
  providerNote: string;
}

type EnvLike = Record<string, string | undefined>;

const FLAGS = [
  'kingdoms',
  'days',
  'seed',
  'mode',
  'epsilon',
  'max-decisions',
  'out',
] as const;

/**
 * Parses CLI arguments. Refuses `--mode model` on a hosted provider unless
 * `--max-decisions` was given, since every call there costs money.
 */
export function parsePlaytestArgs(
  argv: string[],
  env: EnvLike = process.env,
  fetchFn?: typeof fetch,
): ParsedPlaytestArgs {
  const values: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) throw new Error(`Unexpected argument "${arg}"`);
    const [rawName, inline] = arg.slice(2).split('=', 2);
    if (!(FLAGS as readonly string[]).includes(rawName)) {
      throw new Error(`Unknown flag --${rawName}`);
    }
    const value = inline ?? argv[++i];
    if (value === undefined) throw new Error(`--${rawName} needs a value`);
    values[rawName] = value;
  }
  const num = (name: string, fallback: number): number => {
    if (values[name] === undefined) return fallback;
    const parsed = Number(values[name]);
    if (!Number.isFinite(parsed)) throw new Error(`--${name} must be a number`);
    return parsed;
  };
  const mode = (values.mode ?? 'model') as AdvisorMode;
  if (!['model', 'random-legal', 'legacy'].includes(mode)) {
    throw new Error('--mode must be model, random-legal or legacy');
  }
  const kingdoms = Math.floor(num('kingdoms', DEFAULT_KINGDOMS));
  if (kingdoms < 2 || kingdoms > MAX_KINGDOMS) {
    throw new Error(`--kingdoms must be 2-${MAX_KINGDOMS}`);
  }
  const days = Math.floor(num('days', 7));
  if (days < 1) throw new Error('--days must be at least 1');
  const epsilon = num('epsilon', DEFAULT_EPSILON);
  if (epsilon < 0 || epsilon > 1) throw new Error('--epsilon must be 0-1');
  const explicitMax = values['max-decisions'] !== undefined;
  const maxDecisions = Math.floor(num('max-decisions', DEFAULT_MAX_DECISIONS));
  if (maxDecisions < 0) throw new Error('--max-decisions must be 0 or more');

  let provider: DecisionProvider | undefined;
  let providerNote = `mode ${mode}: no provider calls`;
  if (mode === 'model') {
    const hosted =
      (env.DECISION_PROVIDER ?? '').trim().toLowerCase() === 'systemone' &&
      isHostedBaseUrl(env.DECISION_API_BASE_URL);
    if (hosted && !explicitMax) {
      throw new Error(
        'Refusing to run --mode model on a hosted provider without --max-decisions: every decision is a paid request.',
      );
    }
    provider = getDecisionProvider(env, fetchFn);
    // The heuristic baseline needs the objective scorer to play sensibly.
    if (provider.name === 'heuristic') {
      provider = new HeuristicProvider(objectiveScorer);
    }
    providerNote = `provider ${provider.name}, model ${provider.model}${hosted ? ' (hosted)' : ''}, budget ${maxDecisions} calls`;
  }
  return {
    config: {
      kingdoms,
      days,
      seed: Math.floor(num('seed', 1)),
      mode,
      epsilon,
      maxDecisions,
      provider,
    },
    outDir: values.out ?? null,
    providerNote,
  };
}

const pad = (value: string | number, width: number): string =>
  String(value).padEnd(width);

/** A short console summary of a report. */
export function formatPlaytestSummary(report: PlaytestReport): string {
  const lines: string[] = [];
  const a = report.advisor;
  lines.push(
    `Playtest: ${report.kingdoms} kingdoms, ${report.days} days, seed ${report.seed}, mode ${report.mode}${report.completed ? '' : ' (STOPPED EARLY by a violation)'}`,
    `Provider: ${report.provider.name} / ${report.provider.model}; calls ${a.calls}/${a.maxDecisions}, fallbacks illegal ${a.fallbacks.illegal} error ${a.fallbacks.error} budget ${a.fallbacks.budget}, explored ${a.explored}, trivial ${a.trivial}, mean latency ${a.meanLatencyMs} ms`,
    '',
    `${pad('race', 8)}${pad('objective', 11)}${pad('n', 3)}${pad('level', 7)}${pad('gold', 12)}${pad('power', 16)}${pad('atk', 6)}${pad('win%', 7)}${pad('gold lost', 12)}${pad('fb', 4)}decisions`,
  );
  for (const cell of report.cells) {
    const decisions = Object.entries(cell.decisions)
      .sort((x, y) => y[1] - x[1])
      .map(([option, count]) => `${option}:${count}`)
      .join(' ');
    lines.push(
      `${pad(cell.race, 8)}${pad(cell.objective, 11)}${pad(cell.kingdoms, 3)}${pad(cell.avgFinalLevel, 7)}${pad(cell.avgFinalGold, 12)}${pad(`${cell.avgStartPower}>${cell.avgFinalPower}`, 16)}${pad(cell.attacks, 6)}${pad((cell.attackWinRate * 100).toFixed(0), 7)}${pad(cell.goldLost, 12)}${pad(cell.fallbacks, 4)}${decisions}`,
    );
  }
  lines.push('');
  const kinds = Object.entries(report.findingCounts);
  lines.push(
    kinds.length === 0
      ? 'Findings: none'
      : `Findings: ${kinds.map(([k, n]) => `${k} x${n}`).join(', ')}`,
  );
  for (const finding of report.findings.slice(0, 10)) {
    lines.push(
      `  [${finding.kind}] day ${finding.day} tick ${finding.tick} ${finding.playerId} (seed ${finding.seed}): ${finding.detail}`,
    );
  }
  return lines.join('\n');
}
