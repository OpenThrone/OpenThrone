import { UnitTypes, ItemTypes, Fortifications } from "@/constants";
import UserModel from "@/models/Users";
import { BattleUnits, Fortification, ItemType } from "@/types/typings";
import mtRand from "./mtrand";
import BattleResult from "@/models/BattleResult";
import BattleSimulationResult from "@/models/BattleSimulationResult";
import console from "console";

const OFFENSE = 'OFFENSE';
const DEFENSE = 'DEFENSE';

const BATTLE_CONSTANTS = {
  MAX_TURNS: 10,
  FORT_CRITICAL_THRESHOLD: 0.3,
  LOW_DEFENSE_RATIO: 0.25,
  BASE_STAMINA_DROP: 0.9,
  MAX_LEVEL_DIFFERENCE: 5,
  BASE_XP: 1000,
  STAMINA_MULTIPLIERS: {
    EARLY_PHASE: 1.0,
    MID_PHASE: 0.85,
    LATE_PHASE: 0.7,
    CRITICAL_PHASE: 0.5,
    REINFORCEMENT_PHASE: 0.6
  }
} as const;

/* 
 * First lets get the base Attacker and Defender KS/DS.
 * If defender's defense units are less than the critical threshold (25%) then we start killing citizens/workers at a low amount
 * If the fortHP is less than the critical threshold (30%), with respect to the defender's defense unit, kill more citizens as they get caught up in the chaos
 * If fortHP is less than critical, there's alot of defense units, and its turns 1-5 then we'd expect few but more than 0, citizens/workers caught up in the chaos
 * If the fortHP is less than the critical threshold and we're on turns 6-10 then start adding reinforcements from the defender's Offense units but they are nerfed
 * If the forthp is ever 0, then massive casualties of citizens/workers
 */
