/**
 * Comparative combat-protection rulesets for ERA-730 simulation.
 *
 * These manifests are SIMULATION-ONLY data. The `production` manifest
 * mirrors the live combat rules so a baseline run reproduces production
 * behavior; `weakLowLevelProtection` and `candidateSafety` describe
 * alternative policies used to measure divergence. They MUST NOT be
 * described as live behavior.
 *
 * The actual low-level protection multiplier lives in
 * `src/utils/attackFunctions.ts` (currently `* 0.1`) and is toggled by the
 * `isDefenderProtected` flag passed into `simulateBattle`. The manifests
 * below capture the *intent* of each policy so `runSingleBattle` can map
 * a ruleset onto the existing primitive without mutating production
 * constants.
 */

import { SimulationConfigError } from './invariants';
import type { RulesetId } from './scenarioTypes';

/**
 * Tracks per-defender daily casualty usage under a ruleset that applies a
 * defender-wide daily cap. The scenario runner resets this at the start of
 * each simulated day.
 */
export interface DailyCasualtyCapUsage {
  /** Cumulative casualty count already applied to this defender today. */
  readonly casualtiesApplied: number;
  /**
   * Defender population snapshot at the start of the day. Used as the
   * baseline for the percentage cap.
   */
  readonly startOfDayPopulation: number;
}

/**
 * Per-player rebuild shield state. Tracked only when the active ruleset
 * has a non-null `rebuildShield` policy (currently `candidateSafety`).
 *
 * The shield is intentionally modelled as mutable-in-spirit: helpers
 * return new state objects rather than mutating in place, but the
 * `remainingDays`/`expired`/`expiryReason` fields describe evolving
 * simulation state rather than immutable configuration.
 */
export interface RebuildShieldState {
  readonly playerId: string;
  /** Simulated day the shield was activated (the day of the wipe). */
  readonly activatedOnDay: number;
  /**
   * Strategic power frozen at the moment of the wipe (pre-wipe level).
   * Used as the baseline for the 50% recovery expiry.
   */
  readonly frozenPreWipeStrategicPower: number;
  /** Days of protection remaining (counts down from `durationDays`). */
  remainingDays: number;
  /** True once any expiry condition has fired. */
  expired: boolean;
  /** Why the shield ended (set when `expired` becomes true). */
  expiryReason?: 'outgoingPvp' | 'powerRecovered' | 'durationElapsed';
}

/** Static configuration of a rebuild shield policy. */
export interface RebuildShieldPolicy {
  /** Total protected days granted when the shield activates. */
  readonly durationDays: number;
  /**
   * Fraction of `frozenPreWipeStrategicPower` that, once reached by the
   * player's current strategic power, expires the shield early.
   */
  readonly minPowerRecoveryFraction: number;
  /** Whether an outgoing PvP action immediately lifts the shield. */
  readonly pvpActionLiftsShield: boolean;
}

/**
 * Immutable description of a combat-protection ruleset. The values below
 * are intent-level: the engine decides how to honour them via existing
 * primitives (`isDefenderProtected`, daily-cap helpers, shield helpers).
 */
export interface RulesetManifest {
  readonly id: RulesetId;
  /** Human-readable description of intent (NOT live behavior). */
  readonly description: string;
  /**
   * Multiplier applied to incoming damage when the defender qualifies for
   * low-level protection. `0.1` matches production; `1.0` disables the
   * protection so divergence can be measured.
   */
  readonly lowLevelProtectionMultiplier: number;
  /** Inclusive level ceiling for low-level protection. */
  readonly lowLevelProtectionMaxLevel: number;
  /** Per-attack population loss cap (fraction of total population). */
  readonly singleAttackPopulationCap: number;
  /**
   * Defender-wide daily casualty cap as a fraction of start-of-day
   * population. `null` means no daily cap (production behavior).
   */
  readonly dailyPopulationCap: number | null;
  /** Rebuild shield policy. `null` means no shield (production behavior). */
  readonly rebuildShield: RebuildShieldPolicy | null;
}

/**
 * Production ruleset. Mirrors live combat: low-level mitigation at 0.1x
 * through level 9, 8% per-attack cap, NO defender-wide daily cap, and NO
 * rebuild shield.
 */
