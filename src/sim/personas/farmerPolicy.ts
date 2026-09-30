/**
 * Farmer risk-response policies (plan Todo 5).
 *
 * Three Farmer variants share a common worker-investment engine that weighs
 * every required factor: expected remaining ticks, observed loot, worker and
 * assassination losses, repair cost, coverage, bank exposure, incoming
 * attackers, and alliance threat.
 *
 *   - greedy:    high worker appetite with a minimum floor; only reacts
 *                (raises defense/sentry/repair, trims workers) after a fort
 *                breach or a major worker loss.
 *   - cautious:  defense/sentry/repair/banking first; workers only from the
 *                surplus left after protection is satisfied.
 *   - adaptive:  greedy baseline that interpolates toward cautious as its
 *                alert level rises; alert rises after two attacks in 7d, any
 *                worker assassination, a fort breach, or a 7d wealth surge
 *                (loot+income) beyond 20%, and relaxes one step after 30
 *                consecutive quiet days.
 *
 * Identity stays "farmer" regardless of variant or alert level; only tactics
 * move. All functions are pure and deterministic given their inputs.
 */

import { SimulationConfigError } from '../invariants';
import { UNIT_COSTS } from '../population';
import type { Rng } from '../random';
import type { FarmerVariant } from '../scenarioTypes';
import type {
  PersonaAllocationBand,
  PersonaDecision,
  PersonaObservation,
  PersonaPolicyResult,
  PersonaSelfObservation,
  PersonaStance,
  PersonaTacticalState,
} from './types';

const WORKER_COST = UNIT_COSTS.worker;
const GUARD_COST = UNIT_COSTS.guard;
const SENTRY_COST = UNIT_COSTS.sentry;
const MAX_ALERT_LEVEL = 3;
const RELAX_QUIET_DAYS = 30;
const WEALTH_SURGE_THRESHOLD = 0.2;
const EMPTY_DECISION_RECRUIT = {};

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

/**
 * Threat pressure in [0, 1] blending every public/own-memory danger signal.
 * Higher pressure pushes the Farmer toward defense/sentry/repair/banking and
 * away from worker investment.
 */
function computeThreatPressure(self: PersonaSelfObservation): number {
  const attackPressure = clamp01(self.attacksSuffered7d / 4);
  const incomingPressure = clamp01(self.incomingAttackersLast7d / 6);
  const breachPressure = self.fortBreachedLast7d ? 1 : 0;
  const assassinationPressure = clamp01(self.workersAssassinated7d / 10);
  const alliancePressure = clamp01(self.allianceThreatLevel);
  return clamp01(
    Math.max(
      attackPressure,
      incomingPressure * 0.8,
      breachPressure,
      assassinationPressure * 0.9,
      alliancePressure,
    ),
  );
}

/** Worker-loss pressure in [0, 1] from recent worker casualties. */
function computeWorkerLossPressure(self: PersonaSelfObservation): number {
  const recentLoss = self.workersLostLastDay + self.workersAssassinatedLastDay;
  const base = self.units.worker > 0 ? recentLoss / self.units.worker : 0;
  return clamp01(Math.max(base, self.workersAssassinated7d / 12));
}

/**
 * Worker-investment horizon viability in [0, 1]. A worker recoups its 2000g
 * cost after `WORKER_COST / goldPerWorkerPerTurn` productive turns; if the
 * expected remaining ticks cannot cover that, viability falls toward 0.
 */
function computeHorizonViability(self: PersonaSelfObservation): number {
  if (self.goldPerWorkerPerTurn <= 0) return 0;
  const paybackTicks = WORKER_COST / self.goldPerWorkerPerTurn;
  if (self.expectedRemainingTicks <= 0) return 0;
  const coverage = self.expectedRemainingTicks / paybackTicks;
  if (coverage >= 1) return 1;
  return clamp01(coverage);
}