export async function simulateBattle(
  attacker: UserModel,
  defender: UserModel,
  initialFortHP: number,
  totalTurns: number,
  debug: boolean = false
): Promise<BattleResult> {
  if(debug) console.log('Simulating battle between', attacker.displayName, 'and', defender.displayName);
  let fortHP = initialFortHP;
  let attackerStamina = 1.0;
  const battleResult = new BattleResult(attacker, defender);
  if (debug) console.log('Initial Fort HP:', fortHP);
  if (debug) console.log('Attacker Units:', attacker.units.filter((u) => u.type === 'OFFENSE'));
  if(debug) console.log('Defender Units:', defender.units.filter((u)=>u.type !== 'SPY' || u.type !== 'SENTRY'));
  // Pre-calculate base strengths and population stats
  const baseAttackerKS = calculateStrength(attacker, 'OFFENSE').killingStrength;
  const baseAttackerDS = calculateStrength(attacker, 'OFFENSE').defenseStrength;

  if (debug) console.log(`Base Attacker KS: ${baseAttackerKS} DS: ${baseAttackerDS}`);
  // Track unit totals separately for each turn calculation
  let attackerOffenseRemaining = attacker.unitTotals.offense;
  let defenderDefenseRemaining = defender.unitTotals.defense;
  let defenderCitizensRemaining = defender.unitTotals.citizens;
  let defenderWorkersRemaining = defender.unitTotals.workers;
  let defenderOffenseRemaining = defender.unitTotals.offense;

  const defenderTotalPop = defenderDefenseRemaining + defenderCitizensRemaining +
    defenderWorkersRemaining + defenderOffenseRemaining;

  let defenderDefenseRatio = defenderDefenseRemaining / defenderTotalPop;

  if (debug) console.log('Defender Total Population:', defenderTotalPop);
  if (debug) console.log('Defender Defense Ratio:', defenderDefenseRatio);
  if (debug) {
    if(defenderDefenseRatio < .25) {
      console.log('Defender Defense Ratio is less than 25%!');
    }
  }

  for (let turn = 1; turn <= totalTurns; turn++) {
    if (debug) console.log(`Turn ${turn} of ${totalTurns}`);
    if (debug) console.log(`Attacker Offense Units Remaining: ${attackerOffenseRemaining}`);
    if (debug) console.log(`Defender Defense Units Remaining: ${defenderDefenseRemaining}`);
    if (debug) console.log(`Defender Citizens Remaining: ${defenderCitizensRemaining}`);
    if (debug) console.log(`Defender Workers Remaining: ${defenderWorkersRemaining}`);
    if (debug) console.log(`Defender Offense Units Remaining: ${defenderOffenseRemaining}`);
    if (debug) console.log(`Fort HP: ${fortHP}`);

    // --- Phase adjustments based on turn number and fort status ---
    let defenderEffectiveKS, defenderEffectiveDS;

    // Check if defense units are depleted to determine if we should include other units
    const defenseUnitsRemaining = defenderDefenseRemaining > 0;
    const shouldIncludeAllUnits = !defenseUnitsRemaining || fortHP === 0;
    if (debug) console.log('Should Include All Units:', shouldIncludeAllUnits);
    // Recalculate defender strength based on current state
    const currentDefenderStrength = calculateStrength(
      defender,
      'DEFENSE',
      shouldIncludeAllUnits
    );

    if(debug) console.log('Current Defender KS:', currentDefenderStrength.killingStrength);
    if(debug) console.log('Current Defender DS:', currentDefenderStrength.defenseStrength);

    if (turn <= 5) {
      // Early phase - adjust for fort critical status
      if (fortHP < 0.3 * Fortifications[defender.fortLevel].hitpoints) {
        if(debug) console.log('Fort HP is less than 30% of initial fort HP and is currently at', fortHP, 'out of', Fortifications[defender.fortLevel].hitpoints);
        const nerfFactor = calculateDefenseNerfFactor(turn, fortHP, initialFortHP);
        if(debug) console.log(`Nerf Factor due to less than 30%: ${nerfFactor}`);
        defenderEffectiveKS = currentDefenderStrength.killingStrength * nerfFactor;
        defenderEffectiveDS = currentDefenderStrength.defenseStrength * nerfFactor;
      } else {
        if(debug) console.log('No nerfs due to fort HP above 30%');
        defenderEffectiveKS = currentDefenderStrength.killingStrength;
        defenderEffectiveDS = currentDefenderStrength.defenseStrength;
      }
    } else {
      // Late phase - reinforcements possibly join
      if (fortHP < 0.3 * initialFortHP) {
        if (debug) console.log('Fort HP is less than 30% of initial fort HP and is currently at', fortHP, 'out of', initialFortHP);
        if(debug) console.log('Reinforcements are joining the battle');
        const reinforcementKS = calculateReinforcementModifier(turn);
        const recoveryFactor = calculateRecoveryFactor(turn);
        if (debug) console.log(`Reinforcement KS: ${reinforcementKS}, Recovery Factor: ${recoveryFactor}`);
        defenderEffectiveKS = (currentDefenderStrength.killingStrength + reinforcementKS) * recoveryFactor;
        defenderEffectiveDS = currentDefenderStrength.defenseStrength + calculateReinforcementModifier(turn);
        if (debug) console.log(`Defender KS: ${defenderEffectiveKS}, DS: ${defenderEffectiveDS}`);
      } else {
        if (debug) console.log('No reinforcements are joining the battle');
        defenderEffectiveKS = currentDefenderStrength.killingStrength;
        defenderEffectiveDS = currentDefenderStrength.defenseStrength;
      }
    }
    if (debug) console.log(`Defender KS: ${defenderEffectiveKS}, DS: ${defenderEffectiveDS}`);

    // --- Attacker adjustments ---
    if (debug) console.log('Calculate Stamina Drop for Attackers');
    const attackerStaminaDrop = calculateStaminaDrop(turn);
    if (debug) console.log(`Attacker's Stamina Drop Rate: ${attackerStaminaDrop}`);
    const attackerEffectiveKS = baseAttackerKS * attackerStamina * attackerStaminaDrop;
    const attackerEffectiveDS = baseAttackerDS * attackerStamina * attackerStaminaDrop;
    if (debug) {
      console.log(`Turn ${turn}: Final Attacker KS: ${attackerEffectiveKS}, DS: ${attackerEffectiveDS}`);
      console.log(`Turn ${turn}: Final Defender KS: ${defenderEffectiveKS}, DS: ${defenderEffectiveDS}`);
    }

    // --- Fort damage phase ---
    if (fortHP > 0) {
      if(debug) console.log('Fort HP is greater than 0, calculating fort damage');
      const fortDamage = calculateFortDamage(attackerEffectiveKS, defenderEffectiveDS, fortHP);
      fortHP = Math.max(fortHP - fortDamage, 0);
      if (debug) console.log(`Turn ${turn}: Fort HP: ${fortHP} (damage: ${fortDamage})`);
    }

    // --- Casualty Calculation ---
    // Calculate total defender population for this turn
    const currentDefenderPop = defenderDefenseRemaining + defenderCitizensRemaining +
      defenderWorkersRemaining + defenderOffenseRemaining;

    const { attackerCasualties, defenderCasualties } = newComputeCasualties(
      attackerEffectiveKS,
      defenderEffectiveDS,
      defenderEffectiveKS,
      attackerEffectiveDS,
      attackerOffenseRemaining,
      currentDefenderPop, // Use total defender population instead of just defense units
      computeAmpFactor(defenderTotalPop),
      defenderDefenseRatio,
      initialFortHP,
      fortHP // Pass current fort HP as the last parameter
    );

    if (debug) console.log(`Turn ${turn}: Calculating casualties - Attacker: ${attackerCasualties}, Defender: ${defenderCasualties}`);

    console.log(defender.level - attacker.level)
    // --- Update unit counts ---
    if (Math.abs(defender.level - attacker.level) <= BATTLE_CONSTANTS.MAX_LEVEL_DIFFERENCE) {
      await distributeCasualties({
        result: battleResult,
        attacker,
        defender,
        casualties: { attackerCasualties, defenderCasualties },
        fortHP,
        defenderDefenseProportion: defenderDefenseRatio,
        initialFortHP: initialFortHP
      });
      // Add this inside simulateBattle, just after the distributeCasualties call:
      if (debug) {
        console.log(`Turn ${turn}: Updated casualty totals - Attacker: ${battleResult.Losses.Attacker.total}, Defender: ${battleResult.Losses.Defender.total}`);
        console.log(`Turn ${turn}: Units remaining - Attacker: ${attackerOffenseRemaining}, Defender: Defense: ${defenderDefenseRemaining}, Citizens: ${defenderCitizensRemaining}, Workers: ${defenderWorkersRemaining}`);
      }

      // Update remaining units for next turn calculations
      attackerOffenseRemaining = Math.max(0, attackerOffenseRemaining - attackerCasualties);

      // Handle defender casualties distribution
      if (fortHP === 0) {
        // Fort is destroyed, determine how casualties are distributed
        // Distribute casualties proportionally across all population types
        const totalDefenderPop = defenderDefenseRemaining + defenderCitizensRemaining +
          defenderWorkersRemaining + defenderOffenseRemaining;

        if (totalDefenderPop > 0) {
          // Calculate proportional distribution
          const defenseRatio = defenderDefenseRemaining / totalDefenderPop;
          const citizenRatio = defenderCitizensRemaining / totalDefenderPop;
          const workerRatio = defenderWorkersRemaining / totalDefenderPop;
          const offenseRatio = defenderOffenseRemaining / totalDefenderPop;

          // Calculate casualties for each type
          const defenseCasualties = Math.min(Math.ceil(defenderCasualties * defenseRatio), defenderDefenseRemaining);
          const citizenCasualties = Math.min(Math.ceil(defenderCasualties * citizenRatio), defenderCitizensRemaining);
          const workerCasualties = Math.min(Math.ceil(defenderCasualties * workerRatio), defenderWorkersRemaining);
          const offenseCasualties = Math.min(Math.ceil(defenderCasualties * offenseRatio), defenderOffenseRemaining);

          // Apply casualties
          defenderDefenseRemaining = Math.max(0, defenderDefenseRemaining - defenseCasualties);
          defenderCitizensRemaining = Math.max(0, defenderCitizensRemaining - citizenCasualties);
          defenderWorkersRemaining = Math.max(0, defenderWorkersRemaining - workerCasualties);
          defenderOffenseRemaining = Math.max(0, defenderOffenseRemaining - offenseCasualties);

          if (debug) {
            console.log(`Turn ${turn}: Casualties distribution - Defense: ${defenseCasualties}, Citizens: ${citizenCasualties}, Workers: ${workerCasualties}, Offense: ${offenseCasualties}`);
          }
        }
      } else {
        // Fort still intact, only defense units take casualties
        defenderDefenseRemaining = Math.max(0, defenderDefenseRemaining - defenderCasualties);
      }

      // Recalculate defense ratio for next turn
      const remainingDefenderPop = defenderDefenseRemaining + defenderCitizensRemaining +
        defenderWorkersRemaining + defenderOffenseRemaining;
      defenderDefenseRatio = remainingDefenderPop > 0 ? defenderDefenseRemaining / remainingDefenderPop : 0;
    }

    // --- Record the state for this turn ---
    battleResult.strength.push({
      turn,
      attackerKS: attackerEffectiveKS,
      attackerDS: attackerEffectiveDS,
      defenderKS: defenderEffectiveKS,
      defenderDS: defenderEffectiveDS,
    });

    battleResult.fortHitpoints = fortHP;
    battleResult.turnsTaken = turn;

    // --- Update stamina for next turn ---
    attackerStamina = calculateStaminaModifier(turn);

    // --- Early Exit Conditions ---
    if (attackerOffenseRemaining <= 0) {
      // Attacker has no more offense units, battle ends
      if (debug) {
        console.log(`Turn ${turn}: Battle ended early - attacker has no more offense units.`);
      }
      break;
    }

    // Define valid targets for the defender
    const hasValidDefenderTargets = (
      // Defense units remain or fort is intact
      defenderDefenseRemaining > 0 || fortHP > 0 ||
      // Fort is destroyed, target citizens and workers
      (fortHP === 0 && (defenderCitizensRemaining > 0 || defenderWorkersRemaining > 0)) ||
      // As last resort, target offense units
      (fortHP === 0 && defenderDefenseRemaining <= 0 && defenderCitizensRemaining <= 0 &&
        defenderWorkersRemaining <= 0 && defenderOffenseRemaining > 0)
    );

    if (!hasValidDefenderTargets) {
      if (debug) {
        console.log(`Turn ${turn}: Battle ended early - no valid defender targets remain.`);
        console.log(`Defender Units Remaining - Defense: ${defenderDefenseRemaining}, Citizens: ${defenderCitizensRemaining}, Workers: ${defenderWorkersRemaining}, Offense: ${defenderOffenseRemaining}`);
      }
      break;
    }
  }

  // Finalize experience calculations and battle outcome
  finalizeBattleResult(battleResult, {
    attacker,
    defender,
    attackTurns: totalTurns,
    initialFortHP,
    currentFortHP: fortHP
  });

  return battleResult;
}

