import { Fortifications, ItemTypes, UnitTypes } from '@/constants';
import { SpyUserModel } from '@/models/SpyUser';
import type { Item, ItemType, PlayerUnit, UnitType } from '@/types/typings';
import {
  isBalanceV2EnabledForUser,
  resolveSpyMissionSuccess,
} from '@/utils/balance/effectiveStats';
import {
  calculateIntelQualityMultiplier,
  calculateSpyMissionDamageFactor,
  calculateSpyMissionPower,
  calculateSpyPressureProtection,
  clamp,
  getRaceIdentity,
  V5_COMBAT_CONSTANTS,
} from '@/utils/balance/v5Combat';

import { logDebug } from './logger';
import mtRand from './mtrand';
import { type RandomFn, shuffleWithRandom } from './random';
import type { SpyMissionUser } from './spy/results';
import {
  AssassinationResult,
  CITIZEN_WORKERS_TARGET,
  InfiltrationResult,
  IntelResult,
} from './spy/results';
import { getAverageLevelAndHP } from './units';

export function computeSpyAmpFactor(targetPop: number): number {
  let ampFactor = 0.4;

  if (targetPop <= 1) {
    ampFactor *= 0.75;
  } else if (targetPop <= 3) {
    ampFactor *= 0.95;
  } else if (targetPop <= 5) {
    ampFactor *= 1.2;
  } else if (targetPop <= 7) {
    ampFactor *= 1.35;
  } else if (targetPop <= 9) {
    ampFactor *= 1.5;
  } else if (targetPop <= 10) {
    ampFactor *= 1.6;
  }

  return ampFactor;
}
export { CITIZEN_WORKERS_TARGET };

export type SpySimulationOptions = {
  random?: RandomFn;
  debug?: boolean;
  turns?: number;
  spyPressureToday?: number;
};

function getMissionTurns(
  options?: SpySimulationOptions,
  defaultTurns = 1,
): number {
  return clamp(
    Math.floor(Number(options?.turns ?? defaultTurns) || defaultTurns),
    1,
    V5_COMBAT_CONSTANTS.MAX_SPY_MISSION_TURNS,
  );
}

function getPressureAdjustedSentry(
  defender: SpyMissionUser,
  options?: SpySimulationOptions,
): number {
  const pressure =
    options?.spyPressureToday ?? (defender as any)?.spyPressureToday ?? 0;
  const protection = calculateSpyPressureProtection(pressure);
  return Math.max(1, defender.sentry / Math.max(0.35, protection));
}