/** Profitability pull in [0, 1] from observed loot and recent income. */
function computeProfitabilityPull(self: PersonaSelfObservation): number {
  const lootPull = clamp01(Math.log10(self.loot7d + 1) / 6);
  const incomePull = clamp01(Math.log10(self.income7d + 1) / 6);
  return clamp01(Math.max(lootPull * 0.6, incomePull));
}

/**
 * Whether the adaptive Farmer's wealth-surge trigger is active: 7d loot+income
 * growth indicates the Farmer has accumulated enough to become a target.
 * Compared against the prior 7d baseline using the `>20%` threshold.
 */
export function isWealthSurgeActive(self: PersonaSelfObservation): boolean {
  const recent = self.loot7d + self.income7d;
  const priorBaseline = Math.max(
    self.income7d - self.incomeLastDay,
    self.loot7d - self.lootGainedLastDay,
    1,
  );
  if (priorBaseline <= 0) return recent > 0;
  return recent / priorBaseline - 1 > WEALTH_SURGE_THRESHOLD;
}

/**
 * Counts the distinct active threat categories driving an adaptive raise.
 * Used to set a sticky alert floor (1..3): more concurrent threats -> higher
 * floor, capped at {@link MAX_ALERT_LEVEL}.
 */
export function countActiveThreatCategories(
  self: PersonaSelfObservation,
): number {
  let count = 0;
  if (self.attacksSuffered7d >= 2) count += 1;
  if (self.workersAssassinated7d > 0) count += 1;
  if (self.fortBreachedLast7d) count += 1;
  if (isWealthSurgeActive(self)) count += 1;
  return count;
}

/**
 * Updates the adaptive Farmer's alert level from the current observation.
 * Raise triggers set a sticky floor; 30 quiet days relax one step. Pure.
 */
export function updateAdaptiveAlert(
  tactical: PersonaTacticalState,
  self: PersonaSelfObservation,
): number {
  const threatCount = countActiveThreatCategories(self);
  const raiseFloor =
    threatCount > 0 ? clamp(threatCount, 1, MAX_ALERT_LEVEL) : 0;
  const raised = Math.max(tactical.alertLevel, raiseFloor);
  const quietLongEnough = self.daysSinceLastThreat >= RELAX_QUIET_DAYS;
  if (raiseFloor > 0) return raised;
  if (quietLongEnough) return clamp(raised - 1, 0, MAX_ALERT_LEVEL);
  return raised;
}

/** Greedy baseline worker appetite before reactions. */
const GREEDY_WORKER_APPETITE = 0.85;
/** Cautious baseline worker appetite before reactions. */
const CAUTIOUS_WORKER_APPETITE = 0.25;
/** Minimum workers a greedy Farmer trains per tick when affordable. */
const GREEDY_MIN_WORKER_FLOOR = 5;
/** Worker loss fraction that flips greedy into its reactive posture. */
const GREEDY_MAJOR_LOSS_FRACTION = 0.2;

function stanceForAlert(alertLevel: number): PersonaStance {
  if (alertLevel <= 0) return 'farmer-adaptive-relaxed';
  if (alertLevel === 1) return 'farmer-adaptive-raised';
  return 'farmer-adaptive-fortified';
}