export function calculateDefenseNerfFactor(
  turn: number,
  currentFortHP: number,
  initialFortHP: number
): number {
  const fortDamageRatio = 1 - (currentFortHP / initialFortHP);
  const baseFactor = 0.7 + (0.3 * (1 - fortDamageRatio));
  const turnMultiplier = 1 - (turn * 0.05);
  return Math.max(0.5, baseFactor * turnMultiplier);
}


export function calculateStaminaDrop(turn: number): number {
  if (turn <= 3) return BATTLE_CONSTANTS.STAMINA_MULTIPLIERS.EARLY_PHASE;
  if (turn <= 7) return BATTLE_CONSTANTS.STAMINA_MULTIPLIERS.MID_PHASE;
  return BATTLE_CONSTANTS.STAMINA_MULTIPLIERS.LATE_PHASE;
}

export function calculateFortDamage(
  attackerKS: number,
  defenderDS: number,
  currentFortHP: number
): number {
  const ratio = attackerKS / (defenderDS || 1);
  let damageRange: [number, number];

  if (ratio <= 0.05) damageRange = [0, 1];
  else if (ratio <= 0.5) damageRange = [0, 3];
  else if (ratio <= 1.3) damageRange = [3, 8];
  else damageRange = [6, 12];

  const damage = Math.floor(mtRand(damageRange[0], damageRange[1]));
  return Math.max(damage, 0);
}

