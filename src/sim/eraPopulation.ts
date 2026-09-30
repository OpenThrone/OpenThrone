/**
 * Production-parity fresh-ERA player factory and cohort manifests.
 *
 * Maps the production fresh-account defaults declared in
 * `src/services/UserDefaults.service.ts` (`DEFAULT_USER_SCALARS` +
 * `ERA_DEFAULT_UNITS`) and applied by `src/services/User.service.ts`
 * (`createUser`) and `src/services/Era.service.ts` (`resetUserState`)
 * into the in-memory `PlayerState` shape consumed by `src/sim`.
 *
 * Defaults are duplicated here as immutable constants (rather than imported
 * from `services/`) so the simulation core stays decoupled from the
 * persistence layer, matching the pattern already used by `population.ts`.
 *
 * `houseLevel`/`economyLevel` are intentionally 0 here. The legacy
 * `getHouseLevelForPlayerLevel`/`getEconomyLevelForPlayerLevel` helpers
 * clamp to >= 1 and MUST NOT be used for ERA mode (see plan Todo 3).
 */

import { Fortifications } from '../constants';
import { SimulationConfigError } from './invariants';
import { deterministicId } from './random';
import {
  ACTIVITY_CLASSES,
  type ActivityClass,
  type CohortManifest,
  type EraPlayerScenarioState,
  type EraPlayerState,
  FARMER_VARIANTS,
  type FarmerVariant,
  type FarmerVariantCountMap,
  type LifecycleStatus,
  type Persona,
  type PersonaCountMap,
  PERSONAS,
} from './scenarioTypes';
import type { BehaviorParams, PlayerState, UnitCounts } from './types';

// Production-parity fresh-ERA scalar defaults.
// Source: `DEFAULT_USER_SCALARS` in `src/services/UserDefaults.service.ts`.

/** Fort level 1 (Manor): 50 HP, 1000 goldPerTurn. Source: `Fortifications[0]`. */
const FRESH_FORT_LEVEL = 1;
const FRESH_FORT_HITPOINTS = Fortifications[0].hitpoints;

const FRESH_ERA_SCALARS = {
  gold: 25000,
  goldInBank: 0,
  attackTurns: 50,
  stamina: 100,
  maxStamina: 100,
  experience: 0,
  fortLevel: FRESH_FORT_LEVEL,
  fortHitpoints: FRESH_FORT_HITPOINTS,
  houseLevel: 0,
  economyLevel: 0,
  spyLevel: 1,
  sentryLevel: 1,
  offenseUpgrade: 0,
  defenseUpgrade: 0,
  recruitBonus: 1,
  maximumBankDeposits: 3,
} as const;

/**
 * Fresh-ERA unit counts. Source: `ERA_DEFAULT_UNITS` —
 * CITIZEN level 1 x50, all trained unit fields zero.
 */
const FRESH_ERA_UNITS: UnitCounts = {
  soldier: 0,
  knight: 0,
  berserker: 0,
  guard: 0,
  archer: 0,
  royalGuard: 0,
  spy: 0,
  infiltrator: 0,
  assassin: 0,
  sentry: 0,
  sentinel: 0,
  inquisitor: 0,
  citizen: 50,
  worker: 0,
};

/** Neutral baseline behavior; persona policies (Todo 5) override this. */
const DEFAULT_ERA_BEHAVIOR: BehaviorParams = {
  aggression: 0.5,
  riskTolerance: 0.5,
  activityLevel: 0.5,
  wealthPreference: 0.5,
  spyPreference: 0.5,
  turnStrategy: 'balanced',
  playStyle: 'balanced',
  primaryGoal: 'growth',
};

// Primary cohort manifest: 15 active / 25 passive.

/**
 * The canonical 40-player baseline cohort.
 *
 * Active 15: 4 Farmers (2 greedy / 1 cautious / 1 adaptive), 4 attackers,
 *            2 defenders, 2 spies, 1 sentry, 2 balanced.
 * Passive 25: 8 Farmers (3 greedy / 3 cautious / 2 adaptive), 3 attackers,
 *             4 defenders, 2 spies, 2 sentries, 6 balanced.
 */
