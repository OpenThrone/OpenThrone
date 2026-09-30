/**
 * Persona policy contracts (plan Todo 5).
 *
 * Stable persona identity drives deterministic policy decisions for the
 * ERA simulation. Identity (the six `Persona` values plus Farmer variants)
 * is IMMUTABLE; only tactical adaptation (notably the adaptive Farmer's
 * alert level) evolves across ticks.
 *
 * The observation types below are deliberately IMPERFECT-INFORMATION: they
 * carry only what a player can actually know about opponents (public bands,
 * own memory, own fresh spy intel). They structurally CANNOT carry hidden
 * opponent state such as exact gold, exact unit counts, or exact fort HP,
 * which is what makes the "no hidden-data effect" guarantee enforceable.
 *
 * This module is consumed by `policy.ts` / `farmerPolicy.ts`. Todo 9 wires
 * these policies into the daycycle by dispatching to `decidePersonaPolicy`
 * instead of `makeDailyDecisions` for persona-driven players. The policy
 * functions are pure: identical observation + tactical state + RNG state
 * always yield an identical decision.
 */

import type { ActivityClass, FarmerVariant, Persona } from '../scenarioTypes';
import type { UnitCounts } from '../types';

// ---------------------------------------------------------------------------
// Public bands (rough, observable) - never exact opponent figures.
// ---------------------------------------------------------------------------

/**
 * Rough power comparison band between the observer and a target. Replaces the
 * raw power ratio so policies cannot key off exact opponent strength.
 */
export type PowerBand =
  | 'unknown'
  | 'much-weaker'
  | 'weaker'
  | 'even'
  | 'stronger'
  | 'much-stronger';

/**
 * Rough fort condition band. A defender's exact HP is hidden unless a fresh
 * spy report exposes it (via {@link PersonaFreshIntelSnapshot}).
 */
export type FortStatusBand = 'unknown' | 'secure' | 'damaged' | 'breached';

/**
 * Rough gold band, the only wealth signal an observer can derive about an
 * opponent (from rank/level heuristics or a fresh spy report).
 */
export type GoldBand =
  | 'unknown'
  | 'poor'
  | 'modest'
  | 'rich'
  | 'wealthy'
  | 'opulent';

/**
 * Detailed snapshot available ONLY when the observer holds a fresh, successful
 * spy report for the target. Even here the values stay banded (a fraction for
 * fort integrity, bands for defense/gold) rather than exact integers, so the
 * policy never sees raw hidden quantities.
 */
export interface PersonaFreshIntelSnapshot {
  /** Fort integrity fraction in [0, 1] from a fresh spy report. */
  readonly fortIntegrityFraction: number;
  /** Defense band observed via intel. */
  readonly observedDefenseBand: PowerBand;
  /** Gold band observed via intel. */
  readonly observedGoldBand: GoldBand;
}

/**
 * Public/own-memory intel about ONE opponent. Carries no exact hidden state.
 *
 * `observedLoot` and the relation flags come from the observer's own memory
 * (attacks it performed or suffered), not from the opponent's private state.
 */
export interface PersonaPublicTargetIntel {
  readonly targetId: string;
  readonly level: number;
  readonly withinAttackRange: boolean;
  readonly powerBand: PowerBand;
  readonly fortStatusBand: FortStatusBand;
  readonly goldBand: GoldBand;
  /** Loot the observer last took from this target (0 if never farmed). */
  readonly observedLoot: number;
  readonly intelFreshness: 'fresh' | 'decaying' | 'expired' | 'none';
  /** True if the observer attacked this target recently (own memory). */
  readonly recentlyAttackedByMe: boolean;
  /** True if this target attacked the observer recently (own memory). */
  readonly attackedMeRecently: boolean;
  /** Present only when a fresh successful spy report is held. */
  readonly freshIntel?: PersonaFreshIntelSnapshot;
}

// ---------------------------------------------------------------------------
// Self observation - full own state plus public threat signals.
// ---------------------------------------------------------------------------

/**
 * What a player knows about itself plus the public threat environment.
 *
 * Own quantities (gold, units, fort HP, upgrade levels, economic rates) are
 * fully visible to self. Threat/window signals (attacks suffered, worker
 * losses, loot/income history) are provided by the scenario runner's parallel
 * history tracker, NOT stored on the base `PlayerState`, preserving the
 * composition-over-bloating rule from plan Todo 5.
 */
export interface PersonaSelfObservation {
  readonly playerId: string;
  readonly persona: Persona;
  readonly farmerVariant?: FarmerVariant;
  readonly activityClass: ActivityClass;

  // Temporal context.
  readonly day: number;
  readonly tick: number;
  readonly ticksPerDay: number;
  /** Ticks remaining in the current simulated day. */
  readonly remainingTicksToday: number;
  /**
   * Caller-supplied estimate of remaining productive ticks (e.g. ticks/day *
   * days left in the era horizon). Used to judge whether worker investment
   * recoups its cost before the run ends.
   */
  readonly expectedRemainingTicks: number;

  // Own economy (self-visible).
  readonly gold: number;
  readonly goldInBank: number;
  /** Hand-gold fraction of total wealth in [0, 1] (0 = fully banked). */
  readonly bankExposure: number;
  readonly attackTurns: number;
  readonly stamina: number;
  readonly level: number;
  readonly citizensAvailable: number;
  readonly units: UnitCounts;
  /** Items / battle-upgrade coverage fraction in [0, 1] (self-visible). */
  readonly coverageFraction: number;