export function calculateBattleExperience(
  isAttackerWinner: boolean,
  levelDifference: number,
  attackTurns: number,
  fortDestroyed: boolean
): { attackerXP: number; defenderXP: number } {
  const baseXP = BATTLE_CONSTANTS.BASE_XP;
  const levelBonus = levelDifference > 0 ? levelDifference * 0.05 * baseXP : 0;
  const fortBonus = fortDestroyed ? 0.5 * baseXP : 0;
  const turnsMultiplier = attackTurns / BATTLE_CONSTANTS.MAX_TURNS;

  const totalXP = (baseXP + levelBonus + fortBonus) * turnsMultiplier;

  return {
    attackerXP: Math.round(isAttackerWinner ? totalXP * 0.75 : totalXP * 0.25),
    defenderXP: Math.round(isAttackerWinner ? totalXP * 0.25 : totalXP * 0.75)
  };
}

// calculates bonus multiplier based on the user’s bonus percentage.
function getUnitMultiplier(user: UserModel, unitType: 'OFFENSE' | 'DEFENSE'): number {
  const bonus = unitType === OFFENSE ? user.attackBonus : user.defenseBonus;
  return 1 + Number(bonus) / 100;
}

export function calculateStrength(
  user: UserModel,
  unitType: 'OFFENSE' | 'DEFENSE',
  includeCitz: boolean = false,
  fortBoost: number = 0
): { killingStrength: number; defenseStrength: number } {
  let killingStrength = 0;
  let defenseStrength = 0;
  const multiplier = getUnitMultiplier(user, unitType);

  // Process primary units
  user?.units?.filter(u => u.type === unitType).forEach(unit => {
    const unitInfo = UnitTypes.find(
      info => info.type === unit.type
    );
    if (!unitInfo) return;

    killingStrength += (unitInfo.killingStrength || 0) * unit.quantity;
    defenseStrength += (unitInfo.defenseStrength || 0) * unit.quantity;

    // Process items for this unit type
    if (unit.quantity === 0) return;

    const itemCounts: Record<ItemType, number> = {
      WEAPON: 0,
      HELM: 0,
      BOOTS: 0,
      BRACERS: 0,
      SHIELD: 0,
      ARMOR: 0,
    };

    user.items.filter(item => item.usage === unit.type).forEach(item => {
      const currentCount = itemCounts[item.type] || 0;
      const itemInfo = ItemTypes.find(
        info => info.usage === unit.type && info.type === item.type
      );
      if (!itemInfo) return;

      const usableQuantity = Math.min(item.quantity, unit.quantity - currentCount);
      killingStrength += itemInfo.killingStrength * usableQuantity;
      defenseStrength += itemInfo.defenseStrength * usableQuantity;
      itemCounts[item.type] = currentCount + usableQuantity;
    });
  });

  // For defense calculations, always include offense units if defense units are depleted
  const hasDefenseUnits = user.units.some(u => u.type === 'DEFENSE' && u.quantity > 0);
  const shouldIncludeOffense = unitType === DEFENSE && (!hasDefenseUnits || includeCitz);
  
  // Include citizens, workers, and other support units
  if (shouldIncludeOffense) {
    const supportTypes = ['WORKER', 'CITIZEN', 'SENTRY', 'SPY', 'OFFENSE'];
    user.units.filter(u => supportTypes.includes(u.type)).forEach(unit => {
      const unitInfo = UnitTypes.find(info => info.type === unit.type);
      if (unitInfo) {
        // Apply a reduced effectiveness for non-defense units in defense role
        const effectivenessMultiplier = unit.type === 'OFFENSE' ? 0.7 : 0.3;
        killingStrength += unitInfo.killingStrength * unit.quantity * effectivenessMultiplier;
        defenseStrength += unitInfo.defenseStrength * unit.quantity * effectivenessMultiplier;
      }
    });
  }

  return {
    killingStrength: Math.ceil(killingStrength * multiplier),
    defenseStrength: Math.ceil(defenseStrength * multiplier),
  };
}

