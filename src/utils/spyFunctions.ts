import { SpyUpgrades, UnitTypes } from '@/constants';
import type { UnitType } from '@/types/typings';
import { resolveSpyForceContest } from '@/utils/balance/effectiveStats';
import {
  calculateIntelQualityMultiplier,
  calculateSpyMissionPower,
  calculateSpyPressureProtection,
  clamp,
  V5_COMBAT_CONSTANTS,
} from '@/utils/balance/v5Combat';
import {
  buildCombatFormations,
  calculateCombatStrength,
} from '@/utils/combatStrength';

import { type RandomFn, requireRandom, shuffleWithRandom } from './random';
import {
  AssassinationResult,
  CITIZEN_WORKERS_TARGET,
  InfiltrationResult,
  IntelResult,
  type SpyIntelligence,
  type SpyMissionUser,
  type SpyRosterUnit,
  type SpyUnitLoss,
} from './spy/results';

export { CITIZEN_WORKERS_TARGET };

export type SpySimulationOptions = {
  random: RandomFn;
  debug?: boolean;
  turns?: number;
  spyPressureToday?: number;
  /** Shared daily casualty allowance left for the defender (battles + assassinations). */
  defenderDailyCasualtyRemaining?: number;
  /** Kills of the targeted unit type still allowed today across all attackers. */
  targetTypeDailyRemaining?: number;
};