export const PRIMARY_COHORT_MANIFEST: CohortManifest = {
  activeCount: 15,
  passiveCount: 25,
  personaMix: {
    active: {
      farmer: 4,
      attacker: 4,
      defender: 2,
      spy: 2,
      sentry: 1,
      balanced: 2,
    },
    passive: {
      farmer: 8,
      attacker: 3,
      defender: 4,
      spy: 2,
      sentry: 2,
      balanced: 6,
    },
  },
  farmerVariantMix: {
    active: { greedy: 2, cautious: 1, adaptive: 1 },
    passive: { greedy: 3, cautious: 3, adaptive: 2 },
  },
};

/** Late-joiner arrival days. Source: plan Todo 3. */
export const LATE_JOINER_DAYS: readonly number[] = [30, 90, 180, 365] as const;

// Deterministic largest-remainder scaling.

interface ScaledEntry {
  readonly key: string;
  readonly raw: number;
  readonly floor: number;
  readonly remainder: number;
}

/**
 * Deterministic largest-remainder apportionment.
 *
 * Distributes `targetTotal` across the integer `source` counts proportional
 * to their weights, guaranteeing the results sum exactly to `targetTotal`.
 * Ties in remainder are broken by ascending key (lexicographic) so identical
 * inputs always produce identical outputs across runs.
 */
function largestRemainder(
  source: Readonly<Record<string, number>>,
  targetTotal: number,
): Record<string, number> {
  const entries = Object.entries(source).filter(([, v]) => v > 0);
  if (entries.length === 0 || targetTotal <= 0) {
    return {};
  }
  const weightTotal = entries.reduce((sum, [, v]) => sum + v, 0);
  if (weightTotal <= 0) return {};

  const scaled: ScaledEntry[] = entries.map(([key, v]) => {
    const raw = (v * targetTotal) / weightTotal;
    const floor = Math.floor(raw);
    return { key, raw, floor, remainder: raw - floor };
  });

  const result: Record<string, number> = {};
  let allocated = 0;
  for (const e of scaled) {
    result[e.key] = e.floor;
    allocated += e.floor;
  }

  let remaining = targetTotal - allocated;
  // Break tie by ascending key so output is independent of insertion order.
  const byRemainder = [...scaled].sort(
    (a, b) => b.remainder - a.remainder || a.key.localeCompare(b.key),
  );
  for (let i = 0; i < byRemainder.length && remaining > 0; i++) {
    result[byRemainder[i].key] += 1;
    remaining -= 1;
  }
  return result;
}

function scalePersonaMix(
  source: PersonaCountMap,
  targetTotal: number,
): PersonaCountMap {
  const weighted: Record<string, number> = {};
  for (const persona of PERSONAS) {
    const count = source[persona] ?? 0;
    if (count > 0) weighted[persona] = count;
  }
  const scaled = largestRemainder(weighted, targetTotal);
  const out: PersonaCountMap = {};
  for (const persona of PERSONAS) {
    const value = scaled[persona];
    if (typeof value === 'number') out[persona] = value;
  }
  return out;
}

function scaleFarmerVariantMix(
  source: FarmerVariantCountMap,
  targetFarmerTotal: number,
): FarmerVariantCountMap {
  const weighted: Record<string, number> = {};
  for (const variant of FARMER_VARIANTS) {
    const count = source[variant] ?? 0;
    if (count > 0) weighted[variant] = count;
  }
  const scaled = largestRemainder(weighted, targetFarmerTotal);
  const out: FarmerVariantCountMap = {};
  for (const variant of FARMER_VARIANTS) {
    const value = scaled[variant];
    if (typeof value === 'number') out[variant] = value;
  }
  return out;
}

/**
 * Produce a scaled `CohortManifest` from a baseline (default: primary) that
 * retains every persona present in the source at the new active/passive
 * bounds via deterministic largest-remainder apportionment. Farmer variants
 * are re-apportioned to the scaled farmer count.
 */
