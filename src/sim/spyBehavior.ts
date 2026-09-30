/**
 * Deterministic assassination / infiltration decision, selection, and
 * execution contract for the ERA-730 simulation (plan Todo 8).
 *
 * Scope: this module is intentionally standalone. Wave 2 forbids edits
 * to `behaviors.ts`, `targeting.ts`, `daycycle.ts`, and the root
 * `src/sim/index.ts`. Todo 9 integrates this module into the daily phase
 * loop via the adapter helpers exported here (`playerStateToSpyLimits`,
 * `dailyLimitsToTracker`, `writeTrackerBack`, `planSpyApplication`).
 *
 * Production parity sources mirrored by this module:
 *   - `src/services/SpyService.ts` — eligibility, daily-limit, and
 *     per-target-limit semantics. The production field name
 *     `maxInfiltratorsPerUser` is reused by the service as the
 *     per-defender-per-day mission cap; we keep the same naming so the
 *     mapping is auditable.
 *   - `src/constants/Structure_Upgrades.tsx` — `SpyUpgrades` produces
 *     `maxInfiltrations`/`maxInfiltratorsPerMission`/
 *     `maxInfiltratorsPerUser`/`maxAssassinations`/
 *     `maxAssassinsPerMission`/`maxAssassinationsPerUser`.
 *   - `src/utils/balance/v5Combat.ts` — `calculateSpyPressureProtection`
 *     and mission-turn bounds.
 *   - `src/sim/engine.ts` — typed `simulateSpyIntel` /
 *     `simulateSpyAssassination` / `simulateSpyInfiltration` wrappers,
 *     which we delegate to so production spy formulas are reused (not
 *     re-implemented).
 *
 * Invariants enforced by design:
 *   1. RNG is always injected. No `Math.random` / `Date.now` is read.
 *   2. Mission results are NEVER awarded battle XP. The execution result
 *      exposes `attackerXpAwarded` / `defenderXpAwarded` for auditing,
 *      but they are always `0` unless a future production source
 *      explicitly grants XP from a spy mission.
 *   3. Intel visibility is restricted to the attacker and (optionally)
 *      an explicit alliance member set. `canSeeIntel` is the single
 *      adjudicator and is used by tests as well as by Todo 9 callers.
 *   4. Defender spy-pressure accumulation is reported as a delta, not
 *      applied directly to `PlayerState`; the caller is responsible for
 *      the mutation so the module remains pure with respect to inputs.
 */

import { V5_COMBAT_CONSTANTS } from '../utils/balance/v5Combat';
import { CITIZEN_WORKERS_TARGET } from '../utils/spy/results';
import {
  simulateSpyAssassination,
  simulateSpyInfiltration,
  simulateSpyIntel,
} from './engine';
import { SimulationConfigError } from './invariants';
import type { Rng } from './random';
import { createRng } from './random';
import type { Persona } from './scenarioTypes';
import type {
  IntelPayload,
  IntelResult,
  PlayerState,
  SpyResult,
  UnitCounts,
} from './types';

// ---------------------------------------------------------------------------
// Mission kinds and target units
// ---------------------------------------------------------------------------

export type SpyMissionKind = 'intel' | 'assassination' | 'infiltration';

export const SPY_MISSION_KINDS: readonly SpyMissionKind[] = [
  'intel',
  'assassination',
  'infiltration',
] as const;

export type SpyMissionTargetUnit =
  | typeof CITIZEN_WORKERS_TARGET
  | 'CITIZEN'
  | 'WORKER'
  | 'OFFENSE'
  | 'DEFENSE'
  | 'SPY'
  | 'SENTRY';

export const SPY_MISSION_TARGET_UNITS: readonly SpyMissionTargetUnit[] = [
  CITIZEN_WORKERS_TARGET,
  'CITIZEN',
  'WORKER',
  'OFFENSE',
  'DEFENSE',
  'SPY',
  'SENTRY',
] as const;

// ---------------------------------------------------------------------------
// Limit manifests (mirror production SpyUpgrades; see header)
// ---------------------------------------------------------------------------

export interface SpyMissionLimits {
  readonly perMission: number;
  readonly perTargetPerDay: number;
  readonly perDay: number;
}

export interface SpyLimitManifest {
  readonly intel: SpyMissionLimits;
  readonly assassination: SpyMissionLimits;
  readonly infiltration: SpyMissionLimits;
}

const UNLOCKED_INTEL_LIMITS: SpyMissionLimits = Object.freeze({
  perMission: V5_COMBAT_CONSTANTS.MAX_SPY_MISSION_TURNS,
  perTargetPerDay: 10,
  perDay: 10,
});

/**
 * Per-spy-level limit table. Production `SpyUpgrades` only unlocks
 * infiltration at level 7 and assassination at level 11+; below those
 * thresholds the per-day caps are zero, which the eligibility check
 * treats as `*_LOCKED`.
 *
 * Values are duplicated here as immutable data rather than imported from
 * `services/` so the simulation core stays decoupled from the
 * persistence layer, mirroring the pattern used by `eraPopulation.ts`.
 */