function quantity(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function missionTurns(
  options: SpySimulationOptions,
  minimum: number,
  maximum: number = V5_COMBAT_CONSTANTS.MAX_SPY_MISSION_TURNS,
): number {
  return clamp(quantity(options.turns ?? minimum), minimum, maximum);
}

function missionCap(user: SpyMissionUser, tier: number): number {
  if (tier === 1) return 10;
  const spyLevel =
    user.structure_upgrades?.find((upgrade) => upgrade.type === 'SPY')?.level ??
    0;
  const upgrade = SpyUpgrades.find((entry) => entry.level === spyLevel);
  const catalogCap =
    tier === 2
      ? upgrade?.maxInfiltratorsPerMission
      : upgrade?.maxAssassinsPerMission;
  const declaredCap =
    tier === 2
      ? user.spyLimits?.infil.perMission
      : user.spyLimits?.assass.perMission;
  return quantity(catalogCap ?? declaredCap ?? 0);
}

function dispatchedCount(
  user: SpyMissionUser,
  requested: number,
  tier: number,
): number {
  const eligible = buildCombatFormations(user, 'SPY', {
    unitLevels: [tier],
  }).reduce((sum, formation) => sum + formation.quantity, 0);
  return Math.min(quantity(requested), eligible, missionCap(user, tier));
}

/**
 * Entry check (#97): the attacker's whole spy force, scaled by the turns
 * spent, against the defender's sentry force. Today's spy pressure scales the
 * real sentries and adds phantom sentry strength, so repeated missions on the
 * same target harden it (and a sentry-less target is not free forever).
 * The dispatched squad still decides losses and how much is achieved.
 */
function entry(
  user: SpyMissionUser,
  defender: SpyMissionUser,
  sent: number,
  _tier: number,
  turns: number,
  _modifier: number,
  options: SpySimulationOptions,
) {
  const network =
    sent > 0
      ? calculateCombatStrength(user, 'SPY').totalStats.MeleeAtkPower
      : 0;
  const spy = network * calculateSpyMissionPower(turns);
  const sentry = calculateCombatStrength(defender, 'SENTRY').totalStats
    .MeleeDefPower;
  const pressure = Math.max(
    0,
    Number(options.spyPressureToday ?? defender.spyPressureToday ?? 0) || 0,
  );
  const protection = calculateSpyPressureProtection(pressure);
  const adjustedSentry =
    Math.max(1, sentry / Math.max(0.35, protection)) +
    pressure * V5_COMBAT_CONSTANTS.SPY_PRESSURE_PHANTOM_SENTRY_PER_TURN;
  return {
    ...resolveSpyForceContest({
      attackerSpy: spy,
      defenderSentry: adjustedSentry,
    }),
    ratio: spy / adjustedSentry,
  };
}

/** One decrementing budget across regular and mercenary rows; reports actual removals. */
function removeUnits(
  user: SpyMissionUser,
  budget: number,
  matches: (unit: SpyRosterUnit) => boolean,
): SpyUnitLoss[] {
  let remaining = quantity(budget);
  const losses: SpyUnitLoss[] = [];
  for (const mercenary of [false, true]) {
    for (const [units, fromMercenaryRoster] of [
      [user.units, false],
      [user.mercenaries ?? [], true],
    ] as const) {
      for (const unit of units) {
        if (!remaining) return losses;
        if (
          (fromMercenaryRoster || unit.isMercenary === true) !== mercenary ||
          !matches(unit)
        )
          continue;
        const removed = Math.min(quantity(unit.quantity), remaining);
        if (!removed) continue;
        unit.quantity -= removed;
        remaining -= removed;
        losses.push({
          ...(unit.forceContractId
            ? { forceContractId: unit.forceContractId }
            : {}),
          type: unit.type,
          level: unit.level,
          quantity: removed,
          mercenary,
        });
      }
    }
  }
  return losses;
}

function lossCount(losses: SpyUnitLoss[]): number {
  return losses.reduce((sum, loss) => sum + loss.quantity, 0);
}

/** Successful entry can still lose dispatched agents; risk decreases smoothly with capability. */
function successfulEntryLosses(
  sent: number,
  ratio: number,
  random: RandomFn,
): number {
  const risk = Math.max(0, 1 - ratio);
  let losses = 0;
  for (let index = 0; index < sent; index += 1) {
    if (random() < risk) losses += 1;
  }
  return losses;
}

function snapshotIntel(
  defender: SpyMissionUser,
  percentage: number,
  random: RandomFn,
): SpyIntelligence {
  const source: SpyIntelligence = {
    offense: calculateCombatStrength(defender, 'OFFENSE').totalStats
      .MeleeAtkPower,
    defense: calculateCombatStrength(defender, 'DEFENSE').totalStats
      .MeleeDefPower,
    spyOffense: calculateCombatStrength(defender, 'SPY').totalStats
      .MeleeAtkPower,
    spyDefense: calculateCombatStrength(defender, 'SENTRY').totalStats
      .MeleeDefPower,
    units: defender.units.map((unit) => ({ ...unit })),
    mercenaries: (defender.mercenaries ?? []).map((unit) => ({ ...unit })),
    items: defender.items.map((item) => ({ ...item })),
    fortLevel: defender.fortLevel ?? null,
    fortHitpoints: defender.fortHitpoints ?? null,
    defenseBonus: defender.defenseBonus ?? 0,
    spyLevel:
      defender.structure_upgrades?.find((upgrade) => upgrade.type === 'SPY')
        ?.level ?? null,
    sentryLevel:
      defender.structure_upgrades?.find((upgrade) => upgrade.type === 'SENTRY')
        ?.level ?? null,
    gold: defender.gold ?? null,
    goldInBank: defender.goldInBank ?? null,
  };
  const gathered: SpyIntelligence = {
    offense: null,
    defense: null,
    spyOffense: null,
    spyDefense: null,
    units: null,
    mercenaries: null,
    items: null,
    fortLevel: null,
    fortHitpoints: null,
    gold: null,
    goldInBank: null,
    defenseBonus: null,
    spyLevel: null,
    sentryLevel: null,
  };
  const keys = Object.keys(source) as (keyof SpyIntelligence)[];
  const selected = shuffleWithRandom(keys, random).slice(
    0,
    Math.floor((keys.length * percentage) / 100),
  );
  for (const key of selected) {
    if (key === 'units' || key === 'mercenaries') {
      const units = source[key] ?? [];
      gathered[key] = shuffleWithRandom(units, random).slice(
        0,
        Math.floor((units.length * percentage) / 100),
      );
    } else if (key === 'items') {
      const items = source.items ?? [];
      gathered.items = shuffleWithRandom(items, random).slice(
        0,
        Math.floor((items.length * percentage) / 100),
      );
    } else if (key === 'gold' || key === 'goldInBank') {
      gathered[key] = source[key];
    } else {
      gathered[key] = source[key];
    }
  }
  return gathered;
}

export function simulateIntel(
  attacker: SpyMissionUser,
  defender: SpyMissionUser,
  spies: number,
  options: SpySimulationOptions,
): IntelResult {
  const random = requireRandom(options?.random);
  const turns = missionTurns(options, 1, V5_COMBAT_CONSTANTS.MAX_INTEL_TURNS);
  const sent = dispatchedCount(attacker, spies, 1);
  const result = new IntelResult(sent, attacker.level, defender.level);
  result.turns = turns;
  const resolution = entry(attacker, defender, sent, 1, turns, 0.2, options);
  result.success = resolution.success;
  result.successProbability = resolution.probability;
  const losses = result.success
    ? successfulEntryLosses(sent, resolution.ratio, random)
    : sent;
  result.spyLosses = removeUnits(
    attacker,
    losses,
    (unit) => unit.type === 'SPY' && unit.level === 1,
  );
  result.spiesLost = lossCount(result.spyLosses);
  result.intelPercentage = Math.min(
    100,
    (sent - result.spiesLost) * 10 * calculateIntelQualityMultiplier(turns),
  );
  if (result.success && result.intelPercentage > 0) {
    result.intelligenceGathered = snapshotIntel(
      defender,
      result.intelPercentage,
      random,
    );
  }
  return result;
}

export function simulateAssassination(
  attacker: SpyMissionUser,
  defender: SpyMissionUser,
  spies: number,
  target: UnitType | typeof CITIZEN_WORKERS_TARGET,
  options: SpySimulationOptions,
): AssassinationResult {
  const random = requireRandom(options?.random);
  const turns = missionTurns(
    options,
    V5_COMBAT_CONSTANTS.MIN_ASSASSINATION_TURNS,
  );
  const sent = dispatchedCount(attacker, spies, 3);
  const result = new AssassinationResult(attacker, defender, sent, target);
  result.turns = turns;
  const resolution = entry(attacker, defender, sent, 3, turns, -0.2, options);
  result.success = resolution.success;
  result.successProbability = resolution.probability;
  if (sent === 0) return result;
  const failedLossShare = Math.min(
    1,
    Math.max(0, 1 - resolution.ratio) * 0.6 +
      0.4 +
      (turns / V5_COMBAT_CONSTANTS.MAX_SPY_MISSION_TURNS) * 0.15,
  );
  const losses = result.success
    ? successfulEntryLosses(sent, resolution.ratio, random)
    : Math.min(
        sent,
        Math.ceil(sent * failedLossShare * (0.9 + random() * 0.2)),
      );
  result.spyLosses = removeUnits(
    attacker,
    losses,
    (unit) => unit.type === 'SPY' && unit.level === 3,
  );
  result.spiesLost = lossCount(result.spyLosses);
  const survivors = sent - result.spiesLost;
  if (!result.success || survivors === 0) return result;

  const attack =
    calculateCombatStrength(attacker, 'SPY', {
      unitLevels: [3],
      limit: survivors,
    }).totalStats.MeleeAtkPower * calculateSpyMissionPower(turns);
  const targetTypes: UnitType[] =
    target === CITIZEN_WORKERS_TARGET ? ['CITIZEN', 'WORKER'] : [target];
  let defense = 0;
  let targetQuantity = 0;
  let hitpoints = 0;
  for (const type of targetTypes) {
    defense += calculateCombatStrength(defender, type).totalStats.MeleeDefPower;
    for (const formation of buildCombatFormations(defender, type)) {
      targetQuantity += formation.quantity;
      hitpoints += formation.maxHP * formation.quantity;
    }
  }
  if (attack <= 0 || targetQuantity === 0 || hitpoints <= 0) return result;
  const penetration = attack / (attack + defense);
  const damageKills = Math.floor(
    (attack * penetration) / (hitpoints / targetQuantity),
  );
  const population = [
    ...defender.units,
    ...(defender.mercenaries ?? []),
  ].reduce((sum, unit) => sum + quantity(unit.quantity), 0);
  const capShare =
    0.01 + (turns / V5_COMBAT_CONSTANTS.MAX_SPY_MISSION_TURNS) ** 1.1 * 0.03;
  const dailyRemaining = Number.isFinite(options.defenderDailyCasualtyRemaining)
    ? quantity(options.defenderDailyCasualtyRemaining as number)
    : Number.POSITIVE_INFINITY;
  const typeRemaining = Number.isFinite(options.targetTypeDailyRemaining)
    ? quantity(options.targetTypeDailyRemaining as number)
    : Number.POSITIVE_INFINITY;
  const budget = Math.min(
    damageKills,
    targetQuantity,
    Math.floor(population * capShare),
    dailyRemaining,
    typeRemaining,
  );
  result.targetLosses = removeUnits(
    defender,
    budget,
    (unit) =>
      targetTypes.includes(unit.type) &&
      UnitTypes.some(
        (entry) =>
          entry.type === unit.type &&
          entry.level === unit.level &&
          (entry.fortLevel <= (defender.fortLevel ?? Infinity) ||
            unit.type === 'CITIZEN' ||
            unit.type === 'WORKER'),
      ),
  );
  result.unitsKilled = lossCount(result.targetLosses);
  return result;
}

export function simulateInfiltration(
  attacker: SpyMissionUser,
  defender: SpyMissionUser,
  spies: number,
  options: SpySimulationOptions,
): InfiltrationResult {
  const random = requireRandom(options?.random);
  const turns = missionTurns(
    options,
    V5_COMBAT_CONSTANTS.MIN_INFILTRATION_TURNS,
  );
  const sent = dispatchedCount(attacker, spies, 2);
  const result = new InfiltrationResult(sent, attacker.level, defender.level);
  result.turns = turns;
  const resolution = entry(attacker, defender, sent, 2, turns, 0, options);
  result.success = resolution.success;
  result.successProbability = resolution.probability;
  const losses = result.success
    ? successfulEntryLosses(sent, resolution.ratio, random)
    : sent;
  result.spyLosses = removeUnits(
    attacker,
    losses,
    (unit) => unit.type === 'SPY' && unit.level === 2,
  );
  result.spiesLost = lossCount(result.spyLosses);
  const survivors = sent - result.spiesLost;
  const startHP = quantity(defender.fortHitpoints ?? 0);
  if (!result.success || survivors === 0 || startHP === 0) return result;
  const force =
    calculateCombatStrength(attacker, 'SPY', {
      unitLevels: [2],
      limit: survivors,
    }).totalStats.MeleeAtkPower * calculateSpyMissionPower(turns);
  // Both saturating factors are monotone; commitment increases force and the cap.
  // A single shared damage roll never turns a stronger/longer mission into less damage.
  const capShare = Math.min(0.12, 0.025 + turns * 0.0095);
  const ratioShare = resolution.ratio / (1 + resolution.ratio);
  const forceShare = force / (force + 50);
  result.fortDmg = Math.floor(
    startHP * capShare * ratioShare * forceShare * (0.9 + random() * 0.1),
  );
  defender.fortHitpoints = startHP - result.fortDmg;
  return result;
}