export const PRODUCTION_RULESET: Readonly<RulesetManifest> = Object.freeze({
  id: 'production',
  description:
    'Live production ruleset. Low-level mitigation at 0.1x through level 9, 8% per-attack cap, no daily defender cap, no rebuild shield.',
  lowLevelProtectionMultiplier: 0.1,
  lowLevelProtectionMaxLevel: 9,
  singleAttackPopulationCap: 0.08,
  dailyPopulationCap: null,
  rebuildShield: null,
});

/**
 * Simulation-only ruleset that disables low-level protection (multiplier
 * 1.0) while keeping every other rule identical to production. Used to
 * expose what removing the low-level shield would change.
 */
export const WEAK_LOW_LEVEL_PROTECTION_RULESET: Readonly<RulesetManifest> =
  Object.freeze({
    id: 'weakLowLevelProtection',
    description:
      'Simulation-only ruleset. Disables low-level protection (multiplier 1.0) to expose the divergence from production.',
    lowLevelProtectionMultiplier: 1.0,
    lowLevelProtectionMaxLevel: 9,
    singleAttackPopulationCap: 0.08,
    dailyPopulationCap: null,
    rebuildShield: null,
  });

/**
 * Simulation-only candidate ruleset. Production low-level mitigation
 * (0.1x) PLUS a 20% start-of-day-population defender-wide daily casualty
 * cap AND seven protected rebuilding days. The shield expires early when
 * the player initiates PvP or sustains 50% of the frozen pre-wipe
 * strategic power.
 */
export const CANDIDATE_SAFETY_RULESET: Readonly<RulesetManifest> =
  Object.freeze({
    id: 'candidateSafety',
    description:
      'Simulation-only candidate ruleset. Adds a 20% start-of-day-population daily casualty cap and a 7-day rebuild shield that expires on outgoing PvP, 50% power recovery, or day 8.',
    lowLevelProtectionMultiplier: 0.1,
    lowLevelProtectionMaxLevel: 9,
    singleAttackPopulationCap: 0.08,
    dailyPopulationCap: 0.2,
    rebuildShield: {
      durationDays: 7,
      minPowerRecoveryFraction: 0.5,
      pvpActionLiftsShield: true,
    },
  });

/** Map of every ruleset id to its immutable manifest. */
export const RULESETS: Readonly<Record<RulesetId, RulesetManifest>> =
  Object.freeze({
    production: PRODUCTION_RULESET,
    weakLowLevelProtection: WEAK_LOW_LEVEL_PROTECTION_RULESET,
    candidateSafety: CANDIDATE_SAFETY_RULESET,
  });

/** Returns the immutable manifest for `id`, throwing on unknown ids. */
export function getRuleset(id: RulesetId): RulesetManifest {
  const manifest = RULESETS[id];
  if (!manifest) {
    throw new SimulationConfigError(
      `Unknown ruleset id "${id}". Valid ids: ${Object.keys(RULESETS).join(', ')}.`,
      'unknownRuleset',
    );
  }
  return manifest;
}

/**
 * Returns true when `defenderLevel` qualifies for low-level protection
 * under the supplied manifest. A multiplier of `1.0` (or higher) is
 * treated as "no protection".
 */
export function isProtectedByLowLevelRule(
  manifest: RulesetManifest,
  defenderLevel: number,
): boolean {
  return (
    manifest.lowLevelProtectionMultiplier < 1 &&
    defenderLevel <= manifest.lowLevelProtectionMaxLevel
  );
}

/**
 * Computes the defender-wide daily casualty allowance (in whole units)
 * under the active ruleset. Returns `Number.POSITIVE_INFINITY` when no
 * daily cap applies.
 */
export function dailyCasualtyAllowance(
  manifest: RulesetManifest,
  startOfDayPopulation: number,
): number {
  if (manifest.dailyPopulationCap == null) return Number.POSITIVE_INFINITY;
  return Math.max(
    0,
    Math.floor(startOfDayPopulation * manifest.dailyPopulationCap),
  );
}

/**
 * Factory for a fresh per-day usage tracker. The scenario runner creates
 * one of these per defender at the start of each simulated day.
 */