function decideFarmerRecruitment(
  self: PersonaSelfObservation,
  effectiveBand: PersonaAllocationBand,
  workerAppetite: number,
  rationales: string[],
): PersonaDecision['recruitment'] {
  if (self.citizensAvailable <= 0 || self.gold <= 0) {
    return { ...EMPTY_DECISION_RECRUIT };
  }

  const threatPressure = computeThreatPressure(self);
  const lossPressure = computeWorkerLossPressure(self);
  const horizonViability = computeHorizonViability(self);
  const profitability = computeProfitabilityPull(self);
  const repairPressure = clamp01(
    self.gold > 0 ? self.repairCost / self.gold : 0,
  );
  const coverageGap = clamp01(1 - self.coverageFraction);

  const protectionDemand = clamp01(
    Math.max(
      threatPressure,
      lossPressure * 0.85,
      repairPressure * 0.6,
      coverageGap * 0.5,
    ),
  );

  const workerPull = clamp01(
    workerAppetite * horizonViability * (0.5 + profitability * 0.5),
  );

  const workerWeight =
    effectiveBand.workerShare * (1 - protectionDemand) + workerPull;
  const defenseWeight = effectiveBand.defenseShare * (0.4 + protectionDemand);
  const sentryWeight =
    effectiveBand.sentryShare *
    (0.4 + Math.max(protectionDemand, lossPressure));
  const totalWeight = Math.max(1, workerWeight + defenseWeight + sentryWeight);

  const spendableGold = self.gold;
  const workerBudget = (workerWeight / totalWeight) * spendableGold;
  const defenseBudget = (defenseWeight / totalWeight) * spendableGold;
  const sentryBudget = (sentryWeight / totalWeight) * spendableGold;

  const workerQtyRaw = Math.floor(workerBudget / WORKER_COST);
  const guardQty = Math.floor(defenseBudget / GUARD_COST);
  const sentryQty = Math.floor(sentryBudget / SENTRY_COST);

  // Workers are the recurring-income engine, but scarce citizens must retain
  // the policy's intended worker/standing-defense proportions. The previous
  // implementation trimmed workers alone, starving the economy whenever a
  // defense target was also affordable.
  const desiredTotal = workerQtyRaw + guardQty + sentryQty;
  const citizenScale = Math.min(
    1,
    self.citizensAvailable / Math.max(1, desiredTotal),
  );
  const workerQty = Math.floor(workerQtyRaw * citizenScale);
  const guard = Math.floor(guardQty * citizenScale);
  const sentry = Math.min(
    self.citizensAvailable - workerQty - guard,
    Math.floor(sentryQty * citizenScale),
  );

  if (threatPressure > 0.6) {
    rationales.push(
      `threat pressure ${threatPressure.toFixed(2)} -> favor defense/sentry`,
    );
  }
  if (lossPressure > 0.4) {
    rationales.push(
      `worker loss pressure ${lossPressure.toFixed(2)} -> raise sentry`,
    );
  }
  if (horizonViability < 0.5) {
    rationales.push(
      `horizon viability ${horizonViability.toFixed(2)} -> trim workers`,
    );
  }
  if (self.bankExposure > 0.6) {
    rationales.push(
      `bank exposure ${self.bankExposure.toFixed(2)} -> bank surplus`,
    );
  }
  if (self.repairCost > 0 && repairPressure > 0.3) {
    rationales.push(
      `repair pressure ${repairPressure.toFixed(2)} -> repair fort`,
    );
  }
  if (coverageGap > 0.4) {
    rationales.push(
      `coverage gap ${coverageGap.toFixed(2)} -> train defenders`,
    );
  }

  const recruitment: PersonaDecision['recruitment'] = {};
  if (workerQty > 0) recruitment.worker = workerQty;
  if (guard > 0) recruitment.guard = guard;
  if (sentry > 0) recruitment.sentry = sentry;
  return recruitment;
}

