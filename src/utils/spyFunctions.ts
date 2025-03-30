import { Fortifications, ItemTypes, UnitTypes } from "@/constants";
import UserModel from "@/models/Users";
import { Item, ItemType, PlayerUnit, UnitType } from "@/types/typings";
import mtRand from "./mtrand";
import { SpyUserModel } from "@/models/SpyUser";
import { getAverageLevelAndHP } from "./units";
import { logDebug, logError } from "./logger";

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

export const CITIZEN_WORKERS_TARGET = 'CITIZEN_WORKERS';

export class AssassinationResult {
  spiesSent: number;
  spiesLost: number;
  unitsKilled: number;
  targetUnit: string;
  success: boolean;
  experienceGained: number;
  goldStolen: number;
  units: PlayerUnit[];

  constructor(attacker: UserModel, defender: UserModel, spies: number, target: UnitType | typeof CITIZEN_WORKERS_TARGET = CITIZEN_WORKERS_TARGET) {
    this.spiesSent = spies;
    this.spiesLost = 0;
    this.unitsKilled = 0;
    this.targetUnit = target;
    this.success = false;
    this.experienceGained = 0;
    this.goldStolen = 0;
    this.units = (target === CITIZEN_WORKERS_TARGET
      ? defender.units.filter((unit) => unit.type === 'CITIZEN' || unit.type === 'WORKER')
      : defender.units.filter((unit) => unit.type === target));
  }
}

export class IntelResult {
  attacker: UserModel;
  defender: UserModel;
  spiesSent: number;
  spiesLost: number;
  success: boolean;
  intelligenceGathered: {
    offense: number | 0;
    defense: number | 0;
    spyOffense: number | 0;
    spyDefense: number | 0;
    units: PlayerUnit[] | null;
    items: Item[] | null;
    fortLevel: number | null;
    fortHitpoints: number | null;
    goldInBank: number | null;
  } | null;

  constructor(attacker: UserModel, defender: UserModel, spiesSent: number) {
    this.attacker = attacker;  // deep copy
    this.defender = defender;  // deep copy
    this.spiesSent = spiesSent;
    this.spiesLost = 0;
    this.success = false;
    this.intelligenceGathered = null;
  }
}

export class InfiltrationResult {
  attacker: UserModel;
  defender: UserModel;
  spiesSent: number;
  spiesLost: number;
  success: boolean;
  fortDmg: number;

  constructor(attacker: UserModel, defender: UserModel, spiesSent: number) {
    this.attacker = attacker;  // deep copy
    this.defender = defender;  // deep copy
    this.spiesSent = spiesSent;
    this.spiesLost = 0;
    this.success = false;
    this.fortDmg = 0;
  }

}

export function simulateIntel(
  attacker: UserModel,
  defender: UserModel,
  spies: number
): any {
  spies = Math.max(1, Math.min(spies, 10));

  const fortification = Fortifications.find((fort) => fort.level === defender.fortLevel);
  if (!fortification) {
    return { status: 'failed', message: 'Fortification not found', defender: defender.fortLevel };
  }
  let { fortHitpoints } = defender;
  const isSuccessful = attacker.spy > defender.sentry;

  const result = new IntelResult(attacker, defender, spies);
  result.success = isSuccessful;
  result.spiesLost = isSuccessful ? 0 : spies;
  if (isSuccessful) {
    // Proceed with gathering intelligence
    const deathRiskFactor = Math.max(0, 1 - (attacker.spy / defender.sentry));
    let spiesLost = 0;
    for (let i = 0; i < spies; i++) {
      if (Math.random() < deathRiskFactor) {
        spiesLost++;
      }
    }
    const intelPercentage = Math.min((spies - spiesLost) * 10, 100);
    const intelKeys = Object.keys(new SpyUserModel(defender, (spies - spiesLost) * 10));
    const selectedKeysCount = Math.ceil(intelKeys.length * intelPercentage / 100);
    const randomizedKeys = intelKeys.sort(() => 0.5 - Math.random()).slice(0, selectedKeysCount);
    
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
        const totalTypes = defender[key].length;
        const typesToInclude = Math.floor(totalTypes * intelPercentage / 100);
        initPartialIntel[key] = defender[key].sort(() => 0.5 - Math.random()).slice(0, typesToInclude);
      } else {
        initPartialIntel[key] = defender[key];
      }
      return initPartialIntel;
    }, result.intelligenceGathered);
  } else {
    attacker.units.filter((u) => u.type === 'SPY' && u.level === 1).forEach((u) => u.quantity = u.quantity - spies);
  }
  return result;
}

