/**
 * Persona policy dispatch and adapters (plan Todo 5).
 *
 * {@link decidePersonaPolicy} routes a player's observation to the right
 * policy: Farmers go through the variant engine; the other five personas use
 * a band-driven allocator keyed off the identity-stable allocation bands.
 *
 * This module is the single entry point Todo 9 calls. It owns the initial
 * tactical state factory and the legacy `AgentDecision` adapter, so the
 * daycycle can dispatch persona-driven players without touching
 * `behaviors.ts` or `targeting.ts` (which are frozen for Wave-2 merge
 * safety).
 */

import { SimulationConfigError } from '../invariants';
import { UNIT_COSTS } from '../population';
import type { Rng } from '../random';
import type { FarmerVariant, Persona } from '../scenarioTypes';
import { PERSONAS } from '../scenarioTypes';
import type { AgentDecision, PlayerState, UnitCounts } from '../types';
import { getAllocationBand } from './bands';
import { decideFarmerPolicy } from './farmerPolicy';
import type {
  PersonaAllocationBand,
  PersonaDecision,
  PersonaObservation,
  PersonaPolicyResult,
  PersonaStance,
  PersonaTacticalState,
  PowerBand,
} from './types';

const MAX_ATTACK_TURNS = 10;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

/** Creates the initial tactical state for a persona (alert level 0). */
export function createInitialTacticalState(
  persona: Persona,
  farmerVariant?: FarmerVariant,
): PersonaTacticalState {
  return {
    persona,
    farmerVariant: persona === 'farmer' ? farmerVariant : undefined,
    alertLevel: 0,
  };
}

/** Validates that `tactical` matches the expected persona identity. */
export function assertTacticalIdentity(
  tactical: PersonaTacticalState,
  persona: Persona,
  farmerVariant?: FarmerVariant,
): void {
  if (tactical.persona !== persona) {
    throw new SimulationConfigError(
      `Tactical state persona "${tactical.persona}" != expected "${persona}"`,
      'persona-tactical-identity-mismatch',
    );
  }
  if (
    persona === 'farmer' &&
    farmerVariant &&
    tactical.farmerVariant !== farmerVariant
  ) {
    throw new SimulationConfigError(
      `Tactical state farmerVariant "${tactical.farmerVariant ?? 'undefined'}" != expected "${farmerVariant}"`,
      'persona-tactical-variant-mismatch',
    );
  }
}

const DEFENSE_UNIT_KEYS: ReadonlyArray<keyof UnitCounts> = [
  'guard',
  'archer',
  'royalGuard',
];
const OFFENSE_UNIT_KEYS: ReadonlyArray<keyof UnitCounts> = [
  'soldier',
  'knight',
  'berserker',
];

function cheapestUnit(keys: ReadonlyArray<keyof UnitCounts>): keyof UnitCounts {
  let best: keyof UnitCounts = keys[0];
  let bestCost = Infinity;
  for (const key of keys) {
    const cost = UNIT_COSTS[key];
    if (cost < bestCost) {
      bestCost = cost;
      best = key;
    }
  }
  return best;
}