export function computeAmpFactor(targetPop: number): number {
  const baseFactor = 0.4;
  if (targetPop <= 1000) return baseFactor * 1.6;
  if (targetPop <= 5000) return baseFactor * 1.5;
  if (targetPop <= 10000) return baseFactor * 1.35;
  if (targetPop <= 50000) return baseFactor * 1.2;
  if (targetPop <= 100000) return baseFactor * 0.95;
  if (targetPop <= 150000) return baseFactor * 0.75;
  return baseFactor;
}

function calculateDefenderLevelFactor(defenderLevel: number): number {
  if (defenderLevel >= 15) return 1; // full loot potential

  if (defenderLevel < 10) {
    // Scale between 50% at level 1 and 75% at level 9
    return 0.5 + (defenderLevel - 1) * ((0.75 - 0.5) / 8);
  }

  // Scale between 75% at level 10 and 100% at level 15
  return 0.75 + (defenderLevel - 10) * ((1 - 0.75) / 5);
}

export function calculateLoot(
  attacker: UserModel,
  defender: UserModel,
  turns: number
): bigint {
  const UNIFORM_MIN = 90;
  const UNIFORM_MAX = 99;
  const uniformFactor = mtRand(UNIFORM_MIN, UNIFORM_MAX) / 100;
  const turnLower = 100 + turns * 10;
  const turnUpper = 100 + turns * 20;
  const turnFactor = mtRand(turnLower, turnUpper) / 371;

  const levelDifference = Math.min(Math.abs(defender.level - attacker.level), 5);
  const levelDifferenceFactor = 1 + Math.min(0.5, levelDifference * 0.05);

  const defenderLevelFactor = calculateDefenderLevelFactor(defender.level);
  const lootFactor = uniformFactor * turnFactor * levelDifferenceFactor * defenderLevelFactor;

  const defenderGold = BigInt(defender.gold);
  const calculatedLoot = Number(defenderGold) * lootFactor;
  const loot = BigInt(Math.floor(calculatedLoot));
  return loot < BigInt(0)
    ? BigInt(0)
    : loot > defenderGold
      ? defenderGold
      : loot;
}