export const simulateAssassination = (
  attacker: UserModel,
  defender: UserModel,
  spiesSent: number,
  targetUnit: UnitType | typeof CITIZEN_WORKERS_TARGET
) => {
  const result = new AssassinationResult(attacker, defender, spiesSent, targetUnit);

  // Step 1: Initial infiltration through sentries
  // Spy score should be greater than sentry to win
  const isSuccessful = attacker.spy > defender.sentry;
  const spySentryRatio = attacker.spy / (defender.sentry || 1)
  result.success = isSuccessful;

  // If the mission fails at the sentry check
  // going to allow some to safely retreat, but some will die
  if (!isSuccessful) {
    const lossMultiplier = Math.min(1, Math.max(0, 1 - spySentryRatio) * 0.6 + 0.4);
    const spiesToRemove = Math.ceil(spiesSent * mtRand(lossMultiplier * 0.9, lossMultiplier * 1.1));
    const assassinUnits = attacker.units.filter((u) => u.type === 'SPY' && u.level === 3);
    for (const unit of assassinUnits) {
      const qtyToRemove = Math.min(unit.quantity, spiesToRemove);
      unit.quantity -= qtyToRemove;
      if (spiesToRemove <= 0) break;
    }
    result.spiesLost = spiesToRemove;
    logDebug(`Assassination failed at sentry check. Spies lost: ${result.spiesLost} | Spies sent: ${spiesSent} | AttackID: ${attacker.id} | DefenderID: ${defender.id}`);
    return result;
  }

  // Step 2: Combat between attacker's spies and defender's sentries
  // We'll take x% of the Level3 SPY's KS/DS based on number of spies compared to spyLevels maximum amount.
  let spiesRemaining = spiesSent;
  let limiter = spiesRemaining / (attacker.spyLimits.assass.perMission || 1); // TODO: this should be the maximum assassins allowed per mission
  // Determine probability/severity of being caught based on ratio
  
  const { spyStrength: attackerKS, sentryStrength: attackerDS } = calculateClandestineStrength(attacker, 'SPY', limiter);
  const { spyStrength: defenderKS, sentryStrength: defenderDS } = calculateClandestineStrength(defender, 'SENTRY', limiter);

  // Get average HP for attacker spies and defender sentries
  const { averageHP: attackerSpyAvgHP } = getAverageLevelAndHP(attacker.units, 'SPY', 3);
  const { averageHP: defenderSentryAvgHP } = getAverageLevelAndHP(defender.units, 'SENTRY');
  
  // Calculate casualties using the adjusted formula
  const casualtyRateInitial = defenderKS / ((defenderKS + attackerDS) || 1) / 100;
  const effectiveDefenderKSInitial = defenderKS * casualtyRateInitial;
  const attackerSpyCasualties = Math.floor(effectiveDefenderKSInitial / ((attackerSpyAvgHP * limiter) || 1));
  const killRateInitial = attackerKS / ((attackerKS + defenderDS) || 1);
  const effectiveAttackerKSInitial = attackerKS * killRateInitial;
  const defenderSentryCasualties = Math.floor(effectiveAttackerKSInitial / (defenderSentryAvgHP || 1));

  result.spiesLost += Math.min(spiesRemaining, attackerSpyCasualties);
  spiesRemaining -= Math.min(spiesRemaining, attackerSpyCasualties);

  // Remove spies lost from attacker
  let spiesToRemove = result.spiesLost;
  const assassinUnits = attacker.units.filter((u) => u.type === 'SPY' && u.level === 3);
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
  limiter = spiesRemaining / (attacker.unitTotals.assassins || 1);

  const { spyStrength: attackerKS2, sentryStrength: attackerDS2 } = calculateClandestineStrength(attacker, 'SPY', limiter);

  let targetDefenseStats;
  let unitsKilled;
  let averageHP;

  if (targetUnit === CITIZEN_WORKERS_TARGET) {
    const workerStats = calculateDefenseAgainstAssassination(defender, 'WORKER', limiter);
    const citizenStats = calculateDefenseAgainstAssassination(defender, 'CITIZEN', limiter);

    // Combine the stats
    targetDefenseStats = {
      killingStrength: workerStats.killingStrength + citizenStats.killingStrength,
      defenseStrength: workerStats.defenseStrength + citizenStats.defenseStrength,
    };

    // Calculate average HP for WORKERS and CITIZENS separately
    const { averageHP: workerAvgHP } = getAverageLevelAndHP(defender.units, 'WORKER');
    const { averageHP: citizenAvgHP } = getAverageLevelAndHP(defender.units, 'CITIZEN');

    // Combine average HP weighted by their quantities
    const totalWorkers = defender.unitTotals.workers;
    const totalCitizens = defender.unitTotals.citizens;
    const totalUnits = totalWorkers + totalCitizens || 1;

    averageHP =
      ((workerAvgHP * totalWorkers) + (citizenAvgHP * totalCitizens)) / (totalUnits || 1);

    // Calculate units killed using the adjusted formula
    const killRate = attackerKS2 / (targetDefenseStats.defenseStrength || 1);
    const effectiveAttackerKS = attackerKS2 * (killRate * limiter);
    unitsKilled = Math.floor(effectiveAttackerKS / (averageHP || 1));

    result.unitsKilled = Math.ceil(Math.min(
      unitsKilled,
      totalWorkers + totalCitizens
    ));
    logDebug(`Assassination: ${result.unitsKilled} ${targetUnit} killed | AttackID: ${attacker.id} | DefenderID: ${defender.id}`);
  } else {
    targetDefenseStats = calculateDefenseAgainstAssassination(defender, targetUnit, limiter);

    // Calculate average HP for the target unit
    const { averageHP: targetUnitAvgHP } = getAverageLevelAndHP(defender.units, targetUnit);
    averageHP = targetUnitAvgHP || 1;

    // Calculate units killed using the adjusted formula

    const killRate = attackerKS2 / (attackerKS2 + (targetDefenseStats.defenseStrength || 1));
    const effectiveAttackerKS = attackerKS2 * killRate;
    unitsKilled = Math.floor(effectiveAttackerKS / averageHP);

    result.unitsKilled = Math.min(
      unitsKilled,
      defender.unitTotals[targetUnit.toLowerCase()] || 0
    );
    logDebug(`Assassination: ${result.unitsKilled} ${targetUnit} killed | AttackID: ${attacker.id} | DefenderID: ${defender.id}`);
  }

  // Remove units killed from defender
  let unitsToRemove = result.unitsKilled;
  const targetUnits = defender.units.filter((u) =>
    targetUnit === CITIZEN_WORKERS_TARGET
      ? u.type === 'WORKER' || u.type === 'CITIZEN'
      : u.type === targetUnit
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


export const simulateInfiltration =
(
  attacker: UserModel,
  defender: UserModel,
  spies: number
) => {
  const spySentryRatio = attacker.spy / (defender.sentry || 1); // Avoid division by zero
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
  result.success = attacker.spy > defender.sentry; // The mission is still considered successful if attacker.spy > defender.sentry, even with spy losses
  result.spiesLost = (result.success ? spiesLost : spies); // Lost, lose all spies

  // Remove spies lost from attacker
  let spiesToRemove = result.spiesLost;
  const infiltratorUnits = attacker.units.filter((u) => u.type === 'SPY' && u.level === 2); // Level 2 SPY
  for (const unit of infiltratorUnits) {
    const qtyToRemove = Math.min(unit.quantity, spiesToRemove);
    unit.quantity -= qtyToRemove;
    spiesToRemove -= qtyToRemove;
    if (spiesToRemove <= 0) break;
  }

  // The rest of the function remains the same
  if (result.success) {
    const startHP = result.defender.fortHitpoints;
    for (let i = 1; i <= spies - spiesLost; i++) { // Only damage with remaining spies
      if (result.defender.fortHitpoints > 0) {
        if (result.attacker.spy / (result.defender.sentry || 1) <= 0.05)
          result.defender.fortHitpoints -= Math.floor(mtRand(0, 2))
        else if (result.attacker.spy / (result.defender.sentry || 1) > 0.05 && result.attacker.spy / (result.defender.sentry || 1) <= 0.5)
          result.defender.fortHitpoints -= Math.floor(mtRand(3, 6));
        else if (result.attacker.spy / (result.defender.sentry || 1) > 0.5 && result.attacker.spy / (result.defender.sentry || 1) <= 1.3)
          result.defender.fortHitpoints -= Math.floor(mtRand(6, 16));
        else result.defender.fortHitpoints -= Math.floor(mtRand(12, 24));

        if (result.defender.fortHitpoints < 0) {
          result.defender.fortHitpoints = 0;
        }
      }
    }
    result.fortDmg += Number(startHP - result.defender.fortHitpoints);
  }

  return result;
  }
export function calculateClandestineStrength(user: UserModel, unitType: 'SPY' | 'SENTRY', limiter: number = 1): {
  spyStrength: number;
  sentryStrength: number;
  avgSpyStrength: number;
  avgSentryStrength: number;
} {
  let KS = 0; // Total Killing Strength
  let DS = 0; // Total Defense Strength
  let totalUnits = unitType === 'SENTRY' ? user.unitTotals.sentries : user.unitTotals.spies;

  const unitMultiplier = 1 + parseInt(
    unitType === 'SPY' ? user.spyBonus.toString() : user.sentryBonus.toString(),
    10
  ) / 100;

  user.units.filter((u) => u.type === unitType).forEach((unit) => {
    if (totalUnits === 0) return;

    const unitInfo = UnitTypes.find(
      (unitType) =>
        unitType.type === unit.type &&
        unitType.fortLevel <= user.getLevelForUnit(unit.type) &&
        unitType.level === unit.level
    );

    if (unitInfo) {
      const usableQuantity = Math.min(unit.quantity, totalUnits);
      KS += (unitInfo.killingStrength || 0) * usableQuantity;
      DS += (unitInfo.defenseStrength || 0) * usableQuantity;
      totalUnits -= usableQuantity;
    }

    const itemCounts: Record<ItemType, number> = {
      WEAPON: 0,
      HELM: 0,
      BOOTS: 0,
      BRACERS: 0,
      SHIELD: 0,
      ARMOR: 0,
    };

    user.items.filter((item) => item.usage === unit.type).forEach((item) => {
      itemCounts[item.type] = itemCounts[item.type] || 0;

      const itemInfo = ItemTypes.find(
        (w) => w.level === item.level && w.usage === unit.type && w.type === item.type
      );

      if (itemInfo) {
        const usableQuantity = Math.min(
          item.quantity,
          Math.min(unit.quantity, totalUnits) - itemCounts[item.type]
        );
        KS += itemInfo.killingStrength * usableQuantity;
        DS += itemInfo.defenseStrength * usableQuantity;
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


export function calculateDefenseAgainstAssassination(user: UserModel, unitType: UnitType, limiter: number = 1): { killingStrength: number, defenseStrength: number } {
  let KS = 0;
  let DS = 0;
  const unitMultiplier = (1 + parseInt(user.defenseBonus.toString(), 10) / 100);
  user.units.filter((u) => u.type === unitType)
    .sort((a, b) =>
      // sort by level from highest to lowest
      a.level > b.level ? 1 : 0
    )
    .forEach((unit) => {
      const unitInfo = UnitTypes.find(
        (unitType) => unitType.type === unit.type && unitType.fortLevel <= user.getLevelForUnit(unit.type)
      );
      if (unitInfo) {
        KS += (unitInfo.killingStrength || 0) * unit.quantity;
        DS += (unitInfo.defenseStrength || 0) * unit.quantity;
      }

      const itemCounts: Record<ItemType, number> = { WEAPON: 0, HELM: 0, BOOTS: 0, BRACERS: 0, SHIELD: 0, ARMOR: 0 };
      if (unit.quantity === 0) return;

      user.items.filter((item) => item.usage === unit.type).forEach((item) => {
        itemCounts[item.type] = itemCounts[item.type] || 0;

        const itemInfo = ItemTypes.find(
          (w) => w.level === item.level && w.usage === unit.type && w.type === item.type
        );
        if (itemInfo) {
          const usableQuantity = Math.min(item.quantity, unit.quantity - itemCounts[item.type]);
          KS += itemInfo.killingStrength * usableQuantity;
          DS += itemInfo.defenseStrength * usableQuantity;
          itemCounts[item.type] += usableQuantity;
        }
      });
    });

  KS *= unitMultiplier;
  DS *= unitMultiplier;

  return { killingStrength: Math.ceil(KS * limiter), defenseStrength: Math.ceil(DS * limiter) };
}

function calculateAverageStrength(Units, targetType) {
  let totalDefenseStrength = 0;
  let totalKillingStrength = 0;
  let totalQuantity = 0;

  Units
    .filter((unit) => unit.type === targetType)
    .forEach((unit) => {
      const unitType = UnitTypes.find((type) => type.type === unit.type && type.level === unit.level);
      if (unitType) {
        totalDefenseStrength += unitType.defenseStrength * unit.quantity;
        totalKillingStrength += unitType.killingStrength * unit.quantity;
        totalQuantity += unit.quantity;
      }
    });

  return {
    averageDefense: totalQuantity > 0 ? totalDefenseStrength / totalQuantity : 0,
    averageKilling: totalQuantity > 0 ? totalKillingStrength / totalQuantity : 0
  };
}

export function computeSpyCasualties({
  attackerKS,
  defenderDS,
  defenderKS,
  attackerDS,
  attackerPop,
  defenderPop,
  multiplier = 1,
  attackerUnits,
  defenderUnits,
  spiesSent = 1
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
  // Calculate ratios
  const offenseToDefenseRatio = attackerKS / (defenderDS || 1);
  const defenseToOffenseRatio = defenderKS / (attackerDS || 1);
  
  const attackerDiff = (attackerKS - defenderDS) / attackerPop ;
  const defenderDiff = (defenderKS - attackerDS) / defenderPop ;
  
  const { averageKilling: attackerAvgKS, averageDefense: attackerAvgDS } = calculateAverageStrength(attackerUnits, 'SPY')
  
  const { averageDefense: defenderAvgDS } = calculateAverageStrength(defenderUnits, defenderUnits.at(0)?.type)


  const attackerCasualties = Math.ceil(spiesSent * (attackerAvgKS / defenderAvgDS));
  const defenderCasualties = Math.ceil(spiesSent * (defenderAvgDS / attackerAvgKS));

  return {
    attackerCasualties,
    defenderCasualties,
  };
}