function allocateBandRecruitment(
  band: PersonaAllocationBand,
  gold: number,
  citizens: number,
): { recruitment: PersonaDecision['recruitment']; spent: number } {
  const recruitment: PersonaDecision['recruitment'] = {};
  if (gold <= 0 || citizens <= 0) {
    return { recruitment, spent: 0 };
  }
  const totalShare =
    band.workerShare +
    band.defenseShare +
    band.offenseShare +
    band.spyShare +
    band.sentryShare;
  if (totalShare <= 0) {
    return { recruitment, spent: 0 };
  }

  const defenseUnit = cheapestUnit(DEFENSE_UNIT_KEYS);
  const offenseUnit = cheapestUnit(OFFENSE_UNIT_KEYS);

  const workerBudget = (band.workerShare / totalShare) * gold;
  const defenseBudget = (band.defenseShare / totalShare) * gold;
  const offenseBudget = (band.offenseShare / totalShare) * gold;
  const spyBudget = (band.spyShare / totalShare) * gold;
  const sentryBudget = (band.sentryShare / totalShare) * gold;

  const workerQty = Math.floor(workerBudget / UNIT_COSTS.worker);
  const defenseQty = Math.floor(defenseBudget / UNIT_COSTS[defenseUnit]);
  const offenseQty = Math.floor(offenseBudget / UNIT_COSTS[offenseUnit]);
  const spyQty = Math.floor(spyBudget / UNIT_COSTS.spy);
  const sentryQty = Math.floor(sentryBudget / UNIT_COSTS.sentry);

  let remaining = citizens;
  let spent = 0;
  const place = (qty: number, key: keyof UnitCounts, cost: number): number => {
    if (qty <= 0 || remaining <= 0) return 0;
    const allowed = Math.min(qty, remaining);
    recruitment[key] = allowed;
    remaining -= allowed;
    spent += allowed * cost;
    return allowed;
  };
  place(workerQty, 'worker', UNIT_COSTS.worker);
  place(defenseQty, defenseUnit, UNIT_COSTS[defenseUnit]);
  place(offenseQty, offenseUnit, UNIT_COSTS[offenseUnit]);
  place(spyQty, 'spy', UNIT_COSTS.spy);
  place(sentryQty, 'sentry', UNIT_COSTS.sentry);

  return { recruitment, spent };
}

function stanceForPersona(persona: Persona, acting: boolean): PersonaStance {
  if (!acting) return 'inactive';
  switch (persona) {
    case 'attacker':
      return 'attacker-raiding';
    case 'defender':
      return 'defender-fortified';
    case 'spy':
      return 'spy-recon';
    case 'sentry':
      return 'sentry-lockdown';
    case 'balanced':
      return 'balanced-mixed';
    default:
      return 'inactive';
  }
}

function preferredBandFor(persona: Persona): PowerBand | 'any' {
  switch (persona) {
    case 'attacker':
      return 'weaker';
    case 'spy':
      return 'even';
    case 'balanced':
      return 'any';
    default:
      return 'any';
  }
}

/**
 * Band-driven policy for the five non-farmer personas. Allocates recruitment
 * from the identity band, derives attack-turn spend and intel count from the
 * aggression dials, and respects the repair/banking priorities. The injected
 * `rng` drives the passive-class activity gate so the same seed reproduces
 * the same action/noop choice.
 */
function decideBandPolicy(
  observation: PersonaObservation,
  tactical: PersonaTacticalState,
  rng: Rng,
): PersonaPolicyResult {
  const { self } = observation;
  const band = getAllocationBand(tactical.persona);
  const rationales: string[] = [];

  const activityRoll = rng.next();
  const activityThreshold =
    self.activityClass === 'passive'
      ? 0.4
      : self.activityClass === 'inactive'
        ? 0.05
        : 0.95;
  const acting = activityRoll < activityThreshold;
  rationales.push(
    `${self.activityClass} activity gate roll=${activityRoll.toFixed(3)} < ${activityThreshold}`,
  );

  if (!acting || self.gold <= 0) {
    return {
      decision: {
        stance: stanceForPersona(tactical.persona, false),
        recruitment: {},
        upgradeEconomy: false,
        upgradeDefense: false,
        upgradeSpy: false,
        upgradeSentry: false,
        repairFort: false,
        bankGold: 0,
        attackTurnsToSpend: 0,
        preferredTargetBand: preferredBandFor(tactical.persona),
        intelMissionsToPlan: 0,
        rationale: rationales,
      },
      nextTactical: tactical,
    };
  }

  const { recruitment, spent } = allocateBandRecruitment(
    band,
    self.gold,
    self.citizensAvailable,
  );

  const repairPressure =
    self.repairCost > 0 && self.fortMaxHp > 0
      ? clamp01(1 - self.fortHp / self.fortMaxHp)
      : 0;
  const repairFort =
    self.repairCost > 0 &&
    repairPressure * band.fortRepairPriority >= 0.35 &&
    self.gold - spent >= self.repairCost;

  const goldAfterCommit =
    self.gold - spent - (repairFort ? self.repairCost : 0);
  const bankGold = Math.floor(
    Math.max(0, goldAfterCommit) *
      clamp01(band.bankingPriority * (0.3 + self.bankExposure * 0.7)),
  );

  const availableTurns = Math.max(0, Math.min(self.attackTurns, self.stamina));
  const attackTurnsToSpend =
    tactical.persona === 'attacker' || tactical.persona === 'balanced'
      ? Math.min(
          availableTurns,
          Math.max(0, Math.round(availableTurns * band.attackAggression)),
        )
      : 0;

  const intelCapacity = Math.max(0, Math.floor(self.units.spy));
  const intelMissionsToPlan =
    intelCapacity > 0
      ? Math.min(
          intelCapacity,
          Math.max(0, Math.round(band.intelAggression * 4)),
        )
      : 0;

  const decision: PersonaDecision = {
    stance: stanceForPersona(tactical.persona, true),
    recruitment,
    upgradeEconomy:
      band.workerShare >= 0.4 &&
      self.economyLevel < 7 &&
      goldAfterCommit - bankGold > self.repairCost,
    upgradeDefense: band.defenseShare >= 0.4 && tactical.persona === 'defender',
    upgradeSpy: band.spyShare >= 0.4 && tactical.persona === 'spy',
    upgradeSentry: band.sentryShare >= 0.4 && tactical.persona === 'sentry',
    repairFort,
    bankGold,
    attackTurnsToSpend,
    preferredTargetBand: preferredBandFor(tactical.persona),
    intelMissionsToPlan,
    rationale: rationales,
  };

  return { decision, nextTactical: tactical };
}

