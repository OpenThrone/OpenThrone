import { UNIT_COSTS } from '../population';
import type { Persona } from '../scenarioTypes';
import type { UnitCounts } from '../types';
import type { PersonaThreatSignals } from './observation';
import { EMPTY_THREAT_SIGNALS } from './observation';
import type {
  PersonaObservation,
  PersonaPublicTargetIntel,
  PersonaSelfObservation,
  PersonaTacticalState,
} from './types';

export function makeThreatSignals(
  overrides: Partial<PersonaThreatSignals> = {},
): PersonaThreatSignals {
  return { ...EMPTY_THREAT_SIGNALS, ...overrides };
}

const BASE_SELF: PersonaSelfObservation = {
  playerId: 'farmer-1',
  persona: 'farmer',
  farmerVariant: 'greedy',
  activityClass: 'active',
  day: 10,
  tick: 0,
  ticksPerDay: 48,
  remainingTicksToday: 48,
  expectedRemainingTicks: 48 * 300,
  gold: 2_000_000,
  goldInBank: 5_000_000,
  bankExposure: 0.28,
  attackTurns: 0,
  stamina: 100,
  level: 10,
  citizensAvailable: 500,
  units: {
    soldier: 0,
    knight: 0,
    berserker: 0,
    guard: 200,
    archer: 0,
    royalGuard: 0,
    spy: 0,
    infiltrator: 0,
    assassin: 0,
    sentry: 100,
    sentinel: 0,
    inquisitor: 0,
    citizen: 500,
    worker: 1000,
  },
  coverageFraction: 0.9,
  fortLevel: 5,
  fortHp: 4000,
  fortMaxHp: 4000,
  spyLevel: 1,
  sentryLevel: 4,
  economyLevel: 4,
  repairCost: 0,
  goldPerWorkerPerTurn: 120,
  incomeLastDay: 0,
  income7d: 0,
  lootGainedLastDay: 0,
  loot7d: 0,
  workersLostLastDay: 0,
  workersAssassinatedLastDay: 0,
  workersAssassinated7d: 0,
  attacksSufferedLastDay: 0,
  attacksSuffered7d: 0,
  fortBreachedLast7d: false,
  fortBreachDaysAgo: null,
  incomingAttackersLast7d: 0,
  daysSinceLastThreat: 100,
  allianceThreatLevel: 0,
};

export type SelfObservationOverrides = Omit<
  Partial<PersonaSelfObservation>,
  'units'
> & { units?: Partial<UnitCounts> };

export function makeSelfObservation(
  overrides: SelfObservationOverrides,
): PersonaSelfObservation {
  const { units: unitOverrides, ...rest } = overrides;
  const merged: PersonaSelfObservation = { ...BASE_SELF, ...rest };
  return {
    ...merged,
    units: { ...BASE_SELF.units, ...(unitOverrides ?? {}) },
  };
}

export function makeQuietFarmerSelf(
  variant: 'greedy' | 'cautious' | 'adaptive' = 'greedy',
): PersonaSelfObservation {
  return makeSelfObservation({ farmerVariant: variant });
}

export function makeTarget(
  overrides: Partial<PersonaPublicTargetIntel>,
): PersonaPublicTargetIntel {
  return {
    targetId: 'opp-1',
    level: 10,
    withinAttackRange: true,
    powerBand: 'even',
    fortStatusBand: 'secure',
    goldBand: 'rich',
    observedLoot: 0,
    intelFreshness: 'none',
    recentlyAttackedByMe: false,
    attackedMeRecently: false,
    ...overrides,
  };
}

export function makeObservation(
  self: PersonaSelfObservation,
  targets: PersonaPublicTargetIntel[] = [],
): PersonaObservation {
  return { self, targets };
}

export function makeTactical(
  persona: Persona,
  farmerVariant?: 'greedy' | 'cautious' | 'adaptive',
  alertLevel = 0,
): PersonaTacticalState {
  return { persona, farmerVariant, alertLevel };
}

export const FIXTURE_WORKER_COST = UNIT_COSTS.worker;
