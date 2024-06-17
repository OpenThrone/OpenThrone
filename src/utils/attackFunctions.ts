import { UnitTypes, ItemTypes } from "@/constants";
import UserModel from "@/models/Users";
import { Fortification, ItemType } from "@/types/typings";
import mtRand from "./mtrand";

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

/**
 * Computes the amplification factor based on the target population.
 * @param targetPop The target population.
 * @returns The amplification factor.
 */
export function computeAmpFactor(targetPop: number): number {
  let ampFactor = 0.4;

  const breakpoints = [
    { limit: 1000, factor: 1.6 },
    { limit: 5000, factor: 1.5 },
    { limit: 10000, factor: 1.35 },
    { limit: 50000, factor: 1.2 },
    { limit: 100000, factor: 0.95 },
    { limit: 150000, factor: 0.75 },
  ];

  for (const bp of breakpoints) {
    if (targetPop <= bp.limit) {
      ampFactor *= bp.factor;
      break;
    }
  }

  return ampFactor;
}

/**
 * Computes the attack turns based on the user's population.
 * @param user The user whose attack turns will be computed.
 * @returns The number of attack turns.
 */
export function calculateLoot(attacker: UserModel, defender: UserModel, turns: number): bigint {
  const uniformFactor = mtRand(90, 99) / 100;
  const turnFactor = mtRand(100 + turns * 10, 100 + turns * 20) / 100;
  const levelDifferenceFactor = 1 + Math.min(0.5, (defender.level - attacker.level) * 0.05);
  const lootFactor = uniformFactor * turnFactor * levelDifferenceFactor;

  let defenderGold = BigInt(defender.gold);
  let calculatedLoot = Number(defenderGold) * lootFactor;
  let loot = BigInt(Math.floor(calculatedLoot));
  let maxUserGoldLoot = defenderGold * BigInt(75) / BigInt(100);

  return loot > maxUserGoldLoot ? maxUserGoldLoot : loot;
}


/**
 * Computes the attack turns based on the user's population.
 * @param user The user whose attack turns will be computed.
 * @returns The number of attack turns.
 */
export const computeUnitFactor = (unitsA: number, unitsB: number): number => {
  const factor = unitsA / unitsB;

  //return Math.min(Math.max(factor, 0.5), 4.0);
  return Math.min(Math.max(factor, 0.1), 4.0);
}

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

  console.log('defenderPop: ', defenderPop, 'attackerPop: ', attackerPop, 'attackerBaseValue: ', attackerBaseValue, 'defenderBaseValue: ', defenderBaseValue, 'ampFactor: ', ampFactor, 'fortificationMultiplier: ', fortificationMultiplier)
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
}


export function getKillingStrength(user: UserModel, attacker: boolean): number {
  return calculateStrength(user, attacker ? 'OFFENSE' : 'DEFENSE');
}

export function getDefenseStrength(user: UserModel, defender: boolean, fortBoost: number): number {
  return calculateStrength(user, defender ? 'DEFENSE' : 'OFFENSE') * (1 + (fortBoost / 100));
}

export function getFortificationBoost(fortHitpoints: number, fortification: Fortification): number {
  return (fortHitpoints / fortification.hitpoints) *
    fortification?.defenseBonusPercentage;
}