export function simulateIntel(
  attacker: SpyMissionUser,
  defender: SpyMissionUser,
  spies: number,
  options?: SpySimulationOptions,
): any {
  const random = options?.random ?? Math.random;
  const turns = clamp(
    getMissionTurns(options),
    1,
    V5_COMBAT_CONSTANTS.MAX_INTEL_TURNS,
  );
  const missionPower = calculateSpyMissionPower(turns);
  const effectiveAttackerSpy = attacker.spy * missionPower;
  const effectiveDefenderSentry = getPressureAdjustedSentry(defender, options);
  spies = Math.max(1, Math.min(spies, 10));

  const fortification = Fortifications.find(
    (fort) => fort.level === defender.fortLevel,
  );
  if (!fortification) {
    return {
      status: 'failed',
      message: 'Fortification not found',
      defender: defender.fortLevel,
    };
  }
  if (options?.debug !== false) {
    logDebug('simulateIntel debug', {
      attackerSpy: attacker.spy,
      defenderSentry: defender.sentry,
    });
  }
  const v2Enabled = isBalanceV2EnabledForUser(attacker.id);
  const missionResolution = v2Enabled
    ? resolveSpyMissionSuccess({
        attackerSpy: effectiveAttackerSpy,
        defenderSentry: effectiveDefenderSentry,
        random,
        situationalModifier: 0.2, // Intel should be the easiest spy mission.
      })
    : {
        success: effectiveAttackerSpy > effectiveDefenderSentry,
        probability: undefined,
      };
  const isSuccessful = missionResolution.success;

  const result = new IntelResult(attacker, defender, spies);
  (result as any).turns = turns;
  result.success = isSuccessful;
  (result as any).successProbability = missionResolution.probability;
  (result as any).probabilityModel = v2Enabled ? 'LOGISTIC_V2' : 'BINARY_V1';
  result.spiesLost = isSuccessful ? 0 : spies;
  if (isSuccessful) {
    // Proceed with gathering intelligence
    const deathRiskFactor = Math.max(
      0,
      1 - effectiveAttackerSpy / effectiveDefenderSentry,
    );
    let spiesLost = 0;
    for (let i = 0; i < spies; i++) {
      if (random() < deathRiskFactor) {
        spiesLost++;
      }
    }
    const intelPercentage = Math.min(
      (spies - spiesLost) * 10 * calculateIntelQualityMultiplier(turns),
      100,
    );
    const intelKeys = Object.keys(
      new SpyUserModel(defender as any, (spies - spiesLost) * 10),
    );
    const selectedKeysCount = Math.ceil(
      (intelKeys.length * intelPercentage) / 100,
    );
    const randomizedKeys = shuffleWithRandom(intelKeys, random).slice(
      0,
      selectedKeysCount,
    );

    result.intelligenceGathered = randomizedKeys.reduce((partialIntel, key) => {
      const initPartialIntel = partialIntel ?? {
        offense: 0,
        defense: 0,
        spyDefense: 0,
        spyOffense: 0,
        units: null,
        items: null,
        fortLevel: null,
        fortHitpoints: null,
        goldInBank: null,
      };

      if (key === 'units' || key === 'items') {
        const sourceArr = (defender as any)[key] ?? [];
        const totalTypes = Array.isArray(sourceArr) ? sourceArr.length : 0;
        const typesToInclude = Math.floor((totalTypes * intelPercentage) / 100);
        if (key === 'units') {
          initPartialIntel[key] = shuffleWithRandom(
            sourceArr as any[],
            random,
          ).slice(0, typesToInclude) as PlayerUnit[];
        } else {
          initPartialIntel[key] = shuffleWithRandom(
            sourceArr as any[],
            random,
          ).slice(0, typesToInclude) as Item[];
        }
      } else {
        initPartialIntel[key] = (defender as any)[key];
      }
      return initPartialIntel;
    }, result.intelligenceGathered);
  } else {
    attacker.units
      .filter((u) => u.type === 'SPY' && u.level === 1)
      .forEach((u) => (u.quantity -= spies));
  }
  return result;
}

