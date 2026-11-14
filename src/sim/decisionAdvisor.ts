import type {
  ChoiceAnswer,
  DecisionProvider,
  DecisionState,
  HeuristicScorer,
} from '@/lib/decisions';

import { calculateTotalUnitCost } from './economy';
import { areAllied } from './liveRules';
import { createRng, normalizeRngSeed, type Rng } from './random';
import type {
  AgentDecision,
  PlayerState,
  SimAdvisorContext,
  SimDecisionAdvisor,
  UnitCounts,
} from './types';

/**
 * Decision advisor for the population simulation (#448, AI-guided playtests).
 *
 * The engine owns every rule: combat, caps, costs and invariants. The advisor
 * only chooses WHICH of the actions the engine already allows a bot takes this
 * round. Every candidate is derived from the built-in behavior decision and the
 * current state, and whatever comes back is a subset of it, so a model cannot
 * invent a target or an action the game would refuse. Anything else (an illegal
 * answer, a provider error, an exhausted budget) falls back to the built-in
 * decision and is counted.
 */

export const SIM_RACES = ['ELF', 'HUMAN', 'UNDEAD', 'GOBLIN'] as const;
export type SimRace = (typeof SIM_RACES)[number];

/**
 * Illustrative strategic objectives. They are deliberately independent of race:
 * every race x objective pair is assigned so balance data separates the two.
 */
export const SIM_OBJECTIVES = [
  'aggressive',
  'economic',
  'defensive',
  'adaptive',
] as const;
export type SimObjective = (typeof SIM_OBJECTIVES)[number];

export const ADVISOR_OPTIONS = [
  'attack_best',
  'attack_weakest',
  'spy',
  'train',
  'defend',
  'bank',
  'save',
] as const;
export type AdvisorOption = (typeof ADVISOR_OPTIONS)[number];

export type AdvisorMode = 'model' | 'random-legal' | 'legacy';

const OBJECTIVE_BRIEF: Record<SimObjective, string> = {
  aggressive: 'Dominate through frequent attacks on profitable targets.',
  economic: 'Grow wealth and the army safely; fight only when it clearly pays.',
  defensive: 'Hold the kingdom: build defense first and avoid needless risk.',
  adaptive: 'Attack when a target is clearly weaker, otherwise build up.',
};

const OPTION_DESCRIPTIONS: Record<AdvisorOption, string> = {
  attack_best:
    'Carry out the planned attacks (and scouting) on the best-rated targets.',
  attack_weakest:
    'Spend the planned attack turns on the target with the weakest defense in range.',
  spy: 'Send spies to scout targets this round; no attacks.',
  train: 'Recruit the planned units; no attacks.',
  defend: 'Recruit defensive units only; no attacks.',
  bank: 'Deposit gold into the bank; no attacks, no spending.',
  save: 'Do nothing and keep the gold.',
};

const OFFENSE_UNITS = ['soldier', 'knight', 'berserker'] as const;
const DEFENSE_UNITS = ['guard', 'archer', 'royalGuard'] as const;
const DEFENSIVE_RECRUITS = [
  'guard',
  'archer',
  'royalGuard',
  'sentry',
  'sentinel',
  'inquisitor',
] as const;
const MAX_ATTACK_TURNS = 10;
const MIN_BANK_GOLD = 200000;
const GUARD_COST = 1500;

const UNIT_WEIGHT: Record<string, number> = {
  soldier: 1,
  knight: 6.7,
  berserker: 16.7,
  guard: 1,
  archer: 6.7,
  royalGuard: 16.7,
};

const sumUnits = (
  units: Partial<UnitCounts>,
  keys: readonly (keyof UnitCounts)[],
): number =>
  Math.round(
    keys.reduce((sum, key) => sum + (units[key] ?? 0) * UNIT_WEIGHT[key], 0),
  );