export function createDailyCasualtyCapUsage(
  startOfDayPopulation: number,
): DailyCasualtyCapUsage {
  return {
    casualtiesApplied: 0,
    startOfDayPopulation,
  };
}

/**
 * Pure daily-cap enforcement. Returns the casualty count that may
 * actually be applied after the cap, plus the next usage state.
 *
 * When the manifest has no daily cap, the input passes through unchanged
 * and the usage counter still accumulates for diagnostic visibility.
 */
export function applyDefenderDailyCap(input: {
  readonly manifest: RulesetManifest;
  readonly usage: DailyCasualtyCapUsage;
  readonly pendingCasualties: number;
}): { readonly allowed: number; readonly usage: DailyCasualtyCapUsage } {
  const { manifest, usage, pendingCasualties } = input;
  if (pendingCasualties <= 0) {
    return { allowed: 0, usage };
  }
  if (manifest.dailyPopulationCap == null) {
    return {
      allowed: pendingCasualties,
      usage: {
        casualtiesApplied: usage.casualtiesApplied + pendingCasualties,
        startOfDayPopulation: usage.startOfDayPopulation,
      },
    };
  }
  const allowance = dailyCasualtyAllowance(
    manifest,
    usage.startOfDayPopulation,
  );
  const remaining = Math.max(0, allowance - usage.casualtiesApplied);
  const allowed = Math.min(pendingCasualties, remaining);
  return {
    allowed,
    usage: {
      casualtiesApplied: usage.casualtiesApplied + allowed,
      startOfDayPopulation: usage.startOfDayPopulation,
    },
  };
}

/** Event shape consumed by `advanceRebuildShield`. */
export type RebuildShieldEvent =
  | {
      readonly kind: 'outgoingPvp';
      readonly currentDay: number;
    }
  | {
      readonly kind: 'powerSampled';
      readonly currentDay: number;
      readonly currentStrategicPower: number;
    }
  | {
      readonly kind: 'dayElapsed';
      readonly currentDay: number;
    };

/** Factory for a fresh rebuild shield state. */
export function createRebuildShield(input: {
  readonly playerId: string;
  readonly activatedOnDay: number;
  readonly frozenPreWipeStrategicPower: number;
  readonly policy: RebuildShieldPolicy;
}): RebuildShieldState {
  return {
    playerId: input.playerId,
    activatedOnDay: input.activatedOnDay,
    frozenPreWipeStrategicPower: input.frozenPreWipeStrategicPower,
    remainingDays: input.policy.durationDays,
    expired: false,
  };
}

/**
 * Pure rebuild-shield advancer. Returns the next shield state after the
 * supplied event. Expired shields are returned unchanged so callers can
 * keep streaming events without re-checking.
 *
 * Expiry conditions (evaluated in order):
 *   1. `outgoingPvp` (when `pvpActionLiftsShield` is true)
 *   2. `powerSampled` reaching `minPowerRecoveryFraction` of frozen power
 *   3. `dayElapsed` exhausting `durationDays` (day 8 for the candidate)
 */
export function advanceRebuildShield(
  policy: RebuildShieldPolicy,
  state: RebuildShieldState,
  event: RebuildShieldEvent,
): RebuildShieldState {
  if (state.expired) return state;

  if (policy.pvpActionLiftsShield && event.kind === 'outgoingPvp') {
    return {
      ...state,
      expired: true,
      expiryReason: 'outgoingPvp',
      remainingDays: 0,
    };
  }

  if (
    event.kind === 'powerSampled' &&
    event.currentStrategicPower >=
      policy.minPowerRecoveryFraction * state.frozenPreWipeStrategicPower
  ) {
    return {
      ...state,
      expired: true,
      expiryReason: 'powerRecovered',
      remainingDays: 0,
    };
  }

  if (event.kind === 'dayElapsed') {
    const next = state.remainingDays - 1;
    if (next <= 0) {
      return {
        ...state,
        expired: true,
        expiryReason: 'durationElapsed',
        remainingDays: 0,
      };
    }
    return { ...state, remainingDays: next };
  }

  return state;
}