/**
 * Dispatches a player's observation to the matching persona policy.
 *
 * Identity is taken from `tactical` (which the scenario runner keeps in a
 * parallel map); the observation's `persona`/`farmerVariant` are advisory.
 * Returns the decision plus the next tactical state. Pure and deterministic
 * given observation + tactical state + RNG state.
 */
export function decidePersonaPolicy(
  observation: PersonaObservation,
  tactical: PersonaTacticalState,
  rng: Rng,
): PersonaPolicyResult {
  if (!PERSONAS.includes(tactical.persona)) {
    throw new SimulationConfigError(
      `Unknown persona "${tactical.persona}"`,
      'persona-policy-unknown-persona',
    );
  }
  if (tactical.persona === 'farmer') {
    const variant = tactical.farmerVariant ?? 'greedy';
    return decideFarmerPolicy(observation, tactical, variant, rng);
  }
  return decideBandPolicy(observation, tactical, rng);
}

/**
 * Bridges a {@link PersonaDecision} to the legacy {@link AgentDecision} so
 * Todo 9 can apply persona-driven intents through the existing
 * `applyDecision` path. Target selection (intelMissions/attacks targets) is
 * left empty for Todo 9 + `targeting.ts` to fill, since this module must not
 * edit those files.
 *
 * `upgradeDefense` has no AgentDecision field today; it is surfaced via the
 * returned `pendingDefenseUpgrade` so Todo 9 can extend the apply path.
 */
export function personaDecisionToAgentDecision(
  decision: PersonaDecision,
  player: PlayerState,
): { agent: AgentDecision; pendingDefenseUpgrade: boolean } {
  const repairFortHp = decision.repairFort
    ? Math.max(0, player.fortMaxHp - player.fortHp)
    : undefined;

  const agent: AgentDecision = {
    intelMissions: [],
    attacks: [],
    recruitment: { ...decision.recruitment },
    upgradeSpy: decision.upgradeSpy || undefined,
    upgradeSentry: decision.upgradeSentry || undefined,
    upgradeEconomy: decision.upgradeEconomy || undefined,
    repairFort: repairFortHp,
    bankGold: decision.bankGold > 0 ? decision.bankGold : undefined,
  };

  return {
    agent,
    pendingDefenseUpgrade: decision.upgradeDefense,
  };
}

/**
 * Convenience helper returning the attack-turn spend capped at the v5 max.
 * Todo 9 uses this when issuing attacks against targets chosen by
 * `targeting.ts`.
 */
export function cappedAttackTurns(decision: PersonaDecision): number {
  return clamp(Math.floor(decision.attackTurnsToSpend), 0, MAX_ATTACK_TURNS);
}