export const SPY_LEVEL_LIMITS: readonly SpyLimitManifest[] = Object.freeze([
  // Level 1 (Sling Training)
  Object.freeze({
    intel: UNLOCKED_INTEL_LIMITS,
    assassination: { perMission: 0, perTargetPerDay: 0, perDay: 0 },
    infiltration: { perMission: 0, perTargetPerDay: 0, perDay: 0 },
  }),
  // Level 2 (Rope Training)
  Object.freeze({
    intel: UNLOCKED_INTEL_LIMITS,
    assassination: { perMission: 0, perTargetPerDay: 0, perDay: 0 },
    infiltration: { perMission: 0, perTargetPerDay: 0, perDay: 0 },
  }),
  // Level 3 (Basic Stealth Training)
  Object.freeze({
    intel: UNLOCKED_INTEL_LIMITS,
    assassination: { perMission: 0, perTargetPerDay: 0, perDay: 0 },
    infiltration: { perMission: 0, perTargetPerDay: 0, perDay: 0 },
  }),
  // Level 4 (Basic Disguise Kit Usage)
  Object.freeze({
    intel: UNLOCKED_INTEL_LIMITS,
    assassination: { perMission: 0, perTargetPerDay: 0, perDay: 0 },
    infiltration: { perMission: 0, perTargetPerDay: 0, perDay: 0 },
  }),
  // Level 5 (Brass Knuckles Training)
  Object.freeze({
    intel: UNLOCKED_INTEL_LIMITS,
    assassination: { perMission: 0, perTargetPerDay: 0, perDay: 0 },
    infiltration: { perMission: 0, perTargetPerDay: 0, perDay: 0 },
  }),
  // Level 6 (Informants)
  Object.freeze({
    intel: UNLOCKED_INTEL_LIMITS,
    assassination: { perMission: 0, perTargetPerDay: 0, perDay: 0 },
    infiltration: { perMission: 0, perTargetPerDay: 0, perDay: 0 },
  }),
  // Level 7 (Infiltration Training) — infiltration unlocked
  Object.freeze({
    intel: UNLOCKED_INTEL_LIMITS,
    assassination: { perMission: 0, perTargetPerDay: 0, perDay: 0 },
    infiltration: { perMission: 3, perTargetPerDay: 1, perDay: 1 },
  }),
  // Level 8 (Grappling Hook Training)
  Object.freeze({
    intel: UNLOCKED_INTEL_LIMITS,
    assassination: { perMission: 0, perTargetPerDay: 0, perDay: 0 },
    infiltration: { perMission: 3, perTargetPerDay: 1, perDay: 2 },
  }),
  // Level 9 (Cudgel Training)
  Object.freeze({
    intel: UNLOCKED_INTEL_LIMITS,
    assassination: { perMission: 0, perTargetPerDay: 0, perDay: 0 },
    infiltration: { perMission: 3, perTargetPerDay: 2, perDay: 3 },
  }),
  // Level 10 (Informant Detection)
  Object.freeze({
    intel: UNLOCKED_INTEL_LIMITS,
    assassination: { perMission: 0, perTargetPerDay: 0, perDay: 0 },
    infiltration: { perMission: 4, perTargetPerDay: 2, perDay: 4 },
  }),
  // Level 11+ mirrors the engine.ts adapter's default sentry/assassin
  // mission profile: infiltration stays open and assassination unlocks.
  Object.freeze({
    intel: UNLOCKED_INTEL_LIMITS,
    assassination: { perMission: 70, perTargetPerDay: 4, perDay: 4 },
    infiltration: { perMission: 7, perTargetPerDay: 5, perDay: 5 },
  }),
]);

export const DEFAULT_SPY_LEVEL_LIMITS: SpyLimitManifest = SPY_LEVEL_LIMITS[0];

export function getSpyLimitsForLevel(spyLevel: number): SpyLimitManifest {
  if (!Number.isFinite(spyLevel) || spyLevel < 1) {
    throw new SimulationConfigError(
      `getSpyLimitsForLevel requires spyLevel >= 1; received ${spyLevel}`,
      'spy-level-invalid',
    );
  }
  const index = Math.min(
    SPY_LEVEL_LIMITS.length - 1,
    Math.max(0, Math.floor(spyLevel) - 1),
  );
  return SPY_LEVEL_LIMITS[index] ?? DEFAULT_SPY_LEVEL_LIMITS;
}

/**
 * Reads the production-equivalent limit manifest for `attacker` based on
 * its `spyLevel` structure-upgrade field. Pure adapter: returns a new
 * manifest object every call, never mutates input.
 */
export function playerStateToSpyLimits(
  attacker: PlayerState,
): SpyLimitManifest {
  return getSpyLimitsForLevel(attacker.spyLevel);
}

// ---------------------------------------------------------------------------
// Per-day tracker
// ---------------------------------------------------------------------------