export const simulateAssassination = (
  attacker: SpyMissionUser,
  defender: SpyMissionUser,
  spiesSent: number,
  targetUnit: UnitType | typeof CITIZEN_WORKERS_TARGET,
  options?: SpySimulationOptions,
) => {
  const random = options?.random ?? Math.random;
  const turns = getMissionTurns(
    options,
    V5_COMBAT_CONSTANTS.MIN_ASSASSINATION_TURNS,
  );
  const missionPower = calculateSpyMissionPower(turns);
  const assassinationCapShare =
    0.01 + (turns / V5_COMBAT_CONSTANTS.MAX_SPY_MISSION_TURNS) ** 1.1 * 0.03;
  const effectiveAttackerSpy = attacker.spy * missionPower;
  const effectiveDefenderSentry = getPressureAdjustedSentry(defender, options);
  const result = new AssassinationResult(
    attacker,
    defender,
    spiesSent,
    targetUnit,
  );
  (result as any).turns = turns;

  // Step 1: Initial infiltration through sentries
  const v2Enabled = isBalanceV2EnabledForUser(attacker.id);
  const missionResolution = v2Enabled
    ? resolveSpyMissionSuccess({
        attackerSpy: effectiveAttackerSpy,
        defenderSentry: effectiveDefenderSentry,
        random,
        situationalModifier: -0.2, // Assassination should be riskiest.
      })
    : {
        success: effectiveAttackerSpy > effectiveDefenderSentry,
        probability: undefined,
      };
  const isSuccessful = missionResolution.success;
  const spySentryRatio = effectiveAttackerSpy / effectiveDefenderSentry;
  result.success = isSuccessful;
  (result as any).successProbability = missionResolution.probability;
  (result as any).probabilityModel = v2Enabled ? 'LOGISTIC_V2' : 'BINARY_V1';

  // If the mission fails at the sentry check
  // going to allow some to safely retreat, but some will die
  if (!isSuccessful) {
    const lossMultiplier = Math.min(
      1,
      Math.max(0, 1 - spySentryRatio) * 0.6 +
        0.4 +
        (turns / V5_COMBAT_CONSTANTS.MAX_SPY_MISSION_TURNS) * 0.15,
    );
    const spiesToRemove = Math.ceil(
      spiesSent * mtRand(lossMultiplier * 0.9, lossMultiplier * 1.1, random),
    );
    const assassinUnits = attacker.units.filter(
      (u) => u.type === 'SPY' && u.level === 3,
    );
    for (const unit of assassinUnits) {
      const qtyToRemove = Math.min(unit.quantity, spiesToRemove);
      unit.quantity -= qtyToRemove;
      if (spiesToRemove <= 0) break;
    }
    result.spiesLost = spiesToRemove;
    logDebug(
      `Assassination failed at sentry check. Spies lost: ${result.spiesLost} | Spies sent: ${spiesSent} | AttackID: ${attacker.id} | DefenderID: ${defender.id}`,
    );
    return result;
  }

  // Step 2: Combat between attacker's spies and defender's sentries
  let spiesRemaining = spiesSent;
  let limiter =
    (spiesRemaining / (attacker.spyLimits.assass.perMission || 1)) *
    missionPower; // TODO: this should be the maximum assassins allowed per mission
  // Determine probability/severity of being caught based on ratio

  const { spyStrength: attackerKS, sentryStrength: attackerDS } =
    calculateClandestineStrength(attacker, 'SPY', limiter);
  const { spyStrength: defenderKS, sentryStrength: defenderDS } =
    calculateClandestineStrength(defender, 'SENTRY', limiter);

  // Get average HP for attacker spies and defender sentries
  const { averageHP: attackerSpyAvgHP } = getAverageLevelAndHP(
    attacker.units as any as PlayerUnit[],
    'SPY',
    3,
  );
  const { averageHP: defenderSentryAvgHP } = getAverageLevelAndHP(
    defender.units as any as PlayerUnit[],
    'SENTRY',
  );

  // Calculate casualties using the adjusted formula
  const casualtyRateInitial = defenderKS / (defenderKS + attackerDS || 1) / 100;
  const effectiveDefenderKSInitial = defenderKS * casualtyRateInitial;
  const attackerSpyCasualties = Math.floor(
    effectiveDefenderKSInitial / (attackerSpyAvgHP * limiter || 1),
  );
  const killRateInitial = attackerKS / (attackerKS + defenderDS || 1);
  const effectiveAttackerKSInitial = attackerKS * killRateInitial;
  const defenderSentryCasualties = Math.floor(
    effectiveAttackerKSInitial / (defenderSentryAvgHP || 1),
  );

  result.spiesLost += Math.min(spiesRemaining, attackerSpyCasualties);
  spiesRemaining -= Math.min(spiesRemaining, attackerSpyCasualties);

  // Remove spies lost from attacker
  let spiesToRemove = result.spiesLost;
  const assassinUnits = attacker.units.filter(
    (u) => u.type === 'SPY' && u.level === 3,
  );
  for (const unit of assassinUnits) {
    const qtyToRemove = Math.min(unit.quantity, spiesToRemove);
    unit.quantity -= qtyToRemove;
    spiesToRemove -= qtyToRemove;
    if (spiesToRemove <= 0) break;
  }

  // Remove defender sentry casualties
  let sentriesToRemove = defenderSentryCasualties;
  const sentryUnits = defender.units.filter((u) => u.type === 'SENTRY');
  for (const unit of sentryUnits) {
    const qtyToRemove = Math.min(unit.quantity, sentriesToRemove);
    unit.quantity -= qtyToRemove;
    sentriesToRemove -= qtyToRemove;
    if (sentriesToRemove <= 0) break;
  }

  // Check mission success after initial combat
  if (result.spiesLost >= spiesSent) {
    // All spies lost, mission fails
    result.success = false;
    return result;
  }

  // Step 3: Proceed to attack target units
  limiter =
    (spiesRemaining / (attacker.unitTotals.assassins || 1)) * missionPower;

  const { spyStrength: attackerKS2, sentryStrength: _attackerDS2 } =
    calculateClandestineStrength(attacker, 'SPY', limiter);

  let targetDefenseStats;
  let unitsKilled;
  let averageHP;

  if (targetUnit === CITIZEN_WORKERS_TARGET) {
    const workerStats = calculateDefenseAgainstAssassination(
      defender,
      'WORKER',
      limiter,
    );
    const citizenStats = calculateDefenseAgainstAssassination(
      defender,
      'CITIZEN',
      limiter,
    );

    // Combine the stats
    targetDefenseStats = {
      killingStrength:
        workerStats.killingStrength + citizenStats.killingStrength,
      defenseStrength:
        workerStats.defenseStrength + citizenStats.defenseStrength,
    };

    // Calculate average HP for WORKERS and CITIZENS separately
    const { averageHP: workerAvgHP } = getAverageLevelAndHP(
      defender.units as any as PlayerUnit[],
      'WORKER',
    );
    const { averageHP: citizenAvgHP } = getAverageLevelAndHP(
      defender.units as any as PlayerUnit[],
      'CITIZEN',
    );

    // Combine average HP weighted by their quantities
    const totalWorkers = defender.unitTotals.workers;
    const totalCitizens = defender.unitTotals.citizens;
    const totalUnits = totalWorkers + totalCitizens || 1;

    averageHP =
      (workerAvgHP * totalWorkers + citizenAvgHP * totalCitizens) /
      (totalUnits || 1);

    // Calculate units killed using the adjusted formula
    const killRate = attackerKS2 / (targetDefenseStats.defenseStrength || 1);
    const effectiveAttackerKS = attackerKS2 * (killRate * limiter);
    unitsKilled = Math.floor(effectiveAttackerKS / (averageHP || 1));

    const populationCap = Math.max(
      1,
      Math.floor(
        ((defender.unitTotals as any)?.population ??
          totalWorkers + totalCitizens + defender.unitTotals.defense) *
          assassinationCapShare,
      ),
    );
    result.unitsKilled = Math.ceil(
      Math.min(unitsKilled, totalWorkers + totalCitizens, populationCap),
    );
    logDebug(
      `Assassination: ${result.unitsKilled} ${targetUnit} killed | AttackID: ${attacker.id} | DefenderID: ${defender.id}`,
    );
  } else {
    targetDefenseStats = calculateDefenseAgainstAssassination(
      defender,
      targetUnit,
      limiter,
    );

    // Calculate average HP for the target unit
    const { averageHP: targetUnitAvgHP } = getAverageLevelAndHP(
      defender.units as any as PlayerUnit[],
      targetUnit,
    );
    averageHP = targetUnitAvgHP || 1;

    // Calculate units killed using the adjusted formula

    const killRate =
      attackerKS2 / (attackerKS2 + (targetDefenseStats.defenseStrength || 1));
    const effectiveAttackerKS = attackerKS2 * killRate;
    unitsKilled = Math.floor(effectiveAttackerKS / averageHP);

    const totalPopulation = Object.values(
      defender.unitTotals ?? {},
    ).reduce<number>(
      (sum, value) => sum + (typeof value === 'number' ? value : 0),
      0,
    );
    const missionCap = Math.max(
      1,
      Math.floor(totalPopulation * assassinationCapShare),
    );
    result.unitsKilled = Math.min(
      unitsKilled,
      defender.unitTotals[targetUnit.toLowerCase()] || 0,
      missionCap,
    );
    logDebug(
      `Assassination: ${result.unitsKilled} ${targetUnit} killed | AttackID: ${attacker.id} | DefenderID: ${defender.id}`,
    );
  }

  // Remove units killed from defender
  let unitsToRemove = result.unitsKilled;
  const targetUnits = defender.units.filter((u) =>
    targetUnit === CITIZEN_WORKERS_TARGET
      ? u.type === 'WORKER' || u.type === 'CITIZEN'
      : u.type === targetUnit,
  );
  for (const unit of targetUnits) {
    const qtyToRemove = Math.min(unit.quantity, unitsToRemove);
    unit.quantity -= qtyToRemove;
    unitsToRemove -= qtyToRemove;
    if (unitsToRemove <= 0) break;
  }

  // Final mission success check
  if (result.spiesLost >= spiesSent) {
    // All spies lost, mission fails
    result.success = false;
  }

  return result;
};

