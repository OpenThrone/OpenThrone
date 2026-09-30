import type { DailyCasualtyCapUsage, RebuildShieldState } from './rulesets';
import type {
  DayResult,
  PlayerState,
  SimulationConfig,
  SimulationState,
} from './types';

export type Persona =
  | 'farmer'
  | 'attacker'
  | 'defender'
  | 'spy'
  | 'sentry'
  | 'balanced';

export const PERSONAS: readonly Persona[] = [
  'farmer',
  'attacker',
  'defender',
  'spy',
  'sentry',
  'balanced',
] as const;

export type FarmerVariant = 'greedy' | 'cautious' | 'adaptive';

export const FARMER_VARIANTS: readonly FarmerVariant[] = [
  'greedy',
  'cautious',
  'adaptive',
] as const;

export type ActivityClass = 'active' | 'passive' | 'inactive' | 'rebuilding';

export const ACTIVITY_CLASSES: readonly ActivityClass[] = [
  'active',
  'passive',
  'inactive',
  'rebuilding',
] as const;

export type LifecycleStatus =
  | 'active'
  | 'inactive'
  | 'defeated'
  | 'rebuilding'
  | 'lateJoiner';

export type RulesetId =
  | 'production'
  | 'weakLowLevelProtection'
  | 'candidateSafety';

export const RULESET_IDS: readonly RulesetId[] = [
  'production',
  'weakLowLevelProtection',
  'candidateSafety',
] as const;

export type AllianceMode =
  | 'none'
  | 'twoBalanced'
  | 'dominant60_40'
  | 'focusFive';

export const ALLIANCE_MODES: readonly AllianceMode[] = [
  'none',
  'twoBalanced',
  'dominant60_40',
  'focusFive',
] as const;

export type RecruitmentRecipientMode = 'self' | 'networkWeighted';

export const RECRUITMENT_RECIPIENT_MODES: readonly RecruitmentRecipientMode[] =
  ['self', 'networkWeighted'] as const;

export const RECRUITMENT_REWARD_BANDS: readonly number[] = [
  5, 15, 25, 40,
] as const;

export type PersonaCountMap = Partial<Record<Persona, number>>;
export type FarmerVariantCountMap = Partial<Record<FarmerVariant, number>>;

export interface CohortManifest {
  readonly activeCount: number;
  readonly passiveCount: number;
  readonly personaMix: {
    readonly active: PersonaCountMap;
    readonly passive: PersonaCountMap;
  };
  readonly farmerVariantMix: {
    readonly active: FarmerVariantCountMap;
    readonly passive: FarmerVariantCountMap;
  };
}

export interface RecruitmentManifest {
  readonly rewardsPerDay: number;
  readonly band: number;
  readonly recipientMode: RecruitmentRecipientMode;
  readonly selectionShare: number;
}

export interface RecruitmentAwardEvent {
  readonly day: number;
  readonly recipientId: string;
  readonly citizensAwarded: number;
  readonly goldAwarded: number;
  readonly sourceMode: RecruitmentRecipientMode;
}

export interface AllianceMemberSeat {
  readonly playerId: string;
  readonly allianceId: string;
  readonly isLeader: boolean;
}

export interface AllianceManifest {
  readonly mode: AllianceMode;
  readonly members: readonly AllianceMemberSeat[];
}

export interface EraScenarioManifest {
  readonly id: string;
  readonly rulesetId: RulesetId;
  readonly seed: number;
  readonly totalDays: number;
  readonly primaryCohort: CohortManifest;
  readonly recruitment: RecruitmentManifest;
  readonly allianceMode: AllianceMode;
  readonly lateJoinerDays: readonly number[];
  /** Balance gates are meaningful only after behavior/calibration targets are
   * validated against an approved production progression baseline. */
  readonly calibrationStatus?: 'uncalibrated' | 'calibrated';
}

/**
 * Scenario-only metadata for an ERA player. Contains NO fields from the base
 * `PlayerState` (no id, gold, units, etc.) so that storing this in a parallel
 * map does not duplicate mutable player state.
 */
export interface EraPlayerScenarioState {
  readonly persona: Persona;
  readonly farmerVariant?: FarmerVariant;
  readonly activityClass: ActivityClass;
  readonly lifecycleStatus: LifecycleStatus;
  readonly cohortId: string;
  readonly joinedOnDay: number;
}