export interface SpyDayTracker {
  readonly perTargetCounts: ReadonlyMap<string, number>;
  readonly perKindCounts: Readonly<Record<SpyMissionKind, number>>;
}

export function createSpyDayTracker(): SpyDayTracker {
  return {
    perTargetCounts: new Map<string, number>(),
    perKindCounts: { intel: 0, assassination: 0, infiltration: 0 },
  };
}

function trackerKey(targetId: string, kind: SpyMissionKind): string {
  return `${targetId}:${kind}`;
}

export function trackerPerTargetCount(
  tracker: SpyDayTracker,
  targetId: string,
  kind: SpyMissionKind,
): number {
  return tracker.perTargetCounts.get(trackerKey(targetId, kind)) ?? 0;
}

export function trackerPerKindCount(
  tracker: SpyDayTracker,
  kind: SpyMissionKind,
): number {
  return tracker.perKindCounts[kind];
}

export function recordTrackerMission(
  tracker: SpyDayTracker,
  targetId: string,
  kind: SpyMissionKind,
): SpyDayTracker {
  const perTargetCounts = new Map(tracker.perTargetCounts);
  perTargetCounts.set(
    trackerKey(targetId, kind),
    (perTargetCounts.get(trackerKey(targetId, kind)) ?? 0) + 1,
  );
  return {
    perTargetCounts,
    perKindCounts: {
      ...tracker.perKindCounts,
      [kind]: tracker.perKindCounts[kind] + 1,
    },
  };
}

/**
 * Read the legacy `PlayerState.dailyLimits` counters into a tracker.
 * Legacy dailyLimits track per-kind totals only; per-target counts start
 * at zero and are accumulated by the simulation as missions execute.
 */
export function dailyLimitsToTracker(player: PlayerState): SpyDayTracker {
  return {
    perTargetCounts: new Map<string, number>(),
    perKindCounts: {
      intel: Math.max(0, Math.floor(player.dailyLimits.intelUsed ?? 0)),
      assassination: Math.max(
        0,
        Math.floor(player.dailyLimits.assassinationUsed ?? 0),
      ),
      infiltration: Math.max(
        0,
        Math.floor(player.dailyLimits.infiltrationUsed ?? 0),
      ),
    },
  };
}

/**
 * Produce the next `PlayerState.dailyLimits` snapshot after recording one
 * additional `kind` mission. The day-cycle integration (Todo 9) calls this
 * when applying an executed mission to the persistent player state.
 */
export function writeTrackerBack(
  player: PlayerState,
  kind: SpyMissionKind,
): Pick<
  PlayerState['dailyLimits'],
  'intelUsed' | 'assassinationUsed' | 'infiltrationUsed'
> {
  const base = {
    intelUsed: player.dailyLimits.intelUsed,
    assassinationUsed: player.dailyLimits.assassinationUsed,
    infiltrationUsed: player.dailyLimits.infiltrationUsed,
  };
  if (kind === 'intel') return { ...base, intelUsed: base.intelUsed + 1 };
  if (kind === 'assassination')
    return { ...base, assassinationUsed: base.assassinationUsed + 1 };
  return { ...base, infiltrationUsed: base.infiltrationUsed + 1 };
}

// ---------------------------------------------------------------------------
// Spy pressure (re-exported for testability; sourced from v5Combat)
// ---------------------------------------------------------------------------

export function getSpyPressureProtection(spyPressureToday: number): number {
  return 1 / (1 + Math.max(0, Number(spyPressureToday) || 0) / 16);
}

// ---------------------------------------------------------------------------
// Turn bounds (per-kind)
// ---------------------------------------------------------------------------

export function missionTurnBounds(kind: SpyMissionKind): {
  min: number;
  max: number;
  default: number;
} {
  if (kind === 'intel') {
    return {
      min: 1,
      max: V5_COMBAT_CONSTANTS.MAX_INTEL_TURNS,
      default: 1,
    };
  }
  if (kind === 'infiltration') {
    return {
      min: V5_COMBAT_CONSTANTS.MIN_INFILTRATION_TURNS,
      max: V5_COMBAT_CONSTANTS.MAX_SPY_MISSION_TURNS,
      default: V5_COMBAT_CONSTANTS.MIN_INFILTRATION_TURNS,
    };
  }
  return {
    min: V5_COMBAT_CONSTANTS.MIN_ASSASSINATION_TURNS,
    max: V5_COMBAT_CONSTANTS.MAX_SPY_MISSION_TURNS,
    default: V5_COMBAT_CONSTANTS.MIN_ASSASSINATION_TURNS,
  };
}

export function clampMissionTurns(
  kind: SpyMissionKind,
  requested: number,
): number {
  const bounds = missionTurnBounds(kind);
  const floored = Math.floor(Number(requested) || bounds.default);
  return Math.min(bounds.max, Math.max(bounds.min, floored));
}

// ---------------------------------------------------------------------------
// Decisions, skip events, eligibility
// ---------------------------------------------------------------------------