export const simulateInfiltration = (
  attacker: SpyMissionUser,
  defender: SpyMissionUser,
  spies: number,
  options?: SpySimulationOptions,
) => {
  const random = options?.random ?? Math.random;
  const turns = getMissionTurns(
    options,
    V5_COMBAT_CONSTANTS.MIN_INFILTRATION_TURNS,
  );
  const missionPower = calculateSpyMissionPower(turns);
  const effectiveAttackerSpy = attacker.spy * missionPower;
  const effectiveDefenderSentry = getPressureAdjustedSentry(defender, options);
  const spySentryRatio = effectiveAttackerSpy / effectiveDefenderSentry;
  let spiesLost = 0;

  // Implement a curve for spy loss based on the spy/sentry ratio
  if (spySentryRatio <= 0.5) {
    // Significant disadvantage - lose most spies
    spiesLost = Math.ceil(spies * 0.9);
  } else if (spySentryRatio <= 0.8) {
    // Moderate disadvantage - lose a significant number of spies
    spiesLost = Math.ceil(spies * 0.6);
  } else if (spySentryRatio < 1) {
    // Slight disadvantage - lose some spies
    spiesLost = Math.ceil(spies * 0.3);
  } else if (spySentryRatio <= 1.2) {
    // Slight advantage - lose a few spies
    spiesLost = Math.ceil(spies * 0.1);
  } else {
    // Significant advantage - lose no spies
    spiesLost = 0;
  }

  spiesLost = Math.min(spiesLost, spies); // Ensure we don't lose more spies than we sent

  const result = new InfiltrationResult(attacker, defender, spies);
  const v2Enabled = isBalanceV2EnabledForUser(attacker.id);
  const missionResolution = v2Enabled
    ? resolveSpyMissionSuccess({
        attackerSpy: effectiveAttackerSpy,
        defenderSentry: effectiveDefenderSentry,
        random,
        situationalModifier: 0, // Neutral difficulty mission.
      })
    : {
        success: effectiveAttackerSpy > effectiveDefenderSentry,
        probability: undefined,
      };
  (result as any).turns = turns;
  result.success = missionResolution.success; // Mission can succeed even with some losses
  (result as any).successProbability = missionResolution.probability;
  (result as any).probabilityModel = v2Enabled ? 'LOGISTIC_V2' : 'BINARY_V1';
  result.spiesLost = result.success ? spiesLost : spies; // Lost, lose all spies

  // Remove spies lost from attacker
  let spiesToRemove = result.spiesLost;
  const infiltratorUnits = attacker.units.filter(
    (u) => u.type === 'SPY' && u.level === 2,
  ); // Level 2 SPY
  for (const unit of infiltratorUnits) {
    const qtyToRemove = Math.min(unit.quantity, spiesToRemove);
    unit.quantity -= qtyToRemove;
    spiesToRemove -= qtyToRemove;
    if (spiesToRemove <= 0) break;
  }

  // The rest of the function remains the same
  if (result.success) {
    const startHP = result.defender.fortHitpoints;
    const maxFortDamage = Math.max(
      1,
      Math.floor(startHP * Math.min(0.12, 0.025 + turns * 0.0095)),
    );
    for (let i = 1; i <= spies - spiesLost; i++) {
      // Only damage with remaining spies
      if (result.defender.fortHitpoints > 0) {
        if (spySentryRatio <= 0.05)
          result.defender.fortHitpoints -= Math.floor(mtRand(0, 2, random));
        else if (spySentryRatio > 0.05 && spySentryRatio <= 0.5)
          result.defender.fortHitpoints -= Math.floor(mtRand(3, 6, random));
        else if (spySentryRatio > 0.5 && spySentryRatio <= 1.3)
          result.defender.fortHitpoints -= Math.floor(mtRand(6, 16, random));
        else
          result.defender.fortHitpoints -= Math.floor(
            mtRand(12, 24, random) * calculateSpyMissionDamageFactor(turns),
          );

        result.defender.fortHitpoints = Math.max(
          0,
          Math.max(startHP - maxFortDamage, result.defender.fortHitpoints),
        );
      }
    }
    result.fortDmg += Number(startHP - result.defender.fortHitpoints);
  }

  return result;
};
/**
 * Calculates clandestine strength for spy or sentry units, including bonuses.
 *
 * Expected user properties:
 * - units: Array of PlayerUnit with type, level, quantity
 * - items: Array of items with usage matching unit type
 * - spyBonus: number (percentage bonus for spy strength, defaults to 0)
 * - sentryBonus: number (percentage bonus for sentry strength, defaults to 0)
 * - unitTotals: object with spies/sentries counts
 * - getLevelForUnit(type): function returning fort level for unit type
 */