/**
 * Convenience intersection for callers that need both base `PlayerState` and
 * scenario metadata in a single value. The canonical store is always the base
 * `SimulationState.players` map plus a separate `Map<string, EraPlayerScenarioState>`.
 */
export type EraPlayerState = PlayerState & EraPlayerScenarioState;

export interface ScenarioCohortSnapshot {
  readonly cohortId: string;
  readonly persona: Persona;
  readonly activityClass: ActivityClass;
  readonly citizens: number;
  readonly workers: number;
  readonly handGold: number;
  readonly bankGold: number;
  readonly fortLevel: number;
  readonly strategicPower: number;
}

export interface ScenarioCheckpoint {
  readonly day: number;
  readonly cohortSnapshots: readonly ScenarioCohortSnapshot[];
}

export const ScenarioEventKind = {
  Wipe: 'wipe',
  Recovery: 'recovery',
  Reactivation: 'reactivation',
  LateJoin: 'lateJoin',
  RecruitmentAward: 'recruitmentAward',
  AllianceAid: 'allianceAid',
  FocusFireNomination: 'focusFireNomination',
  Adaptation: 'adaptation',
} as const;

export type ScenarioEventKind =
  (typeof ScenarioEventKind)[keyof typeof ScenarioEventKind];

export interface ScenarioEvent {
  readonly kind: ScenarioEventKind;
  readonly day: number;
  readonly actorId: string;
  readonly reason?: string;
  readonly targetId?: string;
  readonly allianceId?: string;
  readonly value?: number;
}

export interface ScenarioCumulativeCounters {
  totalRewardEvents: number;
  totalRewardGold: number;
  totalRewardCitizens: number;
  totalAllianceAid: number;
  totalLootAwarded: number;
  totalWipes: number;
  totalReactivations: number;
}

export interface EraScenarioState {
  readonly manifest: EraScenarioManifest;
  readonly playerMeta: Map<string, EraPlayerScenarioState>;
  readonly allianceMeta: Map<string, AllianceManifest>;
  readonly checkpoints: ScenarioCheckpoint[];
  readonly events: ScenarioEvent[];
  readonly cumulative: ScenarioCumulativeCounters;
  /**
   * Per-defender daily casualty usage, keyed by player id. Reset by the
   * scenario runner at the start of each simulated day. Tracked only when
   * the active ruleset has a non-null `dailyPopulationCap`.
   */
  readonly dailyCasualtyCapUsage: Map<string, DailyCasualtyCapUsage>;
  /**
   * Per-player rebuild shield state, keyed by player id. Tracked only when
   * the active ruleset has a non-null `rebuildShield` policy.
   */
  readonly rebuildShields: Map<string, RebuildShieldState>;
}

export interface EraSimulationConfig extends SimulationConfig {
  readonly rulesetId?: RulesetId;
  readonly manifestId?: string;
}

/**
 * Composes an ERA simulation state from a base SimulationState and scenario
 * metadata WITHOUT redeclaring the base `players: Map<string, PlayerState>`.
 *
 * `Map<V>` is invariant in its value type, so an extension that widened
 * `players` to `Map<string, EraPlayerState>` would break assignability both
 * ways. We keep the invariant map on `base` and store ERA-specific player
 * metadata in a parallel map keyed by player id.
 */
export interface ComposedEraSimulationState {
  readonly base: SimulationState;
  readonly scenario: EraScenarioState;
  readonly config: EraSimulationConfig;
}

export const DEFAULT_DETERMINISTIC_SEED = 1;

export function simulateDayInputSeed(
  configSeed: number | undefined,
  manifestSeed: number | undefined,
): number {
  if (configSeed != null && Number.isFinite(configSeed)) {
    return Math.floor(configSeed);
  }
  if (manifestSeed != null && Number.isFinite(manifestSeed)) {
    return Math.floor(manifestSeed);
  }
  return DEFAULT_DETERMINISTIC_SEED;
}

export function createEmptyCumulativeCounters(): ScenarioCumulativeCounters {
  return {
    totalRewardEvents: 0,
    totalRewardGold: 0,
    totalRewardCitizens: 0,
    totalAllianceAid: 0,
    totalLootAwarded: 0,
    totalWipes: 0,
    totalReactivations: 0,
  };
}

export function appendDayResult(
  history: DayResult[],
  dayResult: DayResult,
): DayResult[] {
  return [...history, dayResult];
}