/** Cost-weighted offense of a kingdom, in soldier equivalents. */
export const offenseScore = (player: PlayerState): number =>
  sumUnits(player.units, OFFENSE_UNITS);

/** Cost-weighted defense plus fort, in guard equivalents. */
export const defenseScore = (player: PlayerState): number =>
  sumUnits(player.units, DEFENSE_UNITS) + Math.round(player.fortHp / 1000);

const GOLD_BANDS: readonly [number, string][] = [
  [50_000, 'under 50k'],
  [250_000, '50k-250k'],
  [1_000_000, '250k-1M'],
  [5_000_000, '1M-5M'],
];

const goldBand = (gold: number): string =>
  GOLD_BANDS.find(([limit]) => gold < limit)?.[1] ?? 'over 5M';

/** A legal action for this round, as the decision the engine would execute. */
export interface AdvisorCandidate {
  option: AdvisorOption;
  description: string;
  decision: AgentDecision;
}

const hasAction = (decision: AgentDecision): boolean =>
  decision.attacks.length > 0 ||
  decision.intelMissions.length > 0 ||
  Object.values(decision.recruitment).some((count) => (count ?? 0) > 0) ||
  (decision.bankGold ?? 0) > 0;

function maintenance(decision: AgentDecision): Partial<AgentDecision> {
  return {
    upgradeSpy: decision.upgradeSpy,
    upgradeSentry: decision.upgradeSentry,
    upgradeEconomy: decision.upgradeEconomy,
    repairFort: decision.repairFort,
  };
}