export interface SpyMissionDecision {
  readonly kind: SpyMissionKind;
  readonly targetId: string;
  readonly spies: number;
  readonly turns: number;
  readonly targetUnit?: SpyMissionTargetUnit;
  readonly reason: string;
}

export type SpySkipReason =
  | 'INSUFFICIENT_SPIES'
  | 'INSUFFICIENT_INFILTRATORS'
  | 'INSUFFICIENT_ASSASSINS'
  | 'INSUFFICIENT_ATTACK_TURNS'
  | 'INSUFFICIENT_STAMINA'
  | 'INSUFFICIENT_SPY_OFFENSE'
  | 'INFILTRATION_LOCKED'
  | 'ASSASSINATION_LOCKED'
  | 'INFILTRATION_LIMIT_EXCEEDED'
  | 'ASSASSINATION_LIMIT_EXCEEDED'
  | 'TARGET_OUT_OF_RANGE'
  | 'TARGET_INELIGIBLE'
  | 'MISSION_PER_DAY_LIMIT'
  | 'PER_TARGET_LIMIT'
  | 'NO_TARGETS'
  | 'PERSONA_SKIPS_MISSION'
  | 'TARGET_UNIT_REQUIRED';

export interface SpySkipEvent {
  readonly day: number;
  readonly actorId: string;
  readonly targetId?: string;
  readonly kind?: SpyMissionKind;
  readonly reason: SpySkipReason;
  readonly message: string;
}

export function createSkipEvent(input: {
  readonly day: number;
  readonly actorId: string;
  readonly reason: SpySkipReason;
  readonly kind?: SpyMissionKind;
  readonly targetId?: string;
  readonly message: string;
}): SpySkipEvent {
  return { ...input };
}

export interface SpyEligibilityContext {
  readonly attacker: PlayerState;
  readonly defender: PlayerState;
  readonly kind: SpyMissionKind;
  readonly spies: number;
  readonly turns: number;
  readonly targetUnit?: SpyMissionTargetUnit;
  readonly attackLevelRange: number;
  readonly tracker: SpyDayTracker;
  readonly limits: SpyLimitManifest;
}

export type SpyEligibilityResult =
  | { readonly eligible: true }
  | {
      readonly eligible: false;
      readonly reason: SpySkipReason;
      readonly message: string;
    };

export function checkSpyEligibility(
  ctx: SpyEligibilityContext,
): SpyEligibilityResult {
  const { attacker, defender, kind, limits } = ctx;
  const kindLimits =
    kind === 'intel'
      ? limits.intel
      : kind === 'assassination'
        ? limits.assassination
        : limits.infiltration;

  if (Math.abs(attacker.level - defender.level) > ctx.attackLevelRange) {
    return {
      eligible: false,
      reason: 'TARGET_OUT_OF_RANGE',
      message: `Defender level ${defender.level} outside range ±${ctx.attackLevelRange} of attacker ${attacker.level}.`,
    };
  }

  if (defender.status !== 'active') {
    return {
      eligible: false,
      reason: 'TARGET_INELIGIBLE',
      message: `Defender status ${defender.status} is not a legal spy target.`,
    };
  }

  if (kind === 'assassination' && !ctx.targetUnit) {
    return {
      eligible: false,
      reason: 'TARGET_UNIT_REQUIRED',
      message: 'Assassination requires an explicit target unit.',
    };
  }

  // Production SpyService checks structure-level lockout BEFORE counting
  // available spies, so a low-level attacker gets a typed LOCKED reason
  // rather than the generic INSUFFICIENT_SPIES.
  if (
    (kind === 'infiltration' || kind === 'assassination') &&
    (kindLimits.perDay <= 0 || kindLimits.perMission <= 0)
  ) {
    return {
      eligible: false,
      reason:
        kind === 'infiltration'
          ? 'INFILTRATION_LOCKED'
          : 'ASSASSINATION_LOCKED',
      message: `${kind} is not unlocked at spy level ${attacker.spyLevel}.`,
    };
  }

  if (ctx.spies <= 0) {
    return {
      eligible: false,
      reason: 'INSUFFICIENT_SPIES',
      message: 'Spy missions require at least one spy.',
    };
  }

  const attackerSpyCount =
    attacker.units.spy + attacker.units.infiltrator + attacker.units.assassin;
  if (attackerSpyCount < ctx.spies) {
    return {
      eligible: false,
      reason: 'INSUFFICIENT_SPIES',
      message: `Attacker has ${attackerSpyCount} spy-line units; mission requests ${ctx.spies}.`,
    };
  }

  if (kind === 'infiltration') {
    if (attacker.units.infiltrator < ctx.spies) {
      return {
        eligible: false,
        reason: 'INSUFFICIENT_INFILTRATORS',
        message: `Attacker has ${attacker.units.infiltrator} infiltrators; mission requests ${ctx.spies}.`,
      };
    }
    if (
      ctx.spies > Math.min(kindLimits.perMission, kindLimits.perTargetPerDay)
    ) {
      return {
        eligible: false,
        reason: 'INFILTRATION_LIMIT_EXCEEDED',
        message: `Infiltration count ${ctx.spies} exceeds per-mission cap ${kindLimits.perMission}.`,
      };
    }
  }

  if (kind === 'assassination') {
    if (attacker.units.assassin < ctx.spies) {
      return {
        eligible: false,
        reason: 'INSUFFICIENT_ASSASSINS',
        message: `Attacker has ${attacker.units.assassin} assassins; mission requests ${ctx.spies}.`,
      };
    }
    if (
      ctx.spies > Math.min(kindLimits.perMission, kindLimits.perTargetPerDay)
    ) {
      return {
        eligible: false,
        reason: 'ASSASSINATION_LIMIT_EXCEEDED',
        message: `Assassination count ${ctx.spies} exceeds per-mission cap ${kindLimits.perMission}.`,
      };
    }
  }

  if (ctx.turns > attacker.attackTurns) {
    return {
      eligible: false,
      reason: 'INSUFFICIENT_ATTACK_TURNS',
      message: `Attacker has ${attacker.attackTurns} turns; mission requires ${ctx.turns}.`,
    };
  }

  if (ctx.turns > attacker.stamina) {
    return {
      eligible: false,
      reason: 'INSUFFICIENT_STAMINA',
      message: `Attacker has ${attacker.stamina} stamina; mission requires ${ctx.turns}.`,
    };
  }

  if (attackerSpyCount <= 0) {
    return {
      eligible: false,
      reason: 'INSUFFICIENT_SPY_OFFENSE',
      message: 'Attacker has zero total spy-line units.',
    };
  }

  if (trackerPerKindCount(ctx.tracker, kind) >= kindLimits.perDay) {
    return {
      eligible: false,
      reason: 'MISSION_PER_DAY_LIMIT',
      message: `Mission kind ${kind} reached per-day cap ${kindLimits.perDay}.`,
    };
  }

  if (
    trackerPerTargetCount(ctx.tracker, defender.id, kind) >=
    kindLimits.perTargetPerDay
  ) {
    return {
      eligible: false,
      reason: 'PER_TARGET_LIMIT',
      message: `Mission kind ${kind} against ${defender.id} reached per-target cap ${kindLimits.perTargetPerDay}.`,
    };
  }

  return { eligible: true };
}