export function calculateClandestineStrength(
  user: SpyMissionUser,
  unitType: 'SPY' | 'SENTRY',
  limiter: number = 1,
): {
  spyStrength: number;
  sentryStrength: number;
  avgSpyStrength: number;
  avgSentryStrength: number;
} {
  let KS = 0; // Total Killing Strength
  let DS = 0; // Total Defense Strength
  const totals = user.unitTotals ?? { spies: 0, sentries: 0 };
  let totalUnits = unitType === 'SENTRY' ? totals.sentries : totals.spies;

  const bonusValue = unitType === 'SPY' ? user.spyBonus : user.sentryBonus;
  const raceIdentity = getRaceIdentity((user as any).race);
  const unitMultiplier =
    (1 + parseInt((bonusValue ?? 0).toString(), 10) / 100) *
    (unitType === 'SPY'
      ? raceIdentity.intelMultiplier
      : raceIdentity.sentryMultiplier);

  // Include both regular units and mercenaries
  const allUnits = [...(user.units || []), ...(user.mercenaries || [])];
  allUnits
    .filter((u) => u.type === unitType)
    .forEach((unit) => {
      if (!unit || typeof unit.quantity !== 'number') return;
      if (totalUnits === 0) return;

      const unitLevelGate =
        typeof user.getLevelForUnit === 'function'
          ? user.getLevelForUnit(unit.type)
          : ((user as any).fortLevel ?? 0);

      const unitInfo = UnitTypes.find(
        (unitType) =>
          unitType.type === unit.type &&
          unitType.fortLevel <= unitLevelGate &&
          unitType.level === unit.level,
      ) as any;

      if (unitInfo) {
        const usableQuantity = Math.min(unit.quantity, totalUnits);
        KS += ((unitInfo.killingStrength as number) || 0) * usableQuantity;
        DS += ((unitInfo.defenseStrength as number) || 0) * usableQuantity;
        totalUnits -= usableQuantity;
      }

      const itemCounts: { [K in ItemType]?: number } = {
        WEAPON: 0,
        HELM: 0,
        BOOTS: 0,
        BRACERS: 0,
        SHIELD: 0,
        ARMOR: 0,
      } as any;

      user.items
        .filter((item) => item.usage === unit.type)
        .forEach((item) => {
          itemCounts[item.type] = itemCounts[item.type] || 0;

          const itemInfo = ItemTypes.find(
            (w) =>
              w.level === item.level &&
              w.usage === unit.type &&
              w.type === item.type,
          ) as any;

          if (itemInfo) {
            const usableQuantity = Math.min(
              item.quantity,
              Math.min(unit.quantity, totalUnits) - itemCounts[item.type],
            );
            KS += ((itemInfo.killingStrength as number) || 0) * usableQuantity;
            DS += ((itemInfo.defenseStrength as number) || 0) * usableQuantity;
            itemCounts[item.type] += usableQuantity;
          }
        });
    });

  // Calculate average strengths per unit
  const avgKS = totalUnits > 0 ? KS / totalUnits : 0;
  const avgDS = totalUnits > 0 ? DS / totalUnits : 0;

  return {
    spyStrength: Math.ceil(KS * unitMultiplier * limiter),
    sentryStrength: Math.ceil(DS * unitMultiplier * limiter),
    avgSpyStrength: avgKS * unitMultiplier,
    avgSentryStrength: avgDS * unitMultiplier,
  };
}

