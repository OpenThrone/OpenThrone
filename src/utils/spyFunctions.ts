import { Fortifications, ItemTypes, UnitTypes } from "@/constants";
import UserModel from "@/models/Users";
import { Item, PlayerUnit, UnitType } from "@/types/typings";
import stringifyObj from "@/utils/numberFormatting";
import { calculateClandestineStrength, calculateDefenseAgainstAssassination, computeSpyCasualties } from "./attackFunctions";
import mtRand from "./mtrand";
import { SpyUserModel } from "@/models/SpyUser";
import { getAverageLevelAndHP } from "./units";

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

export class AssassinationResult {
  //attacker: UserModel;
  //defender: UserModel;
  spiesSent: number;
  spiesLost: number;
  unitsKilled: number;
  targetUnit: string;
  success: boolean;
  experienceGained: number;
  goldStolen: number;
  units: PlayerUnit[];

  constructor(attacker: UserModel, defender: UserModel, spies: number, target: UnitType | string = 'CITIZEN/WORKERS') {
    //this.attacker = JSON.parse(stringifyObj(attacker));  // deep copy
    //this.defender = JSON.parse(stringifyObj(defender));  // deep copy
    this.spiesSent = spies;
    this.spiesLost = 0;
    this.unitsKilled = 0;
    this.targetUnit = target;
    this.success = false;
    this.experienceGained = 0;
    this.goldStolen = 0;
    this.units = (target === 'CITIZEN/WORKERS'? defender.units.filter((unit)=> unit.type === 'CITIZEN' || unit.type === 'WORKER') : defender.units.filter((unit)=> unit.type === unit));
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

export function getSentryStrength(user: UserModel, spies: number): number {
  let strength = 0;
  let numSentries = 0;
  const sentryUnits = user.units.find((u) => u.type === 'SENTRY' && u.level === 1);
  if (sentryUnits) {
    numSentries = Math.min(sentryUnits.quantity, spies);
    if (numSentries === 0)
      return 0;
    const unitType = UnitTypes.find((unitType) => unitType.type === sentryUnits.type && unitType.level === 1);
    if (unitType) {
      strength += unitType.bonus * numSentries;
    }
    const sentryWeapons = user.items.filter((item) => item.type === 'WEAPON' && item.usage === sentryUnits.type.toString() && item.level === 1);
    if (sentryWeapons) {
      sentryWeapons.forEach((item) => {
        const bonus = ItemTypes.find((w) => w.level === item.level && w.usage === item.usage && w.type === item.type);
        strength += bonus?.bonus * Math.min(item.quantity, numSentries);
      });
    }
  }
  return strength;
}

export function getSpyStrength(user: UserModel, attacker: boolean, spies: number): number {
  let strength = 0;
  let numSpies = 0;
  const spyUnits = user.units.find((u) => (attacker ? u.type === 'SPY' : u.type === 'SENTRY') && u.level === 1);
  if (spyUnits) {
    numSpies = Math.min(spyUnits.quantity, spies);
    const unitType = UnitTypes.find((unitType) => unitType.type === spyUnits.type && unitType.level === 1);
    if (unitType) {
      strength += unitType.bonus * numSpies;
    }
    const spyWeapons = user.items.filter((item) => item.type === 'WEAPON' && item.usage === spyUnits.type.toString() && item.level === 1);
    spyWeapons.forEach((item) => {
      const bonus = ItemTypes.find((w) => w.level === item.level && w.usage === item.usage && w.type === item.type);
      strength += bonus?.bonus * Math.min(item.quantity, numSpies);
    });
  }
  return strength;
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
  //const defenderSpyUnit = new SpyUserModel(defender, spies * 10)

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
    console.log('Random Keys:', randomizedKeys, 'Intel Percentage:', intelPercentage, 'Intel Keys:', intelKeys)

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
  targetUnit: string
) => {
  const result = new AssassinationResult(attacker, defender, spiesSent, targetUnit);

  // Step 1: Initial infiltration through sentries
  // Spy score should be greater than sentry to win
  const isSuccessful = attacker.spy > defender.sentry;
  result.success = isSuccessful;

  // If the mission fails at the sentry check, deduct spies and return
  // it doesn't matter KS/DS, we're just going to cause the attack to lose 
  if (!isSuccessful) {
    result.spiesLost = spiesSent;
    // Remove the spies from the attacker's units
    let spiesToRemove = spiesSent;
    const assassinUnits = attacker.units.filter((u) => u.type === 'SPY' && u.level === 3);
    for (const unit of assassinUnits) {
      const qtyToRemove = Math.min(unit.quantity, spiesToRemove);
      unit.quantity -= qtyToRemove;
      spiesToRemove -= qtyToRemove;
      if (spiesToRemove <= 0) break;
    }
    // Let's exit because its already over
    return result;
  }

  // Step 2: Combat between attacker's spies and defender's sentries
  // We'll take x% of the Level3 SPY's KS/DS based on number of spies compared to spyLevels maximum amount.
  let spiesRemaining = spiesSent;
  let limiter = spiesRemaining / attacker.spyLimits.assass.perMission; // TODO: this should be the maximum assassins allowed per mission
  
  const { spyStrength: attackerKS, sentryStrength: attackerDS } = calculateClandestineStrength(attacker, 'SPY', limiter);
  const { spyStrength: defenderKS, sentryStrength: defenderDS } = calculateClandestineStrength(defender, 'SENTRY', limiter);

  // Get average HP for attacker spies and defender sentries
  const { averageHP: attackerSpyAvgHP } = getAverageLevelAndHP(attacker.units, 'SPY', 3);
  const { averageHP: defenderSentryAvgHP } = getAverageLevelAndHP(defender.units, 'SENTRY');

  console.log(`KillingStr: ${attackerKS} | DefenseStr: ${defenderDS}`)
  console.log(`KillingStr: ${defenderKS} | DefenseStr: ${attackerDS}`)

  // Calculate casualties using the adjusted formula
  const casualtyRateInitial = defenderKS / (defenderKS + attackerDS)/100;
  console.log(`casualtyRateInitial- ${casualtyRateInitial}`)
  const effectiveDefenderKSInitial = defenderKS * casualtyRateInitial;
  console.log(`effectiveDefenderKSInitial: ${effectiveDefenderKSInitial}`)
  console.log(`attackerSpyAvgHP ${attackerSpyAvgHP}`)
  const attackerSpyCasualties = Math.floor(effectiveDefenderKSInitial / attackerSpyAvgHP * limiter);
  console.log(`attackerSpyCasualties: ${attackerSpyCasualties}`)
  const killRateInitial = attackerKS / (attackerKS + defenderDS);
  const effectiveAttackerKSInitial = attackerKS * killRateInitial;
  const defenderSentryCasualties = Math.floor(effectiveAttackerKSInitial / defenderSentryAvgHP);

  result.spiesLost += Math.min(spiesRemaining, attackerSpyCasualties);
  spiesRemaining -= Math.min(spiesRemaining, attackerSpyCasualties);

  console.log('spiesLost', result.spiesLost)
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
  limiter = spiesRemaining / attacker.unitTotals.assassins;

  const { spyStrength: attackerKS2, sentryStrength: attackerDS2 } = calculateClandestineStrength(attacker, 'SPY', limiter);

  let targetDefenseStats;
  let unitsKilled;
  let averageHP;

  if (targetUnit === 'WORKERS/CITIZENS') {
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
    const totalUnits = totalWorkers + totalCitizens || 1; // Avoid division by zero

    averageHP =
      ((workerAvgHP * totalWorkers) + (citizenAvgHP * totalCitizens)) / totalUnits;

    // Calculate units killed using the adjusted formula
    console.log('limiter', limiter)
    console.log('targetDefenseStats:', targetDefenseStats.defenseStrength)
    const killRate = attackerKS2 / ( targetDefenseStats.defenseStrength);
    const effectiveAttackerKS = attackerKS2 * (killRate * limiter);
    unitsKilled = Math.floor(effectiveAttackerKS / averageHP);

    result.unitsKilled = Math.ceil(Math.min(
      unitsKilled,
      totalWorkers + totalCitizens
    ));
  } else {
    targetDefenseStats = calculateDefenseAgainstAssassination(defender, targetUnit, limiter);

    // Calculate average HP for the target unit
    const { averageHP: targetUnitAvgHP } = getAverageLevelAndHP(defender.units, targetUnit);
    averageHP = targetUnitAvgHP || 1; // Avoid division by zero

    // Calculate units killed using the adjusted formula

    console.log('targetDefenseStats:', targetDefenseStats.defenseStrength)
    const killRate = attackerKS2 / (attackerKS2 + targetDefenseStats.defenseStrength);
    const effectiveAttackerKS = attackerKS2 * killRate;
    unitsKilled = Math.floor(effectiveAttackerKS / averageHP);

    result.unitsKilled = Math.min(
      unitsKilled,
      defender.unitTotals[targetUnit.toLowerCase()] || 0
    );
  }

  // Remove units killed from defender
  let unitsToRemove = result.unitsKilled;
  const targetUnits = defender.units.filter((u) =>
    targetUnit === 'WORKERS/CITIZENS'
      ? u.type === 'WORKER' || u.type === 'CITIZEN'
      : u.type === targetUnit
  );
  for (const unit of targetUnits) {
    const qtyToRemove = Math.min(unit.quantity, unitsToRemove);
    unit.quantity -= qtyToRemove;
    unitsToRemove -= qtyToRemove;
    if (unitsToRemove <= 0) break;
  }

  // Calculate additional casualties to attacker's spies from target units
  const targetKS = targetDefenseStats.killingStrength;
  const { averageHP: attackerSpyAvgHP2 } = getAverageLevelAndHP(attacker.units, 'SPY');

  const casualtyRate = targetKS / (targetKS + attackerDS2);
  const effectiveDefenderKS = targetKS * casualtyRate;
  const additionalSpyCasualties = Math.floor(effectiveDefenderKS / attackerSpyAvgHP2);

  result.spiesLost += Math.min(spiesRemaining, additionalSpyCasualties);
  spiesRemaining -= Math.min(spiesRemaining, additionalSpyCasualties);

  // Remove additional spies lost from attacker
  spiesToRemove = additionalSpyCasualties;
  for (const unit of assassinUnits) {
    const qtyToRemove = Math.min(unit.quantity, spiesToRemove);
    unit.quantity -= qtyToRemove;
    spiesToRemove -= qtyToRemove;
    if (spiesToRemove <= 0) break;
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
    const isSuccessful = attacker.spy > defender.sentry;
    const result = new InfiltrationResult(attacker, defender, spies);
    result.success = isSuccessful;
    result.spiesLost = isSuccessful ? 0 : spies;

    const { spyStrength: attackerKS, sentryStrength: attackerDS } = calculateClandestineStrength(attacker, 'SPY', 1);
    const { spyStrength: defenderKS, sentryStrength: defenderDS } = calculateClandestineStrength(defender, 'SENTRY', 1);
    const { attackerCasualties, defenderCasualties } = computeSpyCasualties(attackerKS, attackerDS, defenderKS, defenderDS, spies, defender.unitTotals.sentries, 1, 1);

    if (!isSuccessful) {
      attacker.units.filter((u) => u.type === 'SPY' && u.level === 1).forEach((u) => u.quantity = u.quantity - spies);
      const deathRiskFactor = Math.max(0, 1 - (attacker.spy / defender.sentry));

      let spiesLost = 0;
      for (let i = 0; i < spies; i++) {
        if (Math.random() < deathRiskFactor) {
          spiesLost++;
        }
      }
      result.spiesLost = spiesLost;
      return result
    } else {
      const startHP = result.defender.fortHitpoints;
      for (var i = 1; i <= spies; i++) {
        if (result.defender.fortHitpoints > 0) {
          if (result.attacker.spy / result.defender.sentry <= 0.05)
            result.defender.fortHitpoints -= Math.floor(mtRand(0, 2))
          else if (result.attacker.spy / result.defender.sentry > 0.05 && result.attacker.spy / result.defender.sentry <= 0.5)
            result.defender.fortHitpoints -= Math.floor(mtRand(3, 6));
          else if (result.attacker.spy / result.defender.sentry > 0.5 && result.attacker.spy / result.defender.sentry <= 1.3)
            result.defender.fortHitpoints -= Math.floor(mtRand(6, 16));
          else result.defender.fortHitpoints -= Math.floor(mtRand(12, 24));
          //}
          if (result.defender.fortHitpoints < 0) {
            result.defender.fortHitpoints = 0;
          }
        }
      }
      result.fortDmg += Number(startHP - result.defender.fortHitpoints);

      return result;
    }
  }