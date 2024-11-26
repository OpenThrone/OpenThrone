import { UnitTypes, ItemTypes, Fortifications } from "@/constants";
import UserModel from "@/models/Users";
import { BattleUnits, Fortification, ItemType } from "@/types/typings";
import mtRand from "./mtrand";
import { Record } from "aws-sdk/clients/cognitosync";
import BattleResult from "@/models/BattleResult";
import BattleSimulationResult from "@/models/BattleSimulationResult";

/**
 * Calculates the strength of a user's units.
 * @param user - The user whose units' killing strength will be calculated.
 * @param unitType - Either OFFENSE or DEFENSE.
 * @returns The total killing strength of the user's units.
 */
export function calculateStrength(user: UserModel, unitType: 'OFFENSE' | 'DEFENSE'): number {
  let strength = 0;
  const unitMultiplier = unitType === 'OFFENSE' ? (1 + parseInt(user.attackBonus.toString(), 10) / 100) :
    (1 + parseInt(user.defenseBonus.toString(), 10) / 100);

  user.units.filter((u) => u.type === unitType).forEach((unit) => {
    const unitInfo = UnitTypes.find(
      (unitType) => unitType.type === unit.type && unitType.fortLevel <= user.getLevelForUnit(unit.type)
    );
    if (unitInfo) {
      strength += (unitInfo.bonus || 0) * unit.quantity;
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
        strength += itemInfo.bonus * usableQuantity;
        itemCounts[item.type] += usableQuantity;
      }
    });
  });

  if(unitType === 'DEFENSE') 

  if (unitType === 'DEFENSE' && strength === 0) {
    user.units.filter((u) => u.type === 'WORKER' || u.type === 'CITIZEN' || u.type === 'SENTRY' || u.type === 'SPY').forEach((unit) => {
      const unitInfo = UnitTypes.find(
        (unitType) => unitType.type === unit.type
      );
      if (unitInfo) {
        strength += Math.max((unitInfo.bonus * .3), Math.min((unitInfo.bonus * .3),0)) * unit.quantity;
      }
    })
  }

  strength *= unitMultiplier;

  return Math.ceil(strength);
}

export function calculateClandestineStrength(user: UserModel, unitType: 'SPY' | 'SENTRY', spiesSent: number, spyID?: number): {spyStrength: number, sentryStrength: number} {
  let strength = 0;
  let KS = 0;
  let DS = 0;

  const unitMultiplier = 1 + parseInt(((unitType === 'SPY' ? user.spyBonus.toString() : user.sentryBonus.toString())), 10) / 100;
  user.units.filter((u) => u.type === unitType).forEach((unit) => {
    const unitInfo = UnitTypes.find(
      (unitType) => unitType.type === unit.type && unitType.fortLevel <= user.getLevelForUnit(unit.type) && (unitType.level === spyID || !spyID)
    );
    if(unitInfo) {
      KS += (unitInfo.killingStrength || 0) * Math.min(unit.quantity, spiesSent);
      DS += (unitInfo.defenseStrength || 0) * Math.min(unit.quantity, spiesSent);
    }

    const itemCounts: Record<ItemType, number> = { WEAPON: 0, HELM: 0, BOOTS: 0, BRACERS: 0, SHIELD: 0, ARMOR: 0 };
    if (unit.quantity === 0) return;

    user.items.filter((item) => item.usage === unit.type).forEach((item) => {
      itemCounts[item.type] = itemCounts[item.type] || 0;

      const itemInfo = ItemTypes.find(
        (w) => w.level === item.level && w.usage === unit.type && w.type === item.type
      );
      if (itemInfo) {
        const usableQuantity = Math.min(item.quantity, Math.min(unit.quantity, spiesSent) - itemCounts[item.type]);
        KS += itemInfo.killingStrength * usableQuantity;
        DS += itemInfo.defenseStrength * usableQuantity;
        itemCounts[item.type] += usableQuantity;
      }
    });
  })

  return {spyStrength: Math.ceil(KS), sentryStrength: Math.ceil(DS)};
}