export function calculateDefenseAgainstAssassination(
  user: SpyMissionUser,
  unitType: UnitType,
  limiter: number = 1,
): { killingStrength: number; defenseStrength: number } {
  let KS = 0;
  let DS = 0;
  const unitMultiplier = 1 + parseInt(String(user.defenseBonus ?? 0), 10) / 100;

  // Include both regular units and mercenaries
  const allUnits = [...(user.units || []), ...(user.mercenaries || [])];
  allUnits
    .filter((u) => u.type === unitType)
    .sort((a, b) =>
      // sort by level from highest to lowest
      a.level > b.level ? 1 : 0,
    )
    .forEach((unit) => {
      const unitInfo = UnitTypes.find(
        (unitType) =>
          unitType.type === unit.type &&
          unitType.fortLevel <=
            (typeof user.getLevelForUnit === 'function'
              ? user.getLevelForUnit(unit.type)
              : ((user as any).fortLevel ?? 0)),
      );
      if (unitInfo) {
        KS += (unitInfo.MeleeAtkPower || 0) * unit.quantity;
        DS += (unitInfo.MeleeDefPower || 0) * unit.quantity;
      }

      const itemCounts: { [K in ItemType]?: number } = {
        WEAPON: 0,
        HELM: 0,
        BOOTS: 0,
        BRACERS: 0,
        SHIELD: 0,
        ARMOR: 0,
      } as any;
      if (unit.quantity === 0) return;

      user.items
        .filter((item) => item.usage === unit.type)
        .forEach((item) => {
          itemCounts[item.type] = itemCounts[item.type] || 0;

          const itemInfo = ItemTypes.find(
            (w) =>
              w.level === item.level &&
              w.usage === unit.type &&
              w.type === item.type,
          );
          if (itemInfo) {
            const usableQuantity = Math.min(
              item.quantity,
              unit.quantity - itemCounts[item.type],
            );
            KS += itemInfo.MeleeAtkPower * usableQuantity;
            DS += itemInfo.MeleeDefPower * usableQuantity;
            itemCounts[item.type] += usableQuantity;
          }
        });
    });

  KS *= unitMultiplier;
  DS *= unitMultiplier;

  return {
    killingStrength: Math.ceil(KS * limiter),
    defenseStrength: Math.ceil(DS * limiter),
  };
}