// ---------------------------------------------------------------------------
// Persona priority
// ---------------------------------------------------------------------------

const PERSONA_MISSION_PRIORITY: Record<Persona, readonly SpyMissionKind[]> = {
  spy: ['assassination', 'infiltration', 'intel'] as readonly SpyMissionKind[],
  sentry: ['intel'] as readonly SpyMissionKind[],
  attacker: ['intel', 'infiltration'] as readonly SpyMissionKind[],
  defender: ['intel'] as readonly SpyMissionKind[],
  farmer: ['intel'] as readonly SpyMissionKind[],
  balanced: ['intel', 'infiltration'] as readonly SpyMissionKind[],
};

export function personaMissionPriority(
  persona: Persona,
): readonly SpyMissionKind[] {
  return PERSONA_MISSION_PRIORITY[persona] ?? PERSONA_MISSION_PRIORITY.balanced;
}

// ---------------------------------------------------------------------------
// Target selection
// ---------------------------------------------------------------------------

export interface SpyTargetSelectionOptions {
  readonly attackLevelRange: number;
  readonly kind: SpyMissionKind;
  readonly intelCache?: ReadonlyMap<string, IntelResult>;
  readonly rng: Rng;
}

/**
 * Deterministic spy-target selector. Returns `null` when no candidate is
 * level-legal and active. Stable ordering by candidate id precedes any RNG
 * tie-break so identical inputs always select the same target.
 */
export function selectSpyTarget(
  attacker: PlayerState,
  candidates: readonly PlayerState[],
  options: SpyTargetSelectionOptions,
): PlayerState | null {
  const legal = candidates.filter(
    (c) =>
      c.id !== attacker.id &&
      c.status === 'active' &&
      Math.abs(c.level - attacker.level) <= options.attackLevelRange,
  );
  if (legal.length === 0) return null;
  const sorted = legal.slice().sort((a, b) => a.id.localeCompare(b.id));
  return options.rng.pick(sorted);
}

// ---------------------------------------------------------------------------
// Decision planning
// ---------------------------------------------------------------------------

export interface SpyDecisionContext {
  readonly attacker: PlayerState;
  readonly candidates: readonly PlayerState[];
  readonly persona: Persona;
  readonly tracker: SpyDayTracker;
  readonly limits: SpyLimitManifest;
  readonly attackLevelRange: number;
  readonly rng: Rng;
  readonly maxMissionsPerInvocation: number;
  readonly day: number;
}

export interface SpyDecisionResult {
  readonly decisions: readonly SpyMissionDecision[];
  readonly skips: readonly SpySkipEvent[];
}