/** Targets the engine would accept an attack on, weakest defense first. */
export function legalTargets(context: SimAdvisorContext): PlayerState[] {
  const { player, population, attackLevelRange, live } = context;
  return population
    .filter(
      (other) =>
        other.id !== player.id &&
        other.status === 'active' &&
        player.level >= other.level - attackLevelRange &&
        player.level <= other.level + attackLevelRange &&
        (!live || !areAllied(player, other)),
    )
    .sort(
      (a, b) =>
        defenseScore(a) - defenseScore(b) ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
}

/**
 * Every action open to the player this round. Empty when the built-in model
 * decided to do nothing: the advisor never makes an idle player act.
 */
export function buildCandidates(
  context: SimAdvisorContext,
): AdvisorCandidate[] {
  const { player, legacyDecision: legacy } = context;
  if (player.status !== 'active' || !hasAction(legacy)) return [];
  const candidates: AdvisorCandidate[] = [];
  const add = (option: AdvisorOption, decision: AgentDecision) =>
    candidates.push({
      option,
      description: OPTION_DESCRIPTIONS[option],
      decision,
    });

  const targets = legalTargets(context);
  const legalIds = new Set(targets.map((target) => target.id));

  const attacks = legacy.attacks.filter(
    (attack) =>
      legalIds.has(attack.target) && attack.turns <= player.attackTurns,
  );
  const intel = legacy.intelMissions.filter((mission) =>
    legalIds.has(mission.target),
  );
  if (attacks.length > 0) {
    add('attack_best', { ...legacy, attacks, intelMissions: intel });
  }

  if (attacks.length > 0 && player.attackTurns >= 3) {
    const weakest = targets[0];
    if (weakest && !attacks.some((attack) => attack.target === weakest.id)) {
      const turns = Math.min(
        MAX_ATTACK_TURNS,
        player.attackTurns,
        attacks.reduce((sum, attack) => sum + attack.turns, 0),
      );
      add('attack_weakest', {
        ...legacy,
        intelMissions: [],
        attacks: [{ target: weakest.id, turns, reason: 'advisor-weakest' }],
      });
    }
  }

  if (intel.length > 0 && player.units.spy > 0) {
    add('spy', {
      intelMissions: intel,
      attacks: [],
      recruitment: {},
      ...maintenance(legacy),
    });
  }

  const affordable = (recruitment: Partial<UnitCounts>): boolean => {
    const counts = Object.values(recruitment).reduce<number>(
      (sum, count) => sum + (count ?? 0),
      0,
    );
    return (
      counts > 0 &&
      counts <= player.units.citizen &&
      calculateTotalUnitCost(recruitment) <= player.gold
    );
  };

  if (affordable(legacy.recruitment)) {
    add('train', {
      intelMissions: [],
      attacks: [],
      recruitment: legacy.recruitment,
      ...maintenance(legacy),
    });
  }

  const defensive: Partial<UnitCounts> = {};
  for (const key of DEFENSIVE_RECRUITS) {
    if (legacy.recruitment[key]) defensive[key] = legacy.recruitment[key];
  }
  if (!affordable(defensive)) {
    for (const key of DEFENSIVE_RECRUITS) delete defensive[key];
    const guards = Math.min(
      player.units.citizen,
      Math.floor((player.gold * 0.5) / GUARD_COST),
    );
    if (guards >= 1) defensive.guard = guards;
  }
  if (affordable(defensive)) {
    add('defend', {
      intelMissions: [],
      attacks: [],
      recruitment: defensive,
      ...maintenance(legacy),
    });
  }

  if (
    player.gold > MIN_BANK_GOLD &&
    player.bankDepositHistory.length < player.maximumBankDeposits
  ) {
    add('bank', {
      intelMissions: [],
      attacks: [],
      recruitment: {},
      bankGold: legacy.bankGold ?? Math.floor(player.gold * 0.5),
    });
  }

  add('save', { intelMissions: [], attacks: [], recruitment: {} });
  return candidates;
}

/** Compact, identity-free view of the round for the decision model. */
export function buildAdvisorState(
  context: SimAdvisorContext,
  objective: SimObjective,
  maxTargets: number,
): DecisionState {
  const { player } = context;
  const targets = legalTargets(context)
    .slice(0, maxTargets)
    .map((target) => ({
      level: target.level,
      defense: defenseScore(target),
      gold: goldBand(target.gold),
    }));
  return {
    objective,
    objectiveBrief: OBJECTIVE_BRIEF[objective],
    race: player.race ?? 'HUMAN',
    level: player.level,
    gold: goldBand(player.gold),
    attackTurns: player.attackTurns,
    stamina: player.stamina,
    offense: offenseScore(player),
    defense: defenseScore(player),
    spies: player.units.spy,
    citizens: player.units.citizen,
    fort: {
      level: player.fortLevel,
      hpPercent: Math.round(
        (player.fortHp / Math.max(1, player.fortMaxHp)) * 100,
      ),
    },
    targets,
  };
}

const PREFERENCES: Record<SimObjective, readonly AdvisorOption[]> = {
  aggressive: [
    'attack_best',
    'attack_weakest',
    'spy',
    'train',
    'defend',
    'bank',
    'save',
  ],
  economic: [
    'bank',
    'train',
    'save',
    'spy',
    'defend',
    'attack_weakest',
    'attack_best',
  ],
  defensive: [
    'defend',
    'train',
    'bank',
    'save',
    'spy',
    'attack_weakest',
    'attack_best',
  ],
  adaptive: [
    'attack_weakest',
    'attack_best',
    'train',
    'spy',
    'defend',
    'bank',
    'save',
  ],
};

const asRecord = (
  value: DecisionState,
): Record<string, DecisionState> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value
    : undefined;

/**
 * Offline scorer for `HeuristicProvider`: answers the `action` choice with the
 * first option the objective prefers. Adaptive bots attack only when the
 * weakest target in view is clearly below their own offense.
 */
export const objectiveScorer: HeuristicScorer = (id, question, state) => {
  if (id !== 'action' || question.type !== 'choice') return undefined;
  const data = asRecord(state);
  const objective = SIM_OBJECTIVES.find((o) => o === data?.objective);
  if (!data || !objective) return undefined;
  const options = Object.keys(question.criteria);
  let order = PREFERENCES[objective];
  if (objective === 'adaptive') {
    const targets = Array.isArray(data.targets) ? data.targets : [];
    const weakest = asRecord(targets[0] ?? null);
    const offense = typeof data.offense === 'number' ? data.offense : 0;
    const defense =
      typeof weakest?.defense === 'number' ? weakest.defense : Infinity;
    if (!(defense < offense * 0.8)) {
      order = [
        'train',
        'defend',
        'bank',
        'spy',
        'save',
        'attack_weakest',
        'attack_best',
      ];
    }
  }
  const choice = order.find((option) => options.includes(option)) ?? options[0];
  const answer: ChoiceAnswer = { type: 'choice', choice, confidence: 0.6 };
  return answer;
};

export type FallbackReason = 'illegal' | 'error' | 'budget';

export interface PlayerAdvisorStats {
  decisions: Partial<Record<AdvisorOption | 'legacy', number>>;
  fallbacks: number;
}

export interface AdvisorStats {
  mode: AdvisorMode;
  provider: string;
  model: string;
  /** Provider requests made (the hard budget counts these). */
  calls: number;
  maxDecisions: number;
  fallbacks: Record<FallbackReason, number>;
  /** Rounds where one legal option or none left nothing to decide. */
  trivial: number;
  /** Rounds an epsilon draw picked a random legal option. */
  explored: number;
  decisions: Partial<Record<AdvisorOption | 'legacy', number>>;
  latencyMsTotal: number;
}

export interface LastAdvice {
  playerId: string;
  day: number;
  tick: number;
  option: AdvisorOption | 'legacy';
  source: 'model' | 'explore' | 'random' | 'fallback' | 'legacy';
  decision: AgentDecision;
}

export interface DecisionAdvisorOptions {
  mode: AdvisorMode;
  seed: number;
  /** Required for `model` mode. */
  provider?: DecisionProvider;
  /** Share of model-mode decisions replaced by a random legal option. */
  epsilon?: number;
  /** Hard cap on provider calls. */
  maxDecisions?: number;
  /** Objective by player id; players without one are `adaptive`. */
  objectives?: ReadonlyMap<string, SimObjective>;
  maxTargets?: number;
}

export const DEFAULT_EPSILON = 0.1;
export const DEFAULT_MAX_DECISIONS = 5000;

/** The simulation hook. Its own seeded RNG leaves the engine's draws untouched. */
export class DecisionAdvisor implements SimDecisionAdvisor {
  readonly stats: AdvisorStats;

  readonly perPlayer = new Map<string, PlayerAdvisorStats>();

  lastAdvice?: LastAdvice;

  private readonly rng: Rng;

  private readonly options: DecisionAdvisorOptions;

  private readonly epsilon: number;

  private readonly provider?: DecisionProvider;

  constructor(options: DecisionAdvisorOptions) {
    if (options.mode === 'model' && !options.provider) {
      throw new Error('model mode needs a decision provider');
    }
    this.options = options;
    this.provider = options.provider;
    this.epsilon = Math.min(1, Math.max(0, options.epsilon ?? DEFAULT_EPSILON));
    this.rng = createRng(normalizeRngSeed(options.seed + 1_540_483_477));
    this.stats = {
      mode: options.mode,
      provider:
        options.mode === 'model' && options.provider
          ? options.provider.name
          : options.mode,
      model:
        options.mode === 'model' && options.provider
          ? options.provider.model
          : 'none',
      calls: 0,
      maxDecisions: options.maxDecisions ?? DEFAULT_MAX_DECISIONS,
      fallbacks: { illegal: 0, error: 0, budget: 0 },
      trivial: 0,
      explored: 0,
      decisions: {},
      latencyMsTotal: 0,
    };
  }

  objectiveOf(playerId: string): SimObjective {
    return this.options.objectives?.get(playerId) ?? 'adaptive';
  }

  async advise(context: SimAdvisorContext): Promise<AgentDecision> {
    const { legacyDecision } = context;
    if (this.options.mode === 'legacy') {
      return this.record(context, 'legacy', 'legacy', legacyDecision, false);
    }
    const candidates = buildCandidates(context);
    if (candidates.length < 2) {
      this.stats.trivial++;
      return this.record(context, 'legacy', 'legacy', legacyDecision, false);
    }
    const pickRandom = (): AdvisorCandidate =>
      candidates[this.rng.int(0, candidates.length - 1)];

    if (this.options.mode === 'random-legal') {
      const chosen = pickRandom();
      return this.record(context, chosen.option, 'random', chosen.decision);
    }

    // The draw happens for every model round so a seed fixes the sequence.
    const explore = this.rng.next() < this.epsilon;
    if (explore) {
      this.stats.explored++;
      const chosen = pickRandom();
      return this.record(context, chosen.option, 'explore', chosen.decision);
    }
    const { provider } = this;
    if (!provider) return this.fallback(context, 'error');
    if (this.stats.calls >= this.stats.maxDecisions) {
      return this.fallback(context, 'budget');
    }
    this.stats.calls++;
    try {
      const result = await provider.decide({
        state: buildAdvisorState(
          context,
          this.objectiveOf(context.player.id),
          this.options.maxTargets ?? 5,
        ),
        questions: {
          action: {
            type: 'choice',
            instructions:
              'You rule a kingdom in a strategy game. Choose the single best action for this round given your objective. Only the listed actions are possible.',
            criteria: Object.fromEntries(
              candidates.map((c) => [c.option, c.description]),
            ),
          },
        },
      });
      this.stats.latencyMsTotal += result.latencyMs;
      const answer = result.answers.action;
      const chosen =
        answer?.type === 'choice'
          ? candidates.find((c) => c.option === answer.choice)
          : undefined;
      if (chosen) {
        return this.record(context, chosen.option, 'model', chosen.decision);
      }
      return this.fallback(context, 'illegal');
    } catch {
      return this.fallback(context, 'error');
    }
  }

  private fallback(
    context: SimAdvisorContext,
    reason: FallbackReason,
  ): AgentDecision {
    this.stats.fallbacks[reason]++;
    const stats = this.playerStats(context.player.id);
    stats.fallbacks++;
    return this.record(context, 'legacy', 'fallback', context.legacyDecision);
  }

  private playerStats(playerId: string): PlayerAdvisorStats {
    let stats = this.perPlayer.get(playerId);
    if (!stats) {
      stats = { decisions: {}, fallbacks: 0 };
      this.perPlayer.set(playerId, stats);
    }
    return stats;
  }

  private record(
    context: SimAdvisorContext,
    option: AdvisorOption | 'legacy',
    source: LastAdvice['source'],
    decision: AgentDecision,
    counted = true,
  ): AgentDecision {
    if (counted) {
      const own = this.playerStats(context.player.id);
      own.decisions[option] = (own.decisions[option] ?? 0) + 1;
      this.stats.decisions[option] = (this.stats.decisions[option] ?? 0) + 1;
    }
    this.lastAdvice = {
      playerId: context.player.id,
      day: context.day,
      tick: context.tick,
      option,
      source,
      decision,
    };
    return decision;
  }
}

/**
 * Assigns each kingdom a race and an objective so every race x objective pair
 * appears (with at least 16 kingdoms) and the pairing varies with the seed.
 */
export function assignRacesAndObjectives(
  count: number,
  seed: number,
): { race: SimRace; objective: SimObjective }[] {
  const rng = createRng(normalizeRngSeed(seed + 461_845_907));
  const cells = SIM_RACES.flatMap((race) =>
    SIM_OBJECTIVES.map((objective) => ({ race, objective })),
  );
  const order = rng.shuffle(cells);
  return Array.from({ length: count }, (_, i) => order[i % order.length]);
}