function calculateAverageStrength(Units, targetType) {
  let totalDefenseStrength = 0;
  let totalKillingStrength = 0;
  let totalQuantity = 0;

  Units.filter((unit) => unit.type === targetType).forEach((unit) => {
    const unitType = UnitTypes.find(
      (type) => type.type === unit.type && type.level === unit.level,
    );
    if (unitType) {
      totalDefenseStrength += (unitType.MeleeDefPower || 0) * unit.quantity;
      totalKillingStrength += (unitType.MeleeAtkPower || 0) * unit.quantity;
      totalQuantity += unit.quantity;
    }
  });

  return {
    averageDefense:
      totalQuantity > 0 ? totalDefenseStrength / totalQuantity : 0,
    averageKilling:
      totalQuantity > 0 ? totalKillingStrength / totalQuantity : 0,
  };
}

export function computeSpyCasualties({
  attackerKS: _attackerKS,
  defenderDS: _defenderDS,
  defenderKS: _defenderKS,
  attackerDS: _attackerDS,
  attackerPop: _attackerPop,
  defenderPop: _defenderPop,
  multiplier: _multiplier = 1,
  attackerUnits,
  defenderUnits,
  spiesSent = 1,
}: {
  attackerKS: number;
  defenderDS: number;
  defenderKS: number;
  attackerDS: number;
  attackerPop: number;
  defenderPop: number;
  multiplier?: number;
  attackerUnits: PlayerUnit[];
  defenderUnits: PlayerUnit[];
  spiesSent?: number;
}): { attackerCasualties: number; defenderCasualties: number } {
  const { averageKilling: attackerAvgKS } = calculateAverageStrength(
    attackerUnits,
    'SPY',
  );

  const { averageDefense: defenderAvgDS } = calculateAverageStrength(
    defenderUnits,
    defenderUnits.at(0)?.type,
  );

  const attackerCasualties = Math.ceil(
    spiesSent * (attackerAvgKS / defenderAvgDS),
  );
  const defenderCasualties = Math.ceil(
    spiesSent * (defenderAvgDS / attackerAvgKS),
  );

  return {
    attackerCasualties,
    defenderCasualties,
  };
}