/**
 * Plan a deterministic sequence of spy missions for `attacker` this tick.
 *
 * The persona priority controls which mission kinds are attempted first;
 * for each priority kind we attempt at most one mission against a
 * randomly-selected legal target. Eligibility failures are recorded as
 * skip events so the simulation can explain why a spy persona did not
 * act on a given tick. Missions that exhaust the per-invocation cap or
 * the per-day/per-target caps end the loop.
 */
export function planSpyMissions(ctx: SpyDecisionContext): SpyDecisionResult {
  const decisions: SpyMissionDecision[] = [];
  const skips: SpySkipEvent[] = [];
  const priority = personaMissionPriority(ctx.persona);
  const remainingTargets = new Set(ctx.candidates.map((c) => c.id));

  for (const kind of priority) {
    if (decisions.length >= ctx.maxMissionsPerInvocation) break;
    if (remainingTargets.size === 0) break;

    const candidates = ctx.candidates.filter(
      (c) =>
        c.id !== ctx.attacker.id &&
        remainingTargets.has(c.id) &&
        Math.abs(c.level - ctx.attacker.level) <= ctx.attackLevelRange,
    );
    if (candidates.length === 0) {
      skips.push(
        createSkipEvent({
          day: ctx.day,
          actorId: ctx.attacker.id,
          kind,
          reason: 'NO_TARGETS',
          message: `No legal ${kind} targets within ±${ctx.attackLevelRange} levels.`,
        }),
      );
      continue;
    }

    const target = selectSpyTarget(ctx.attacker, candidates, {
      attackLevelRange: ctx.attackLevelRange,
      kind,
      rng: ctx.rng,
    });
    if (!target) {
      skips.push(
        createSkipEvent({
          day: ctx.day,
          actorId: ctx.attacker.id,
          kind,
          reason: 'NO_TARGETS',
          message: `Target selector returned null for ${kind}.`,
        }),
      );
      continue;
    }

    const desiredSpies = pickMissionSpyCount(ctx.attacker, kind, ctx.limits);
    const desiredTurns = missionTurnBounds(kind).default;
    const targetUnit =
      kind === 'assassination' ? pickAssassinationTarget() : undefined;

    const eligibility = checkSpyEligibility({
      attacker: ctx.attacker,
      defender: target,
      kind,
      spies: desiredSpies,
      turns: desiredTurns,
      targetUnit,
      attackLevelRange: ctx.attackLevelRange,
      tracker: ctx.tracker,
      limits: ctx.limits,
    });

    if (!eligibility.eligible) {
      skips.push(
        createSkipEvent({
          day: ctx.day,
          actorId: ctx.attacker.id,
          kind,
          targetId: target.id,
          reason:
            'reason' in eligibility
              ? eligibility.reason
              : 'PERSONA_SKIPS_MISSION',
          message:
            'message' in eligibility
              ? eligibility.message
              : 'Eligibility denied.',
        }),
      );
      continue;
    }

    decisions.push({
      kind,
      targetId: target.id,
      spies: desiredSpies,
      turns: desiredTurns,
      targetUnit,
      reason: `persona:${ctx.persona}`,
    });
    remainingTargets.delete(target.id);
  }

  if (decisions.length === 0 && skips.length === 0) {
    skips.push(
      createSkipEvent({
        day: ctx.day,
        actorId: ctx.attacker.id,
        reason: 'PERSONA_SKIPS_MISSION',
        message: `Persona ${ctx.persona} has no eligible spy missions this tick.`,
      }),
    );
  }

  return { decisions, skips };
}

function pickMissionSpyCount(
  attacker: PlayerState,
  kind: SpyMissionKind,
  limits: SpyLimitManifest,
): number {
  const kindLimits =
    kind === 'intel'
      ? limits.intel
      : kind === 'assassination'
        ? limits.assassination
        : limits.infiltration;
  if (kindLimits.perMission <= 0) return 0;

  let available = attacker.units.spy;
  if (kind === 'infiltration') available = attacker.units.infiltrator;
  else if (kind === 'assassination') available = attacker.units.assassin;
  if (available <= 0) return 0;

  const cap = Math.min(kindLimits.perMission, kindLimits.perTargetPerDay);
  return Math.max(1, Math.min(available, cap));
}

function pickAssassinationTarget(): SpyMissionTargetUnit {
  return CITIZEN_WORKERS_TARGET;
}

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

export type SpyIntelAudience =
  | { readonly kind: 'self' }
  | { readonly kind: 'alliance'; readonly memberIds: readonly string[] };

export interface SpyExecutionContext {
  readonly attacker: PlayerState;
  readonly defender: PlayerState;
  readonly decision: SpyMissionDecision;
  readonly random: () => number;
  readonly day: number;
  readonly audience: SpyIntelAudience;
}