export function newCalculateStrength(user: UserModel, unitType: 'OFFENSE' | 'DEFENSE', includeCitz: boolean = false, fortBoost: number = 0): { killingStrength: number, defenseStrength: number } {
  let KS = 0;
  let DS = 0;
  const unitMultiplier = unitType === 'OFFENSE' ? (1 + parseInt(user.attackBonus.toString(), 10) / 100) :
    (1 + parseInt(user.defenseBonus.toString(), 10) / 100);

  user.units.filter((u) => u.type === unitType).forEach((unit) => {
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

  if (unitType === 'DEFENSE' && includeCitz) {

    user.units.filter((u) => u.type === 'WORKER' || u.type === 'CITIZEN' || u.type === 'SENTRY' || u.type === 'SPY').forEach((unit) => {
      const unitInfo = UnitTypes.find(
        (unitType) => unitType.type === unit.type
      );
      if (unitInfo) {
        KS += unitInfo.killingStrength * unit.quantity;
        DS += unitInfo.defenseStrength * unit.quantity;
      }
    })
  }

  KS *= unitMultiplier;
  DS *= unitMultiplier;

  return { killingStrength: Math.ceil(KS), defenseStrength: Math.ceil(DS) };
}

/**
 * Computes the amplification factor based on the target population.
 * @param targetPop The target population.
 * @returns The amplification factor.
 */
export function computeAmpFactor(targetPop: number): number {
  let ampFactor = 0.4;

  if (targetPop <= 1000) {
    ampFactor *= 1.6;
  } else if (targetPop <= 5000) {
    ampFactor *= 1.5;
  } else if (targetPop <= 10000) {
    ampFactor *= 1.35;
  } else if (targetPop <= 50000) {
    ampFactor *= 1.2;
  } else if (targetPop <= 100000) {
    ampFactor *= 0.95;
  } else if (targetPop <= 150000) {
    ampFactor *= 0.75;
  }

  return ampFactor;
}

/**
 * Calculates a level factor based on the defender's level.
 * levels less than 10 get more protection, but levels 10-15 get less protection.
 * @param defenderLevel - The level of the defender.
 * @returns The level factor.
  */
function calculateDefenderLevelFactor(defenderLevel: number): number {
  if (defenderLevel >= 15) {
    return 1; // Full loot potential
  } else if (defenderLevel < 10) {
    // Scale between 0.5 (50%) at level 1 to 0.75 (75%) at level 9
    return 0.5 + (defenderLevel - 1) * ((0.75 - 0.5) / 8);
  } else {
    // Scale between 0.75 (75%) at level 10 to 1 (100%) at level 15
    return 0.75 + (defenderLevel - 10) * ((1 - 0.75) / 5);
  }
}


/**
 * Calculates the loot that the attacker will receive from the defender.
 * @param attacker - The attacking user.
 * @param defender - The defending user.
 * @param turns - The number of turns taken in the battle.
 * @returns The amount of loot that the attacker will receive.
 */
export function calculateLoot(attacker: UserModel, defender: UserModel, turns: number): bigint {
  const uniformFactor = mtRand(90, 99) / 100; // Always between 0.90 and 0.99
  const turnFactor = mtRand(100 + turns * 10, 100 + turns * 20) / 371;
  const levelDifferenceFactor = Math.max(
    1,
    1 + Math.min(
      0.5,
      Math.min(5, Math.abs(defender.level - attacker.level)) * 0.05
    )
  );

  // New defender level factor
  const defenderLevelFactor = calculateDefenderLevelFactor(defender.level);

  const lootFactor = uniformFactor * turnFactor * levelDifferenceFactor * defenderLevelFactor;

  const defenderGold = BigInt(defender.gold);
  const calculatedLoot = Number(defenderGold) * lootFactor;
  let loot = BigInt(Math.floor(calculatedLoot));
  loot = loot < BigInt(0) ? BigInt(0) : loot;
  return loot > defenderGold ? defenderGold : loot;
}





/**
 * Computes the unit factor based on the ratio of units between two players.
 * @param unitsA - The number of units for player A.
 * @param unitsB - The number of units for player B.
 * @returns The unit factor.
 */
export const computeUnitFactor = (unitsA: number, unitsB: number): number => {
  const factor = unitsA / unitsB;
  return Math.min(Math.max(factor, 0.1), 4.0);
}

/**
 * Computes the base value for casualties based on the given ratio.
 * @param ratio - The ratio of attacking units to defending units.
 * @returns The base value for casualties.
 */
export function computeBaseValue(ratio) {
  let baseValue;

  if (ratio >= 5) {
    baseValue = mtRand(0.0015, 0.0018);
  } else if (ratio >= 4) {
    baseValue = mtRand(0.00115, 0.0013);
  } else if (ratio >= 3) {
    baseValue = mtRand(0.001, 0.00125);
  } else if (ratio >= 2) {
    baseValue = mtRand(0.0009, 0.00105);
  } else if (ratio >= 1) {
    baseValue = mtRand(0.00085, 0.00095);
  } else if (ratio >= 0.5) {
    baseValue = mtRand(0.0005, 0.0006);
  } else {
    baseValue = mtRand(0.0004, 0.00045);
  }

  return baseValue;

}

/**
 * Computes the number of casualties based on the given ratio, population, amplification factor, and unit factor.
 * @param ratio - The ratio of attacking units to defending units.
 * @param population - The population of the defending units.
 * @param ampFactor - The amplification factor.
 * @param unitFactor - The unit factor.
 * @returns The number of casualties.
 */
/*
export function computeCasualties(
  attackerKS: number,
  defenderDS: number,
  defenderKS: number,
  attackerDS: number,
  attackerPop: number,
  defenderPop: number,
  ampFactor: number,
  defenseProportion: number,
  fortHitpoints?: number,
  defenderStrength?: number,
): { attackerCasualties: number, defenderCasualties: number } {
  let attackerBaseValue: number;
  let defenderBaseValue: number;

  const offenseToDefenseRatio = attackerKS / (defenderDS ? defenderDS : 1);
  const counterAttackRatio = attackerDS === 0 ? 1 : defenderKS / attackerDS;
  
  // Determine base value for attacker casualties based on defense KS vs attacker DS
  attackerBaseValue = computeBaseValue(counterAttackRatio);

  // Determine base value for defender casualties based on attacker KS vs defender DS
  defenderBaseValue = computeBaseValue(offenseToDefenseRatio);

  // Adjust casualties based on fortification and defender's defense strength
  let fortificationMultiplier = 1;
  if (fortHitpoints !== undefined && defenderStrength !== undefined) {
    fortificationMultiplier = defenderStrength === 0 && fortHitpoints > 0 ? 1.5 : 1;
  }

  // Compute casualties considering all factors
  let attackerCasualties = Math.round(
    attackerBaseValue * ampFactor * ((attackerPop / defenderPop)*counterAttackRatio) * defenderPop * fortificationMultiplier
  );

  let defenderCasualties = Math.round(
    defenderBaseValue * ampFactor * ((defenderPop / attackerPop)* offenseToDefenseRatio) * attackerPop * fortificationMultiplier
  );

  // Cap casualties to ensure they do not exceed a certain percentage of the population
  const maxAttackerCasualties = attackerPop * .24;
  const maxDefenderCasualties = defenderPop * .24;

  // Floor the casualties to make sure it's a whole number
  attackerCasualties = Math.floor(Math.min(attackerCasualties, maxAttackerCasualties));
  defenderCasualties = Math.floor(Math.min(defenderCasualties, maxDefenderCasualties));

  // Adjust casualties based on the proportion of defense units
  if (defenseProportion <= 0.25 && defenseProportion > 0) {
    defenderCasualties = Math.floor(defenderCasualties * 1.5); // Increase the defender casualties by 50%
  }

  return { attackerCasualties, defenderCasualties };
}*/

export function computeSpyCasualties(
  attackerKS: number,
  defenderDS: number,
  defenderKS: number,
  attackerDS: number,
  attackerPop: number,
  defenderPop: number,
  ampFactor: number,
  defenseProportion: number
): { attackerCasualties: number, defenderCasualties: number } {

  let attackerBaseValue: number;
  let defenderBaseValue: number;
  const offenseToDefenseRatio = attackerKS / (defenderDS ? defenderDS : 1);
  const counterAttackRatio = defenderKS / (attackerDS ? attackerDS : 1);

  // Determine base value for attacker casualties based on defense KS vs attacker DS
  attackerBaseValue = computeBaseValue(counterAttackRatio) * 1000;

  // Determine base value for defender casualties based on attacker KS vs defender DS
  defenderBaseValue = computeBaseValue(offenseToDefenseRatio) * 1000;

  let attackerCasualties = Math.floor(
    attackerBaseValue * Math.random() * counterAttackRatio * defenderPop
  );
  let defenderCasualties = Math.floor(
    defenderBaseValue * Math.random() * offenseToDefenseRatio * attackerPop
  );
  return { attackerCasualties, defenderCasualties };
}

export function newComputeCasualties(
  attackerKS: number,
  defenderDS: number,
  defenderKS: number,
  attackerDS: number,
  attackerPop: number,
  defenderPop: number,
  ampFactor: number,
  defenseProportion: number,
  fortHitpoints?: number,
): { attackerCasualties: number, defenderCasualties: number } {
  let attackerBaseValue: number;
  let defenderBaseValue: number;

  const offenseToDefenseRatio = attackerKS / (defenderDS ? defenderDS : 1);
  const counterAttackRatio =  defenderKS / (attackerDS ? attackerDS : 1);

  // Determine base value for attacker casualties based on defense KS vs attacker DS
  attackerBaseValue = computeBaseValue(counterAttackRatio);

  // Determine base value for defender casualties based on attacker KS vs defender DS
  defenderBaseValue = computeBaseValue(offenseToDefenseRatio);

  // Adjust casualties based on fortification and defender's defense strength
  let fortificationMultiplier = 1;
  if (fortHitpoints !== undefined) {
    fortificationMultiplier = defenderDS === 0 && fortHitpoints > 0 ? 1.5 : 1;
  }

  // Compute casualties considering all factors
  let attackerCasualties = Math.round(
    attackerBaseValue * ampFactor * counterAttackRatio * defenderPop * fortificationMultiplier
  );

  let defenderCasualties = Math.round(
    defenderBaseValue * ampFactor * offenseToDefenseRatio * attackerPop * fortificationMultiplier
  );

  //console.log('defenderCasualties', defenderCasualties, 'attackerCasualties', attackerCasualties, 'attackerBaseValue', attackerBaseValue, 'defenderBaseValue', defenderBaseValue, 'ampFactor', ampFactor, 'attackerPop', attackerPop, 'defenderPop', defenderPop, 'fortificationMultiplier', fortificationMultiplier, 'defenseProportion', defenseProportion, 'fortHitpoints', fortHitpoints, 'defenderStrength', defenderStrength, 'counterAttackRatio', counterAttackRatio, 'offenseToDefenseRatio', offenseToDefenseRatio)
  // Cap casualties to ensure they do not exceed a certain percentage of the population
  const maxAttackerCasualties = (attackerCasualties / attackerPop >= .75 ? attackerPop : attackerPop * .05);
  const maxDefenderCasualties = (defenderCasualties / defenderPop >= .75 ? defenderPop : defenderPop * .05);

  // Floor the casualties to make sure it's a whole number
  attackerCasualties = Math.floor(Math.min(attackerCasualties, maxAttackerCasualties));
  defenderCasualties = Math.floor(Math.min(defenderCasualties, maxDefenderCasualties));

  // Adjust casualties based on the proportion of defense units
  if (defenseProportion <= 0.25 && defenseProportion > 0) {
    defenderCasualties = Math.floor(defenderCasualties * 1.5); // Increase the defender casualties by 50%
  }

  return { attackerCasualties, defenderCasualties };
}

export function getFortificationBoost(fortHitpoints: number, fortification: Fortification): number {
  return (fortHitpoints / fortification.hitpoints) *
    fortification?.defenseBonusPercentage;
}

export function simulateBattle(
  attacker: UserModel,
  defender: UserModel,
  attackTurns: number
): any {
  const result = new BattleResult(attacker, defender);
  // Ensure attack_turns is within [1, 10]
  attackTurns = Math.max(1, Math.min(attackTurns, 10));

  const fortification = Fortifications[defender.fortLevel || 0];
  if (!fortification) {
    return { status: 'failed', message: 'Fortification not found' };
  }
  let { fortHitpoints } = defender;

  for (let turn = 1; turn <= attackTurns; turn++) {
    //const fortDefenseBoost = getFortificationBoost(fortHitpoints, fortification);

    const totalPopulation = defender.unitTotals.citizens + defender.unitTotals.workers + defender.unitTotals.defense;
    const { killingStrength: attackerKS, defenseStrength: attackerDS } = newCalculateStrength(attacker, 'OFFENSE', false, 0);
    const { killingStrength: defenderKS, defenseStrength: defenderDS } = newCalculateStrength(defender, 'DEFENSE', defender.unitTotals.defense / totalPopulation >= 0.25 ? false : true);


    const TargetPop = Math.max(
      (defender.unitTotals.defense / totalPopulation >= 0.25 ? defender.unitTotals.defense : defender.unitTotals.defense + (defender.unitTotals.citizens + defender.unitTotals.workers) * 0.25),
      0
    );
    const AttackPop = attacker.unitTotals.offense;
    const AmpFactor = computeAmpFactor(TargetPop);
    const offenseUnits = filterUnitsByType(attacker.units, 'OFFENSE');
    const defenseUnits = filterUnitsByType(defender.units, 'DEFENSE');
    const citizenUnits = filterUnitsByType(defender.units, 'CITIZEN');
    const workerUnits = filterUnitsByType(defender.units, 'WORKER');

    // Calculate the proportion of defense units for the defender
    const defenderDefenseProportion = defender.unitTotals.defense / totalPopulation;

    // Compute casualties for both attacker and defender
    const { attackerCasualties, defenderCasualties } = newComputeCasualties(
      attackerKS,
      defenderDS,
      defenderKS,
      attackerDS,
      AttackPop,
      TargetPop,
      AmpFactor,
      defenderDefenseProportion,
      fortHitpoints
    );

    // Attack fort first
    if (fortHitpoints > 0) {
      if (attackerKS / defenderDS <= 0.05)
        fortHitpoints -= Math.floor(mtRand(0, 1))
      else if (attackerKS / defenderDS > 0.05 && attackerKS / defenderDS <= 0.5)
        fortHitpoints -= Math.floor(mtRand(0, 3));
      else if (attackerKS / defenderDS > 0.5 && attackerKS / defenderDS <= 1.3)
        fortHitpoints -= Math.floor(mtRand(3, 8));
      else fortHitpoints -= Math.floor(mtRand(6, 12));
      //}
      if (fortHitpoints < 0) {
        fortHitpoints = 0;
      }
    }

    if (Math.abs(defender.level - attacker.level) <= 5 || Math.abs(attacker.level - defender.level) <= 5) {
      
      // Distribute casualties among defense units if fort is destroyed
      if (fortHitpoints == 0 && defenderDefenseProportion < 0.25) {
        const combinedUnits = [
          ...defenseUnits,
          ...citizenUnits,
          ...workerUnits
        ];
        result.Losses.Defender.units.push(...result.distributeCasualties(combinedUnits, defenderCasualties));
      }  else {
        result.Losses.Defender.units.push(...result.distributeCasualties(defenseUnits, defenderCasualties));
      }

      result.Losses.Attacker.units.push(...result.distributeCasualties(offenseUnits, attackerCasualties));
      // Update total losses
      result.Losses.Defender.total = result.Losses.Defender.units.reduce((sum, unit) => sum + unit.quantity, 0);
      result.Losses.Attacker.total = result.Losses.Attacker.units.reduce((sum, unit) => sum + unit.quantity, 0);
      result.strength.push({
        'turn': turn,
        'attackerKS': attackerKS,
        'defenderDS':defenderDS,
        'defenderKS':defenderKS,
        'attackerDS':attackerDS,
      });
    } 
      

    
    result.fortHitpoints = Math.floor(fortHitpoints);
    result.turnsTaken = turn;
    result.experienceResult = computeExperience(
      attacker,
      defender,
      attacker.offense / (defender.defense ? defender.defense : 1)
    );

    // Breaking the loop if one side has no units left
    if (attacker.unitTotals.offense <= 0) {
      break;
    }
  }

  result.pillagedGold = calculateLoot(attacker, defender, attackTurns);
  const BaseXP = 1000;
  const levelDifference = Math.abs(attacker.level - defender.level);
  const LevelDifferenceBonus = levelDifference > 0 ? levelDifference * 0.05 * BaseXP : 0;
  const FortDestructionBonus = defender.fortHitpoints <= 0 ? 0.5 * BaseXP : 0;
  const TurnsUsedMultiplier = attackTurns / 10;
  let XP = BaseXP + LevelDifferenceBonus + FortDestructionBonus;
  XP *= TurnsUsedMultiplier;
  const isAttackerWinner = result.experienceResult.Result === 'Win';
  result.experienceResult.Experience.Attacker += (isAttackerWinner ? XP * (75 / 100) : XP * (25 / 100)) + result.experienceResult.Experience.Attacker;
  result.experienceResult.Experience.Defender += (isAttackerWinner ? XP * (25 / 100) : XP * (75 / 100)) + result.experienceResult.Experience.Defender;
  return result;
}

/**
 * Filters an array of BattleUnits by a given type.
 * @param units - The array of BattleUnits to filter.
 * @param type - The type of BattleUnit to filter by.
 * @returns An array of BattleUnits that match the given type.
 */
export function filterUnitsByType(units: BattleUnits[], type: string): BattleUnits[] {
  return units.filter((unit) => unit.type === type);
}

function computeExperience(
  attacker: UserModel,
  defender: UserModel,
  offenseToDefenseRatio: number
): BattleSimulationResult {
  const result = new BattleSimulationResult();

  const DefUnitRatio =
    defender.unitTotals.defense / Math.max(defender.population, 1);
  let OffUnitRatio = attacker.unitTotals.offense / attacker.population;
  if (OffUnitRatio > 0.1) {
    OffUnitRatio = 0.1;
  }

  let PhysOffToDefRatio = offenseToDefenseRatio;
  let PhysDefToOffRatio = 1 / PhysOffToDefRatio;
  if (PhysDefToOffRatio < 0.3) {
    PhysDefToOffRatio = 0.3;
  }
  if (PhysOffToDefRatio < 0.3) {
    PhysOffToDefRatio = 0.3;
  }

  const AmpFactor = mtRand(97, 103) / 100;
  if (attacker.offense > defender.defense) {
    // Attacker Wins
    result.Result = 'Win';
    result.Experience.Attacker = Math.round(
      (140 + PhysDefToOffRatio * 220 + OffUnitRatio * 100) * AmpFactor
    );
    result.Experience.Defender = Math.round(
      (20 + PhysDefToOffRatio * 40 + DefUnitRatio * 15) * AmpFactor
    );
  } else {
    // Defender Wins
    result.Result = 'Lost';
    result.Experience.Attacker = Math.round(
      (80 + PhysOffToDefRatio * 50 + OffUnitRatio * 25) * AmpFactor
    );
    result.Experience.Defender = Math.round(
      (30 + PhysOffToDefRatio * 45 + DefUnitRatio * 20) * AmpFactor
    );
  }

  return result;
}