export function scaleCohortManifest(
  base: CohortManifest,
  activeCount: number,
  passiveCount: number,
): CohortManifest {
  if (
    !Number.isInteger(activeCount) ||
    activeCount < PERSONAS.length ||
    !Number.isFinite(activeCount)
  ) {
    throw new SimulationConfigError(
      `scaleCohortManifest activeCount must be an integer >= ${PERSONAS.length} (one seat per persona); received ${activeCount}`,
      'cohort-scale-active-invalid',
    );
  }
  if (
    !Number.isInteger(passiveCount) ||
    passiveCount < PERSONAS.length ||
    !Number.isFinite(passiveCount)
  ) {
    throw new SimulationConfigError(
      `scaleCohortManifest passiveCount must be an integer >= ${PERSONAS.length} (one seat per persona); received ${passiveCount}`,
      'cohort-scale-passive-invalid',
    );
  }

  const activePersona = scalePersonaMix(base.personaMix.active, activeCount);
  const passivePersona = scalePersonaMix(base.personaMix.passive, passiveCount);

  const activeFarmer = scaleFarmerVariantMix(
    base.farmerVariantMix.active,
    activePersona.farmer ?? 0,
  );
  const passiveFarmer = scaleFarmerVariantMix(
    base.farmerVariantMix.passive,
    passivePersona.farmer ?? 0,
  );

  return {
    activeCount,
    passiveCount,
    personaMix: { active: activePersona, passive: passivePersona },
    farmerVariantMix: { active: activeFarmer, passive: passiveFarmer },
  };
}

// Manifest validation.

type CohortGroup = 'active' | 'passive';

function sumPersonaCounts(mix: PersonaCountMap): number {
  return PERSONAS.reduce((sum, persona) => sum + (mix[persona] ?? 0), 0);
}

function sumFarmerVariants(mix: FarmerVariantCountMap): number {
  return FARMER_VARIANTS.reduce((sum, v) => sum + (mix[v] ?? 0), 0);
}

/**
 * Validate that a `CohortManifest` is internally consistent:
 *   1. Each persona mix sums to its declared active/passive total.
 *   2. Every persona in `PERSONAS` is present (> 0) in both groups.
 *   3. Farmer variant counts sum to the farmer persona count.
 *
 * Throws a `SimulationConfigError` whose message includes the offending
 * manifest field path (e.g. `CohortManifest.personaMix.passive.sentry`).
 */
export function validateCohortManifest(manifest: CohortManifest): void {
  const groups: readonly CohortGroup[] = ['active', 'passive'];
  for (const group of groups) {
    const expectedTotal =
      group === 'active' ? manifest.activeCount : manifest.passiveCount;
    const mix = manifest.personaMix[group];
    const actualTotal = sumPersonaCounts(mix);

    if (actualTotal !== expectedTotal) {
      throw new SimulationConfigError(
        `CohortManifest.personaMix.${group} sums to ${actualTotal}, ` +
          `expected ${expectedTotal} (${group}Count).`,
        `cohort-${group}-total-mismatch`,
      );
    }

    for (const persona of PERSONAS) {
      const value = mix[persona] ?? 0;
      if (value <= 0) {
        throw new SimulationConfigError(
          `CohortManifest.personaMix.${group}.${persona} is missing or zero ` +
            `(value=${value}); every persona must be present.`,
          `cohort-${group}-missing-persona`,
        );
      }
    }

    const farmerCount = mix.farmer ?? 0;
    const variants = manifest.farmerVariantMix[group];
    const variantTotal = sumFarmerVariants(variants);
    if (farmerCount > 0 && variantTotal !== farmerCount) {
      throw new SimulationConfigError(
        `CohortManifest.farmerVariantMix.${group} sums to ${variantTotal}, ` +
          `expected ${farmerCount} (farmer persona count).`,
        `cohort-${group}-farmer-variant-mismatch`,
      );
    }
  }
}

// Player construction.