export interface SpyMissionOutcome {
  readonly kind: SpyMissionKind;
  readonly success: boolean;
  readonly targetId: string;
  readonly spiesSent: number;
  readonly spiesLost: number;
  readonly targetCasualties?: number;
  readonly targetUnit?: SpyMissionTargetUnit;
  readonly fortDamage?: number;
  readonly turnsSpent: number;
  readonly staminaSpent: number;
  readonly intel?: IntelPayload;
  readonly attackerXpAwarded: number;
  readonly defenderXpAwarded: number;
}

export interface SpyExecutionResult {
  readonly outcome: SpyMissionOutcome;
  readonly visibility: SpyIntelAudience;
  readonly spyPressureDelta: number;
  readonly attackerCasualtyDeltas: Partial<UnitCounts>;
  readonly defenderCasualtyDeltas: Partial<UnitCounts>;
  readonly defenderFortDamage: number;
}

/**
 * Single source of truth for who may read a spy mission's intel payload.
 * Returns true iff `viewerId` is the attacker itself or is declared in
 * the audience's alliance member list.
 */
export function canSeeIntel(
  audience: SpyIntelAudience,
  viewerId: string,
  attackerId: string,
): boolean {
  if (viewerId === attackerId) return true;
  if (audience.kind === 'alliance') {
    return audience.memberIds.includes(viewerId);
  }
  return false;
}

function emptyUnitDeltas(): Partial<UnitCounts> {
  return {
    spy: 0,
    infiltrator: 0,
    assassin: 0,
    sentry: 0,
    sentinel: 0,
    inquisitor: 0,
    citizen: 0,
    worker: 0,
  };
}

function toUnitCasualtyDeltas(
  kind: SpyMissionKind,
  spiesLost: number,
  targetCasualties: number | undefined,
  targetUnit: SpyMissionTargetUnit | undefined,
): {
  attacker: Partial<UnitCounts>;
  defender: Partial<UnitCounts>;
} {
  const attacker = emptyUnitDeltas();
  const defender = emptyUnitDeltas();
  if (spiesLost > 0) {
    if (kind === 'intel') attacker.spy = -spiesLost;
    else if (kind === 'infiltration') attacker.infiltrator = -spiesLost;
    else if (kind === 'assassination') attacker.assassin = -spiesLost;
  }
  if (targetCasualties && targetCasualties > 0 && targetUnit) {
    if (targetUnit === CITIZEN_WORKERS_TARGET) {
      const half = Math.ceil(targetCasualties / 2);
      defender.worker = -half;
      defender.citizen = -(targetCasualties - half);
    } else if (targetUnit === 'CITIZEN') {
      defender.citizen = -targetCasualties;
    } else if (targetUnit === 'WORKER') {
      defender.worker = -targetCasualties;
    } else if (targetUnit === 'SPY') {
      defender.spy = -targetCasualties;
    } else if (targetUnit === 'SENTRY') {
      defender.sentry = -targetCasualties;
    }
  }
  return { attacker, defender };
}

function buildIntelPayload(defender: PlayerState): IntelPayload {
  return {
    units: { ...defender.units },
    fortLevel: defender.fortLevel,
    fortHp: defender.fortHp,
    fortMaxHp: defender.fortMaxHp,
    gold: defender.gold,
    defenseBonus: defender.bonuses.defense,
    spyLevel: defender.spyLevel,
    sentryLevel: defender.sentryLevel,
  };
}

/**
 * Execute a single spy mission by delegating to the typed engine wrappers
 * (`simulateSpyIntel` / `simulateSpyAssassination` / `simulateSpyInfiltration`).
 *
 * All production formulas live inside those wrappers; this function only
 * (a) routes the decision to the right wrapper, (b) maps the typed
 * SpyResult / IntelResult into the rich execution contract, and (c)
 * reports the defender spy-pressure delta (`committedTurns`) so the
 * caller can apply it without re-deriving the production rule.
 *
 * The returned `visibility` field is set from `ctx.audience` and is the
 * sole authority on who may read the intel payload. Todo 9 callers MUST
 * consult `canSeeIntel` before propagating `outcome.intel`.
 *
 * Spy missions never award battle XP absent production support: the
 * `attackerXpAwarded` / `defenderXpAwarded` fields are always `0` here.
 */
export async function executeSpyMission(
  ctx: SpyExecutionContext,
): Promise<SpyExecutionResult> {
  const { decision, attacker, defender, random, audience } = ctx;
  let outcome: SpyMissionOutcome;
  if (decision.kind === 'intel') {
    const result = await simulateSpyIntel(
      attacker,
      defender,
      decision.spies,
      random,
      decision.turns,
    );
    outcome = intelResultToOutcome(decision, result, defender);
  } else if (decision.kind === 'assassination') {
    const result = await simulateSpyAssassination(
      attacker,
      defender,
      decision.spies,
      decision.targetUnit,
      random,
      decision.turns,
    );
    outcome = spyResultToOutcome(decision, result, defender);
  } else {
    const result = await simulateSpyInfiltration(
      attacker,
      defender,
      decision.spies,
      random,
      decision.turns,
    );
    outcome = spyResultToOutcome(decision, result, defender);
  }

  const casualtyDeltas = toUnitCasualtyDeltas(
    decision.kind,
    outcome.spiesLost,
    outcome.targetCasualties,
    decision.targetUnit,
  );
  const spyPressureDelta = decision.turns;

  return {
    outcome,
    visibility: audience,
    spyPressureDelta,
    attackerCasualtyDeltas: casualtyDeltas.attacker,
    defenderCasualtyDeltas: casualtyDeltas.defender,
    defenderFortDamage: outcome.fortDamage ?? 0,
  };
}