function decideFarmerBankAndRepair(
  self: PersonaSelfObservation,
  effectiveBand: PersonaAllocationBand,
  recruitment: PersonaDecision['recruitment'],
  rationales: string[],
): { bankGold: number; repairFort: boolean; upgradeEconomy: boolean } {
  const recruitmentCost =
    (recruitment.worker ?? 0) * WORKER_COST +
    (recruitment.guard ?? 0) * GUARD_COST +
    (recruitment.sentry ?? 0) * SENTRY_COST;

  const threatPressure = computeThreatPressure(self);
  const fortDamageFraction =
    self.fortMaxHp > 0 ? clamp01(1 - self.fortHp / self.fortMaxHp) : 0;
  const repairDemand = clamp01(
    Math.max(fortDamageFraction, threatPressure * 0.5) *
      effectiveBand.fortRepairPriority,
  );
  const repairFort =
    self.repairCost > 0 &&
    self.fortHp < self.fortMaxHp &&
    repairDemand >= 0.35 &&
    self.gold - recruitmentCost >= self.repairCost;

  const goldAfterRecruitAndRepair =
    self.gold - recruitmentCost - (repairFort ? self.repairCost : 0);
  const bankCeiling = Math.max(0, goldAfterRecruitAndRepair);
  const exposurePressure = clamp01(self.bankExposure);
  const bankAppetite = clamp01(
    effectiveBand.bankingPriority * (0.4 + exposurePressure * 0.6),
  );
  const bankGold = Math.floor(bankCeiling * bankAppetite);

  if (bankGold > 0) {
    rationales.push(
      `bank ${bankGold} (exposure ${self.bankExposure.toFixed(2)})`,
    );
  }
  if (repairFort) {
    rationales.push(`repair fort for ${self.repairCost}`);
  }

  const economyUpgradeCost = self.economyLevel < 7 ? 1 : Infinity;
  const upgradeEconomy =
    economyUpgradeCost !== Infinity &&
    threatPressure < 0.5 &&
    exposurePressure < 0.7 &&
    effectiveBand.workerShare >= 0.3 &&
    goldAfterRecruitAndRepair - bankGold > 0;

  return { bankGold, repairFort, upgradeEconomy };
}

/**
 * Farmer policy entry point. Selects the variant posture, computes the
 * effective allocation band (adaptive interpolates by alert level), then
 * derives recruitment / repair / banking / upgrade intents. Returns the
 * decision and the next tactical state (alert level updated for adaptive).
 */