export interface CreateEraPlayerOptions {
  readonly id?: string;
  readonly displayName?: string;
  readonly persona?: Persona;
  readonly farmerVariant?: FarmerVariant;
  readonly activityClass?: ActivityClass;
  readonly lifecycleStatus?: LifecycleStatus;
  readonly cohortId?: string;
  readonly joinedOnDay?: number;
}

function buildEraPlayerId(
  cohortId: string,
  activityClass: ActivityClass,
  persona: Persona,
  farmerVariant: FarmerVariant | undefined,
  index: number,
): string {
  const variantSegment =
    persona === 'farmer' && farmerVariant ? `-${farmerVariant}` : '';
  return `${cohortId}-${activityClass}-${persona}${variantSegment}-${index}`;
}

/**
 * Build one fresh-ERA player carrying the exact production defaults declared
 * in `DEFAULT_USER_SCALARS` / `ERA_DEFAULT_UNITS`, plus scenario metadata.
 */
export function createEraPlayer(
  options: CreateEraPlayerOptions = {},
): EraPlayerState {
  const persona = options.persona ?? 'balanced';
  const activityClass = options.activityClass ?? 'active';
  const cohortId = options.cohortId ?? 'primary';

  const playerState: PlayerState = {
    id: options.id ?? deterministicId('era-player', 0),
    displayName: options.displayName ?? 'ERA Player',
    level: 1,
    xp: FRESH_ERA_SCALARS.experience,
    houseLevel: FRESH_ERA_SCALARS.houseLevel,
    race: 'HUMAN',
    playerClass: 'FIGHTER',
    gold: FRESH_ERA_SCALARS.gold,
    goldInBank: FRESH_ERA_SCALARS.goldInBank,
    attackTurns: FRESH_ERA_SCALARS.attackTurns,
    stamina: FRESH_ERA_SCALARS.stamina,
    maxStamina: FRESH_ERA_SCALARS.maxStamina,
    defensePressureToday: 0,
    spyPressureToday: 0,
    units: { ...FRESH_ERA_UNITS },
    items: { meleeAtk: 0, meleeDef: 0, rangedAtk: 0, rangedDef: 0 },
    upgrades: {
      offense: FRESH_ERA_SCALARS.offenseUpgrade,
      defense: FRESH_ERA_SCALARS.defenseUpgrade,
    },
    fortLevel: FRESH_ERA_SCALARS.fortLevel,
    fortHp: FRESH_ERA_SCALARS.fortHitpoints,
    fortMaxHp: FRESH_ERA_SCALARS.fortHitpoints,
    spyLevel: FRESH_ERA_SCALARS.spyLevel,
    sentryLevel: FRESH_ERA_SCALARS.sentryLevel,
    economyLevel: FRESH_ERA_SCALARS.economyLevel,
    bonuses: { attack: 0, defense: 0, spy: 0, sentry: 0 },
    recruitBonus: FRESH_ERA_SCALARS.recruitBonus,
    maximumBankDeposits: FRESH_ERA_SCALARS.maximumBankDeposits,
    dailyLimits: {
      attacksUsed: 0,
      intelUsed: 0,
      assassinationUsed: 0,
      infiltrationUsed: 0,
    },
    behavior: { ...DEFAULT_ERA_BEHAVIOR },
    intelCache: new Map(),
    attackHistory: new Map(),
    incomingAttackHistory: new Map(),
    targetMemory: new Map(),
    bankDepositHistory: [],
    status: 'active',
  };

  const scenarioState: EraPlayerScenarioState = {
    persona,
    farmerVariant: persona === 'farmer' ? options.farmerVariant : undefined,
    activityClass,
    lifecycleStatus: options.lifecycleStatus ?? 'active',
    cohortId,
    joinedOnDay: options.joinedOnDay ?? 0,
  };

  return { ...playerState, ...scenarioState };
}

// Cohort construction.

export interface CreateEraCohortOptions {
  readonly cohortId?: string;
  /** Skip manifest validation (caller previously validated). Defaults to false. */
  readonly skipValidation?: boolean;
}

interface GroupBuildPlan {
  readonly activityClass: ActivityClass;
  readonly lifecycleStatus: LifecycleStatus;
  readonly personas: PersonaCountMap;
  readonly farmerVariants: FarmerVariantCountMap;
}