export function computeBaseValue(ratio: number): number {
  if (ratio >= 5) return mtRand(0.0015, 0.0018);
  if (ratio >= 4) return mtRand(0.00115, 0.0013);
  if (ratio >= 3) return mtRand(0.001, 0.00125);
  if (ratio >= 2) return mtRand(0.0009, 0.00105);
  if (ratio >= 1) return mtRand(0.00085, 0.00095);
  if (ratio >= 0.5) return mtRand(0.0005, 0.0006);
  return mtRand(0.0004, 0.00045);
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
  initialFortHP: number,
  fortHitpoints?: number
): { attackerCasualties: number; defenderCasualties: number } {
  // Calculate power ratios
  const offenseToDefenseRatio = attackerKS / (defenderDS || 1);
  const counterAttackRatio = defenderKS / (attackerDS || 1);

  // Base casualty values
  const attackerBaseValue = computeBaseValue(counterAttackRatio);
  const defenderBaseValue = computeBaseValue(offenseToDefenseRatio);

  // Adjust for battle phase and fortification status
  let phaseMultiplier = 1.0;
  
  // Fort status multipliers
  if (fortHitpoints !== undefined) {
    if (fortHitpoints === 0) {
      // Fort destroyed - higher casualties for defender
      phaseMultiplier = 2.5;
    } else if (fortHitpoints < initialFortHP * BATTLE_CONSTANTS.FORT_CRITICAL_THRESHOLD) {
      // Fort critically damaged - moderate casualties
      phaseMultiplier = 1.5;
    } else if (fortHitpoints < initialFortHP * 0.7) {
      // Fort damaged - slightly increased casualties
      phaseMultiplier = 1.2;
    }
  }
  
  // Defense proportion multiplier - low defense means higher casualties
  let defenseProportionMultiplier = 1.0;
  if (defenseProportion < BATTLE_CONSTANTS.LOW_DEFENSE_RATIO) {
    // Exponentially increase casualties as defense proportion decreases
    defenseProportionMultiplier = 1.0 + Math.pow((BATTLE_CONSTANTS.LOW_DEFENSE_RATIO - defenseProportion) * 4, 2);
  }

  // Calculate base casualties
  let attackerCasualties = Math.round(
    attackerBaseValue * ampFactor * counterAttackRatio * defenderPop
  );
  
  let defenderCasualties = Math.round(
    defenderBaseValue * ampFactor * offenseToDefenseRatio * attackerPop * phaseMultiplier * defenseProportionMultiplier
  );

  // Ensure minimum casualties based on strength difference
  if (fortHitpoints !== undefined && fortHitpoints === 0) {
    // Calculate strength difference factor
    const strengthDifference = Math.max(1, attackerKS / (defenderKS || 1));
    const minCasualties = Math.ceil(defenderPop * 0.005 * Math.min(5, strengthDifference));
    defenderCasualties = Math.max(defenderCasualties, minCasualties);
  }

  // Cap casualties to reasonable percentages of population
  const maxAttackerCasualties = Math.min(
    attackerPop * 0.05,  // Max 5% per turn
    attackerPop * 0.75   // Never more than 75% total
  );
  
  const maxDefenderCasualties = Math.min(
    defenderPop * 0.08,  // Max 8% per turn
    defenderPop * 0.75   // Never more than 75% total
  );

  attackerCasualties = Math.floor(Math.min(attackerCasualties, maxAttackerCasualties));
  defenderCasualties = Math.floor(Math.min(defenderCasualties, maxDefenderCasualties));
  
  return { attackerCasualties, defenderCasualties };
}