function intelResultToOutcome(
  decision: SpyMissionDecision,
  result: IntelResult,
  defender: PlayerState,
): SpyMissionOutcome {
  const spiesLost = Math.min(
    decision.spies,
    Math.max(0, Math.floor(result.spyCasualties ?? 0)),
  );
  return {
    kind: 'intel',
    success: Boolean(result.success),
    targetId: decision.targetId,
    spiesSent: decision.spies,
    spiesLost,
    turnsSpent: decision.turns,
    staminaSpent: decision.turns,
    intel: result.success ? buildIntelPayload(defender) : undefined,
    attackerXpAwarded: 0,
    defenderXpAwarded: 0,
  };
}

function spyResultToOutcome(
  decision: SpyMissionDecision,
  result: SpyResult,
  defender: PlayerState,
): SpyMissionOutcome {
  const spiesLost = Math.min(
    decision.spies,
    Math.max(0, Math.floor(result.spyCasualties ?? 0)),
  );
  return {
    kind: decision.kind,
    success: Boolean(result.success),
    targetId: decision.targetId,
    spiesSent: decision.spies,
    spiesLost,
    targetCasualties:
      decision.kind === 'assassination'
        ? Math.max(0, Math.floor(result.targetCasualties ?? 0))
        : undefined,
    targetUnit: decision.targetUnit,
    fortDamage:
      decision.kind === 'infiltration'
        ? Math.max(0, Math.floor(result.fortDamage ?? 0))
        : undefined,
    turnsSpent: decision.turns,
    staminaSpent: decision.turns,
    intel:
      decision.kind === 'intel' && result.success
        ? buildIntelPayload(defender)
        : undefined,
    attackerXpAwarded: 0,
    defenderXpAwarded: 0,
  };
}

// ---------------------------------------------------------------------------
// Application plan (Todo 9 adapter)
// ---------------------------------------------------------------------------

export interface SpyApplicationPlan {
  readonly attackerTurnsDelta: number;
  readonly attackerStaminaDelta: number;
  readonly attackerCasualtyDeltas: Partial<UnitCounts>;
  readonly defenderSpyPressureDelta: number;
  readonly defenderCasualtyDeltas: Partial<UnitCounts>;
  readonly defenderFortDamage: number;
  readonly visibility: SpyIntelAudience;
  readonly xpAwarded: { readonly attacker: number; readonly defender: number };
  readonly trackerDelta: {
    readonly kind: SpyMissionKind;
    readonly targetId: string;
  };
  readonly dailyLimitsDelta: ReturnType<typeof writeTrackerBack>;
  readonly intelRecord?: {
    readonly targetId: string;
    readonly result: IntelResult;
  };
}

/**
 * Build the deterministic mutation plan that Todo 9 applies to the
 * simulation state. Pure: returns a new plan object every call.
 */
export function planSpyApplication(
  execution: SpyExecutionResult,
  decision: SpyMissionDecision,
  attacker: PlayerState,
): SpyApplicationPlan {
  const intelRecord =
    decision.kind === 'intel' && execution.outcome.intel
      ? {
          targetId: decision.targetId,
          result: buildIntelResultRecord(decision, execution),
        }
      : undefined;

  return {
    attackerTurnsDelta: -decision.turns,
    attackerStaminaDelta: -decision.turns,
    attackerCasualtyDeltas: execution.attackerCasualtyDeltas,
    defenderSpyPressureDelta: execution.spyPressureDelta,
    defenderCasualtyDeltas: execution.defenderCasualtyDeltas,
    defenderFortDamage: execution.defenderFortDamage,
    visibility: execution.visibility,
    xpAwarded: { attacker: 0, defender: 0 },
    trackerDelta: { kind: decision.kind, targetId: decision.targetId },
    dailyLimitsDelta: writeTrackerBack(attacker, decision.kind),
    intelRecord,
  };
}

function buildIntelResultRecord(
  decision: SpyMissionDecision,
  execution: SpyExecutionResult,
): IntelResult {
  return {
    success: execution.outcome.success,
    day: 0,
    defenderInfo: execution.outcome.intel,
    spyCasualties: execution.outcome.spiesLost,
    spiesSent: decision.spies,
  };
}

// ---------------------------------------------------------------------------
// Deterministic seeded RNG factory (used by tests and Todo 9 callers)
// ---------------------------------------------------------------------------

export function createSpyBehaviorRng(seed: number): Rng {
  return createRng(seed);
}