/**
 * Build the full roster for a cohort manifest. Iterates personas in canonical
 * `PERSONAS` order and Farmer variants in `FARMER_VARIANTS` order, so output
 * ordering and structural IDs are fully deterministic (no RNG).
 */
export function createEraCohort(
  manifest: CohortManifest = PRIMARY_COHORT_MANIFEST,
  options: CreateEraCohortOptions = {},
): EraPlayerState[] {
  if (!options.skipValidation) {
    validateCohortManifest(manifest);
  }
  const cohortId = options.cohortId ?? 'primary';

  const groups: GroupBuildPlan[] = [
    {
      activityClass: 'active',
      lifecycleStatus: 'active',
      personas: manifest.personaMix.active,
      farmerVariants: manifest.farmerVariantMix.active,
    },
    {
      activityClass: 'passive',
      lifecycleStatus: 'active',
      personas: manifest.personaMix.passive,
      farmerVariants: manifest.farmerVariantMix.passive,
    },
  ];

  const players: EraPlayerState[] = [];
  for (const group of groups) {
    for (const persona of PERSONAS) {
      const personaCount = group.personas[persona] ?? 0;
      if (personaCount <= 0) continue;

      if (persona === 'farmer') {
        let farmerIndex = 0;
        for (const variant of FARMER_VARIANTS) {
          const variantCount = group.farmerVariants[variant] ?? 0;
          for (let i = 0; i < variantCount; i++) {
            players.push(
              createEraPlayer({
                id: buildEraPlayerId(
                  cohortId,
                  group.activityClass,
                  persona,
                  variant,
                  farmerIndex,
                ),
                persona,
                farmerVariant: variant,
                activityClass: group.activityClass,
                lifecycleStatus: group.lifecycleStatus,
                cohortId,
                joinedOnDay: 0,
              }),
            );
            farmerIndex += 1;
          }
        }
      } else {
        for (let i = 0; i < personaCount; i++) {
          players.push(
            createEraPlayer({
              id: buildEraPlayerId(
                cohortId,
                group.activityClass,
                persona,
                undefined,
                i,
              ),
              persona,
              activityClass: group.activityClass,
              lifecycleStatus: group.lifecycleStatus,
              cohortId,
              joinedOnDay: 0,
            }),
          );
        }
      }
    }
  }

  return players;
}

/**
 * Build a late joiner arriving on `day`, using the same fresh-ERA defaults
 * as incumbents started day 0 (NOT level-scaled). The cohort id is
 * `lateJoiner-<day>` so each arrival wave is independently addressable.
 */
export function createLateJoiner(
  day: number,
  persona: Persona,
  farmerVariant?: FarmerVariant,
  activityClass: ActivityClass = 'active',
): EraPlayerState {
  if (!Number.isInteger(day) || day < 0) {
    throw new SimulationConfigError(
      `createLateJoiner day must be a non-negative integer; received ${day}`,
      'late-joiner-day-invalid',
    );
  }
  const cohortId = `lateJoiner-${day}`;
  return createEraPlayer({
    id: buildEraPlayerId(cohortId, activityClass, persona, farmerVariant, 0),
    persona,
    farmerVariant,
    activityClass,
    lifecycleStatus: 'lateJoiner',
    cohortId,
    joinedOnDay: day,
  });
}

/**
 * Build the late-joiner waves for the standard arrival days (30/90/180/365).
 * Each entry is one `EraPlayerState`; callers pass the per-day persona mix.
 */
export function createLateJoinerWaves(
  arrivals: ReadonlyArray<{
    readonly day: number;
    readonly persona: Persona;
    readonly farmerVariant?: FarmerVariant;
    readonly activityClass?: ActivityClass;
  }>,
): EraPlayerState[] {
  return arrivals.map((a) =>
    createLateJoiner(
      a.day,
      a.persona,
      a.farmerVariant,
      a.activityClass ?? 'active',
    ),
  );
}

export { ACTIVITY_CLASSES };