export function decideFarmerPolicy(
  observation: PersonaObservation,
  tactical: PersonaTacticalState,
  variant: FarmerVariant,
  _rng: Rng,
): PersonaPolicyResult {
  if (tactical.persona !== 'farmer') {
    throw new SimulationConfigError(
      `decideFarmerPolicy requires persona "farmer"; received "${tactical.persona}"`,
      'farmer-policy-persona-mismatch',
    );
  }
  const { self } = observation;
  const rationales: string[] = [];
  const farmerBand: PersonaAllocationBand = {
    persona: 'farmer',
    workerShare: 0.55,
    defenseShare: 0.2,
    offenseShare: 0.05,
    spyShare: 0.05,
    sentryShare: 0.15,
    fortRepairPriority: 0.55,
    bankingPriority: 0.85,
    attackAggression: 0.05,
    intelAggression: 0.1,
  };
  const cautiousBand: PersonaAllocationBand = {
    persona: 'farmer',
    workerShare: 0.2,
    defenseShare: 0.35,
    offenseShare: 0.05,
    spyShare: 0.05,
    sentryShare: 0.35,
    fortRepairPriority: 0.95,
    bankingPriority: 0.95,
    attackAggression: 0.02,
    intelAggression: 0.05,
  };

  let stance: PersonaStance;
  let effectiveBand: PersonaAllocationBand;
  let workerAppetite: number;
  let nextAlert = tactical.alertLevel;
  let minWorkerFloor = 0;

  const threatPressure = computeThreatPressure(self);
  const lossPressure = computeWorkerLossPressure(self);

  if (variant === 'greedy') {
    const majorLoss =
      lossPressure >= GREEDY_MAJOR_LOSS_FRACTION ||
      self.fortBreachedLast7d ||
      self.units.worker > 0
        ? (self.workersLostLastDay + self.workersAssassinatedLastDay) /
            Math.max(1, self.units.worker) >=
          GREEDY_MAJOR_LOSS_FRACTION
        : false;
    stance =
      majorLoss || self.fortBreachedLast7d
        ? 'farmer-greedy-reactive'
        : 'farmer-greedy-harvest';
    effectiveBand =
      majorLoss || self.fortBreachedLast7d ? cautiousBand : farmerBand;
    workerAppetite =
      majorLoss || self.fortBreachedLast7d
        ? CAUTIOUS_WORKER_APPETITE
        : GREEDY_WORKER_APPETITE;
    minWorkerFloor =
      majorLoss || self.fortBreachedLast7d ? 0 : GREEDY_MIN_WORKER_FLOOR;
    rationales.push(
      majorLoss || self.fortBreachedLast7d
        ? 'greedy reactive posture after breach/major loss'
        : 'greedy harvest posture',
    );
  } else if (variant === 'cautious') {
    stance = 'farmer-cautious-turtle';
    effectiveBand = cautiousBand;
    workerAppetite = CAUTIOUS_WORKER_APPETITE;
    rationales.push('cautious posture: defense/sentry/repair first');
  } else {
    nextAlert = updateAdaptiveAlert(tactical, self);
    stance = stanceForAlert(nextAlert);
    const t = nextAlert / MAX_ALERT_LEVEL;
    effectiveBand = mixBand(farmerBand, cautiousBand, t);
    workerAppetite =
      GREEDY_WORKER_APPETITE +
      (CAUTIOUS_WORKER_APPETITE - GREEDY_WORKER_APPETITE) * t;
    rationales.push(
      `adaptive posture alert=${nextAlert} (threat=${threatPressure.toFixed(2)})`,
    );
  }

  const recruitment = decideFarmerRecruitment(
    self,
    effectiveBand,
    workerAppetite,
    rationales,
  );

  if (
    minWorkerFloor > 0 &&
    (recruitment.worker ?? 0) < minWorkerFloor &&
    self.citizensAvailable >= minWorkerFloor &&
    self.gold >= minWorkerFloor * WORKER_COST
  ) {
    recruitment.worker = minWorkerFloor;
    rationales.push(`greedy minimum worker floor ${minWorkerFloor}`);
  }

  const { bankGold, repairFort, upgradeEconomy } = decideFarmerBankAndRepair(
    self,
    effectiveBand,
    recruitment,
    rationales,
  );

  const decision: PersonaDecision = {
    stance,
    recruitment,
    upgradeEconomy,
    upgradeDefense: false,
    upgradeSpy: false,
    upgradeSentry:
      variant === 'cautious' ||
      lossPressure > 0.4 ||
      (variant === 'adaptive' && nextAlert >= 2),
    repairFort,
    bankGold,
    attackTurnsToSpend: 0,
    preferredTargetBand: 'any',
    intelMissionsToPlan: 0,
    rationale: rationales,
  };

  return {
    decision,
    nextTactical: { ...tactical, alertLevel: nextAlert },
  };
}

function mixBand(
  greedy: PersonaAllocationBand,
  cautious: PersonaAllocationBand,
  t: number,
): PersonaAllocationBand {
  const clamped = clamp01(t);
  const lerp = (a: number, b: number): number => a + (b - a) * clamped;
  return {
    persona: greedy.persona,
    workerShare: lerp(greedy.workerShare, cautious.workerShare),
    defenseShare: lerp(greedy.defenseShare, cautious.defenseShare),
    offenseShare: lerp(greedy.offenseShare, cautious.offenseShare),
    spyShare: lerp(greedy.spyShare, cautious.spyShare),
    sentryShare: lerp(greedy.sentryShare, cautious.sentryShare),
    fortRepairPriority: lerp(
      greedy.fortRepairPriority,
      cautious.fortRepairPriority,
    ),
    bankingPriority: lerp(greedy.bankingPriority, cautious.bankingPriority),
    attackAggression: lerp(greedy.attackAggression, cautious.attackAggression),
    intelAggression: lerp(greedy.intelAggression, cautious.intelAggression),
  };
}