  // Own structures (self-visible).
  readonly fortLevel: number;
  readonly fortHp: number;
  readonly fortMaxHp: number;
  readonly spyLevel: number;
  readonly sentryLevel: number;
  readonly economyLevel: number;
  /** Gold cost to fully repair the fort to max HP. */
  readonly repairCost: number;
  /** Gold a single worker produces per turn at the current economy level. */
  readonly goldPerWorkerPerTurn: number;

  // Threat / history window signals (provided by the scenario runner).
  readonly incomeLastDay: number;
  readonly income7d: number;
  readonly lootGainedLastDay: number;
  readonly loot7d: number;
  readonly workersLostLastDay: number;
  readonly workersAssassinatedLastDay: number;
  readonly workersAssassinated7d: number;
  readonly attacksSufferedLastDay: number;
  readonly attacksSuffered7d: number;
  readonly fortBreachedLast7d: boolean;
  /** Days since the last threat event, or `null` if never threatened. */
  readonly fortBreachDaysAgo: number | null;
  readonly incomingAttackersLast7d: number;
  /** Consecutive quiet days (no attack/assassination/breach). */
  readonly daysSinceLastThreat: number;
  /** Public alliance-driven threat pressure in [0, 1]. */
  readonly allianceThreatLevel: number;
}

/**
 * Full policy input: self observation plus the public/own-memory intel about
 * every other observable player. No hidden opponent state is reachable
 * through this type.
 */
export interface PersonaObservation {
  readonly self: PersonaSelfObservation;
  readonly targets: readonly PersonaPublicTargetIntel[];
}

// ---------------------------------------------------------------------------
// Decision output.
// ---------------------------------------------------------------------------

/**
 * Explainable stance label. Identity-stable; the stance describes the
 * tactical posture chosen this tick (e.g. adaptive Farmer moving from
 * relaxed to raised), not a change of persona.
 */
export type PersonaStance =
  | 'farmer-greedy-harvest'
  | 'farmer-greedy-reactive'
  | 'farmer-cautious-turtle'
  | 'farmer-adaptive-relaxed'
  | 'farmer-adaptive-raised'
  | 'farmer-adaptive-fortified'
  | 'attacker-raiding'
  | 'attacker-hoarding'
  | 'defender-fortified'
  | 'defender-rebuild'
  | 'spy-recon'
  | 'sentry-lockdown'
  | 'balanced-mixed'
  | 'balanced-economy'
  | 'inactive';

/**
 * Pure policy output. Carries recruitment intent (`Partial<UnitCounts>`,
 * matching `AgentDecision.recruitment`), upgrade/repair/bank intents, attack
 * turn budget, intel mission count, a preferred target band hint, and an
 * explainable rationale. Target SELECTION is intentionally left to Todo 9
 * (which owns `targeting.ts`), so this decision never names specific targets.
 */
export interface PersonaDecision {
  readonly stance: PersonaStance;
  readonly recruitment: Partial<UnitCounts>;
  readonly upgradeEconomy: boolean;
  readonly upgradeDefense: boolean;
  readonly upgradeSpy: boolean;
  readonly upgradeSentry: boolean;
  readonly repairFort: boolean;
  readonly bankGold: number;
  readonly attackTurnsToSpend: number;
  readonly preferredTargetBand: PowerBand | 'any';
  readonly intelMissionsToPlan: number;
  readonly rationale: readonly string[];
}

// ---------------------------------------------------------------------------
// Tactical state (mutable across ticks; identity stays fixed).
// ---------------------------------------------------------------------------

/**
 * Per-player tactical memory owned by the policy layer. Stored in a parallel
 * `Map<string, PersonaTacticalState>` by the scenario runner (Todo 9), never
 * on the base `PlayerState`, so base types stay unbloated.
 *
 * `alertLevel` is the adaptive Farmer's evolving posture (0 = relaxed/greedy,
 * higher = more cautious). Other personas keep it at 0.
 */
export interface PersonaTacticalState {
  readonly persona: Persona;
  readonly farmerVariant?: FarmerVariant;
  readonly alertLevel: number;
}

/**
 * Result of a policy step: the decision for this tick plus the tactical state
 * to carry forward. Both are new values; the policy never mutates inputs.
 */
export interface PersonaPolicyResult {
  readonly decision: PersonaDecision;
  readonly nextTactical: PersonaTacticalState;
}

// ---------------------------------------------------------------------------
// Allocation band (identity-stable baseline per persona).
// ---------------------------------------------------------------------------

/**
 * Stable resource-allocation baseline for one persona. The five recruitment
 * shares are normalized to sum to 1 inside `bands.ts`; the four behavioral
 * dials are independent probabilities in [0, 1]. These values are the
 * persona's IDENTITY and do not change across ticks.
 */
export interface PersonaAllocationBand {
  readonly persona: Persona;
  /** Recruitment weight for workers (economy). */
  readonly workerShare: number;
  /** Recruitment weight for defense units (guard/archer/royalGuard). */
  readonly defenseShare: number;
  /** Recruitment weight for offense units (soldier/knight/berserker). */
  readonly offenseShare: number;
  /** Recruitment weight for spy units. */
  readonly spyShare: number;
  /** Recruitment weight for sentry units. */
  readonly sentryShare: number;
  /** Priority to repair the fort before spending elsewhere, in [0, 1]. */
  readonly fortRepairPriority: number;
  /** Priority to bank hand gold, in [0, 1]. */
  readonly bankingPriority: number;
  /** Aggression dial governing attack-turn spend, in [0, 1]. */
  readonly attackAggression: number;
  /** Aggression dial governing intel mission count, in [0, 1]. */
  readonly intelAggression: number;
}