export function calculateStaminaModifier(turn: number): number {
  if (turn <= 3) return 1.0;       // Early phase - full stamina
  if (turn <= 7) return 0.85;      // Mid phase - slight fatigue
  return 0.7;                      // Late phase - significant fatigue
}

export function calculateReinforcementModifier(turn: number): number {
  if (turn <= 5) return 0;         // No reinforcements in early phase
  return Math.min((turn - 5) * 0.15, 0.5); // Up to 50% reinforcement bonus
}

export function calculateRecoveryFactor(turn: number): number {
  const baseRecovery = 0.8;
  const recoveryPerTurn = 0.05;
  return Math.min(baseRecovery + ((turn - 5) * recoveryPerTurn), 1.0);
}

async function distributeCasualties(params: {
  result: BattleResult;
  attacker: UserModel;
  defender: UserModel;
  casualties: { attackerCasualties: number; defenderCasualties: number };
  fortHP: number;
  defenderDefenseProportion: number;
  initialFortHP: number;
}): Promise<void> {
  const { result, attacker, defender, casualties, fortHP, defenderDefenseProportion, initialFortHP } = params;
  
  if (casualties.attackerCasualties <= 0 && casualties.defenderCasualties <= 0) {
    return; // No casualties to distribute
  }

  // Handle attacker casualties
  if (casualties.attackerCasualties > 0) {
    const offenseUnits = filterUnitsByType(attacker.units, 'OFFENSE');
    if (offenseUnits.length > 0) {
      const lostUnits = distributeUnitCasualties(offenseUnits, casualties.attackerCasualties);
      if (lostUnits.length > 0) {
        result.Losses.Attacker.units.push(...lostUnits);
        result.Losses.Attacker.total += lostUnits.reduce((sum, unit) => sum + unit.quantity, 0);
      }
    }
  }

  // Handle defender casualties
  if (casualties.defenderCasualties > 0) {
    let remainingCasualties = casualties.defenderCasualties;
    
    // First apply to defense units
    if (fortHP > 0 && fortHP < initialFortHP * BATTLE_CONSTANTS.FORT_CRITICAL_THRESHOLD) {
      // Fort is damaged, apply casualties to defense and support units
      const defenseUnits = filterUnitsByType(defender.units, 'DEFENSE');
      if (defenseUnits.length > 0) {
        const lostUnits = distributeUnitCasualties(defenseUnits, remainingCasualties);
        if (lostUnits.length > 0) {
          result.Losses.Defender.units.push(...lostUnits);
          result.Losses.Defender.total += lostUnits.reduce((sum, unit) => sum + unit.quantity, 0);
          remainingCasualties = 0; // All casualties applied
        }
      }
    } else {
      // Fort destroyed, apply casualties based on priority
      
      // First apply to defense units if available
      const defenseUnits = filterUnitsByType(defender.units, 'DEFENSE');
      if (defenseUnits.some(u => u.quantity > 0)) {
        const defenseLosses = distributeUnitCasualties(defenseUnits, remainingCasualties);
        if (defenseLosses.length > 0) {
          result.Losses.Defender.units.push(...defenseLosses);
          result.Losses.Defender.total += defenseLosses.reduce((sum, unit) => sum + unit.quantity, 0);
          remainingCasualties -= defenseLosses.reduce((sum, unit) => sum + unit.quantity, 0);
        }
      }
      
      // If defense ratio is low or no defense units, apply to citizens and workers
      if (remainingCasualties > 0 && defenderDefenseProportion < BATTLE_CONSTANTS.LOW_DEFENSE_RATIO) {
        const citizens = filterUnitsByType(defender.units, 'CITIZEN');
        if (citizens.some(u => u.quantity > 0)) {
          const citizenLosses = distributeUnitCasualties(citizens, remainingCasualties);
          if (citizenLosses.length > 0) {
            result.Losses.Defender.units.push(...citizenLosses);
            result.Losses.Defender.total += citizenLosses.reduce((sum, unit) => sum + unit.quantity, 0);
            remainingCasualties -= citizenLosses.reduce((sum, unit) => sum + unit.quantity, 0);
          }
        }
        
        // Apply remaining casualties to workers
        if (remainingCasualties > 0) {
          const workers = filterUnitsByType(defender.units, 'WORKER');
          if (workers.some(u => u.quantity > 0)) {
            const workerLosses = distributeUnitCasualties(workers, remainingCasualties);
            if (workerLosses.length > 0) {
              result.Losses.Defender.units.push(...workerLosses);
              result.Losses.Defender.total += workerLosses.reduce((sum, unit) => sum + unit.quantity, 0);
              remainingCasualties -= workerLosses.reduce((sum, unit) => sum + unit.quantity, 0);
            }
          }
        }
        
        // Finally, apply any remaining casualties to offense units as last resort
        if (remainingCasualties > 0) {
          const offenseUnits = filterUnitsByType(defender.units, 'OFFENSE');
          if (offenseUnits.some(u => u.quantity > 0)) {
            const offenseLosses = distributeUnitCasualties(offenseUnits, remainingCasualties);
            if (offenseLosses.length > 0) {
              result.Losses.Defender.units.push(...offenseLosses);
              result.Losses.Defender.total += offenseLosses.reduce((sum, unit) => sum + unit.quantity, 0);
            }
          }
        }
      }
    }
  }
}

// Helper function to distribute casualties across units
function distributeUnitCasualties(units: BattleUnits[], totalCasualties: number): BattleUnits[] {
  const lostUnits: BattleUnits[] = [];
  let remainingCasualties = totalCasualties;
  
  for (const unit of units) {
    if (unit.quantity <= 0 || remainingCasualties <= 0) continue;
    
    const casualties = Math.min(unit.quantity, remainingCasualties);
    if (casualties > 0) {
      lostUnits.push({
        type: unit.type,
        quantity: casualties
      });
      unit.quantity -= casualties;
      remainingCasualties -= casualties;
    }
  }
  
  return lostUnits;
}


export function filterUnitsByType(units: BattleUnits[], type: string): BattleUnits[] {
  return units.filter(unit => unit.type === type);
}

function calculateAndApplyExperience(
  result: BattleResult,
  params: {
    attacker: UserModel;
    defender: UserModel;
    attackTurns: number;
    fortDestroyed: boolean;
  }
): void {
  const { attacker, defender, attackTurns, fortDestroyed } = params;
  
  // Calculate level difference bonus
  const levelDifference = Math.abs(defender.level - attacker.level);
  
  // Calculate experience based on battle outcome
  const { attackerXP, defenderXP } = calculateBattleExperience(
    result.Losses.Defender.total > result.Losses.Attacker.total, // attacker wins if defender lost more
    levelDifference,
    attackTurns,
    fortDestroyed
  );

  // Apply experience to result
  result.experienceGained = {
    attacker: attackerXP,
    defender: defenderXP
  };
}
export function finalizeBattleResult(
  result: BattleResult,
  params: {
    attacker: UserModel;
    defender: UserModel;
    attackTurns: number;
    initialFortHP: number;
    currentFortHP: number;
  }
): void {
  const { attacker, defender, attackTurns, initialFortHP, currentFortHP } = params;
  result.pillagedGold = calculateLoot(attacker, defender, attackTurns);
  result.finalFortHP = currentFortHP;
  result.fortDamaged = initialFortHP !== currentFortHP;
  
  calculateAndApplyExperience(result, {
    attacker,
    defender,
    attackTurns,
    fortDestroyed: currentFortHP <= 0
  });
}