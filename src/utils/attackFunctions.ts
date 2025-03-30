import { UnitTypes, ItemTypes, Fortifications } from "@/constants";
import UserModel from "@/models/Users";
import { BattleUnits, Fortification, ItemType } from "@/types/typings";
import mtRand from "./mtrand";
import BattleResult from "@/models/BattleResult";
import { type } from "os";

interface BattleState {
  attacker: UserModel;
  defender: UserModel;
  battleResult: BattleResult;
  fortHP: number;
  initialFortHP?: number;
  attackerStamina: number;
  totalTurns: number;
  attackerOffenseRemaining: number;
  defenderDefenseRemaining: number;
  defenderCitizensRemaining: number;
  defenderWorkersRemaining: number;
  defenderOffenseRemaining: number;
  baseAttackerKS: number;
  baseAttackerDS: number;
}

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
  if (debug) console.log('Simulating battle between', attacker.displayName, 'and', defender.displayName);

  let state = initializeBattleState(attacker, defender, initialFortHP, debug);
  state.totalTurns = totalTurns;
  for (let turn = 1; turn <= totalTurns; turn++) {
    if (debug) console.log(`\n=== Turn ${turn} ===`);
    await executeBattleTurn(state, turn, debug);

    if (shouldBattleEndEarly(state, debug)) break;
  }

  finalizeBattleResult(state);
  return state.battleResult;
}

function initializeBattleState(attacker: UserModel, defender: UserModel, initialFortHP: number, debug: boolean) {
  let fortHP = Fortifications[defender.fortLevel].hitpoints;
  let attackerStamina = 1.0;
  let battleResult = new BattleResult(attacker, defender);
  const attackerStrength = calculateStrength(attacker, 'OFFENSE');
  let state = {
    attacker,
    defender,
    battleResult,
    fortHP: defender.fortHitpoints,
    attackerStamina,
    totalTurns: 0,
    initialFortHP: fortHP,
    attackerOffenseRemaining: attacker.unitTotals.offense,
    defenderDefenseRemaining: defender.unitTotals.defense,
    defenderCitizensRemaining: defender.unitTotals.citizens,
    defenderWorkersRemaining: defender.unitTotals.workers,
    defenderOffenseRemaining: defender.unitTotals.offense,
    baseAttackerKS: attackerStrength.killingStrength,
    baseAttackerDS: attackerStrength.defenseStrength,
  };

  return state;
}

async function executeBattleTurn(state: any, turn: number, debug: boolean) {
  state.totalTurns = turn;
  
  if (debug) console.log('Attacker Units:', state.attacker.units.filter(u => u.type === 'OFFENSE'));
  if (debug) console.log('Defender Units:', state.defender.units.filter(u => u.type !== 'SPY' && u.type !== 'SENTRY'));
  let {KS: attackerKS, DS: attackerDS} = calculateAttackerStrength(state, turn);
  let {defenderDS, defenderKS} = calculateDefenderStrength(state, turn, debug);
  if (debug) console.log(`Attacker KS: ${attackerKS}`, `Attacker DS: ${attackerDS}`);
  if (debug) console.log('Defender KS:', defenderKS, 'Defender DS:', defenderDS);
  if (debug) console.log(`Fort HP: ${state.fortHP}`);
  let shouldIncludeCitz =
    state.defenderDefenseRemaining <= (BATTLE_CONSTANTS.LOW_DEFENSE_RATIO * state.defender.population)
    ||
    state.fortHP <= BATTLE_CONSTANTS.FORT_CRITICAL_THRESHOLD;
  if (debug) console.log(`Defender Defense Remaining: ${state.defenderDefenseRemaining}`,
    `<= ${BATTLE_CONSTANTS.LOW_DEFENSE_RATIO * state.defender.population}: ${state.defenderDefenseRemaining <= (BATTLE_CONSTANTS.LOW_DEFENSE_RATIO * state.defender.population)}`,
  );
  if (debug) console.log(`Should Include All Units: ${shouldIncludeCitz}`);

  // Only include offense units in later turns when fort is critically damaged
  const includeOffenseUnits = shouldIncludeCitz && turn > 5 &&
    state.fortHP < Fortifications[state.defender.fortLevel].hitpoints * BATTLE_CONSTANTS.FORT_CRITICAL_THRESHOLD;
  if (debug) console.log(`Turn ${turn} - Fort HP: ${state.fortHP}, Critical Threshold: ${Fortifications[state.defender.fortLevel].hitpoints * BATTLE_CONSTANTS.FORT_CRITICAL_THRESHOLD}`);
  if (debug) console.log(`Turn ${turn} - Should Include Offense Units: ${includeOffenseUnits}`);

  if (state.fortHP > 0) {
    let fortDamage = calculateFortDamage(attackerKS, defenderDS);
    state.fortHP = Math.max(state.fortHP - fortDamage, 0);
    if (debug) console.log(`Fort HP after attack: ${state.fortHP}`);
  }

  let casualties = calculateCasualties(state, attackerKS, {defenderKS, defenderDS, includeCitz: shouldIncludeCitz, includeOffense: includeOffenseUnits});
  if(debug) console.log(`Casualties: ${JSON.stringify(casualties)}`);
  
  // Keep track of casualties this turn for logging
  const previousAttackerLosses = [...state.battleResult.Losses.Attacker.units];
  const previousDefenderLosses = [...state.battleResult.Losses.Defender.units];
  const initialAttackerTotal = state.battleResult.Losses.Attacker.total;
  const initialDefenderTotal = state.battleResult.Losses.Defender.total;
  
  if (debug) console.log(`Attacker Total Losses: ${initialAttackerTotal}, Defender Total Losses: ${initialDefenderTotal}`);
  if (debug) console.log(`Attacker Casualties: ${casualties.attackerCasualties}, Defender Casualties: ${casualties.defenderCasualties}`);
  if (debug) console.log(`Attacker Unit Casualties: ${JSON.stringify(previousAttackerLosses)}`);
  if (debug) console.log(`Defender Unit Casualties: ${ JSON.stringify(previousDefenderLosses) }`);

  // Update to call the async function
  await distributeCasualties({
    result: state.battleResult,
    attacker: state.attacker,
    defender: state.defender,
    casualties: casualties,
    fortHP: state.fortHP,
    defenderDefenseProportion: state.defenderDefenseRemaining /
      (state.defenderDefenseRemaining + state.defenderCitizensRemaining +
        state.defenderWorkersRemaining + state.defenderOffenseRemaining),
    initialFortHP: state.initialFortHP || Fortifications[state.defender.fortLevel].hitpoints,
    turn: turn,
    includeCitz: shouldIncludeCitz,
    includeOffense: includeOffenseUnits
  });

  // Update state tracking variables based on casualties
  state.attackerOffenseRemaining = Math.max(0, state.attackerOffenseRemaining - casualties.attackerCasualties);

  // Update defender unit counts by checking the losses in battleResult
  const defenderLostUnits = state.battleResult.Losses.Defender.units;
  for (const lostUnit of defenderLostUnits) {
    // Update the state tracking variables
    switch (lostUnit.type) {
      case 'DEFENSE':
        state.defenderDefenseRemaining = Math.max(0, state.defenderDefenseRemaining - lostUnit.quantity);
        break;
      case 'CITIZEN':
        state.defenderCitizensRemaining = Math.max(0, state.defenderCitizensRemaining - lostUnit.quantity);
        break;
      case 'WORKER':
        state.defenderWorkersRemaining = Math.max(0, state.defenderWorkersRemaining - lostUnit.quantity);
        break;
      case 'OFFENSE':
        state.defenderOffenseRemaining = Math.max(0, state.defenderOffenseRemaining - lostUnit.quantity);
        break;
    }
    
    // Also update the actual defender units array to reflect casualties
    const defenderUnit = state.defender.units.find(unit => unit.type === lostUnit.type && unit.level === lostUnit.level);
    if (defenderUnit) {
      defenderUnit.quantity = Math.max(0, defenderUnit.quantity - lostUnit.quantity);
    }
  }

  // Update stamina for next turn
  state.attackerStamina = calculateStaminaModifier(turn);
  if(debug) console.log('FortHP at end of turn', state.fortHP);
}

function calculateAttackerStrength(state, turn) {
  let staminaDrop = calculateStaminaDrop(turn);
  console.log(`Stamina Drop for turn ${turn}: ${staminaDrop}`);
  console.log(`Base Attacker KS: ${state.baseAttackerKS}, Base Attacker DS: ${state.baseAttackerDS}`);
  console.log(`Attacker Stamina: ${state.attackerStamina}`);
  const stamnaImpact = state.attackerStamina * staminaDrop;
  return {
    KS: Math.ceil(state.baseAttackerKS * stamnaImpact),
    DS: Math.ceil(state.baseAttackerDS * stamnaImpact),
  };
}

function calculateDefenderStrength(state, turn, debug) {
  let shouldIncludeCitz =
    state.defenderDefenseRemaining <= (BATTLE_CONSTANTS.LOW_DEFENSE_RATIO * state.defender.population)
    ||
    state.fortHP <= BATTLE_CONSTANTS.FORT_CRITICAL_THRESHOLD;
  if (debug) console.log(`Defender Defense Remaining: ${state.defenderDefenseRemaining}`, 
    `<= ${BATTLE_CONSTANTS.LOW_DEFENSE_RATIO * state.defender.population}: ${state.defenderDefenseRemaining <= (BATTLE_CONSTANTS.LOW_DEFENSE_RATIO * state.defender.population)}`,
  );
  if (debug) console.log(`Should Include All Units: ${shouldIncludeCitz}`);
  
  // Only include offense units in later turns when fort is critically damaged
  const includeOffenseUnits = shouldIncludeCitz && turn > 5 && 
    state.fortHP < Fortifications[state.defender.fortLevel].hitpoints * BATTLE_CONSTANTS.FORT_CRITICAL_THRESHOLD;
  if (debug) console.log(`Turn ${turn} - Fort HP: ${state.fortHP}, Critical Threshold: ${Fortifications[state.defender.fortLevel].hitpoints * BATTLE_CONSTANTS.FORT_CRITICAL_THRESHOLD}`);
  if (debug) console.log(`Turn ${turn} - Should Include Offense Units: ${includeOffenseUnits}`);

  let currentDefenderStrength = calculateStrength(state.defender, 'DEFENSE', shouldIncludeCitz, includeOffenseUnits);
  if(debug) console.log(`Defender Strength: ${JSON.stringify(currentDefenderStrength)}`);
  let defenderKS, defenderDS;

  if (state.fortHP < 0.3 * state.initialFortHP) {
    if (turn <= 5) {
      // Early turns - defense is weakened
      if (debug) console.log('Fort is critically damaged, applying citizens/workers to calculation');
      if (debug) console.log(`Turn: ${turn}, Fort HP: ${state.fortHP}, Initial Fort HP: ${state.initialFortHP}`);
      let nerfFactor = calculateDefenseNerfFactor(turn, state.fortHP, state.initialFortHP);
      if (debug) console.log(`Nerf Factor: ${nerfFactor}`);
      defenderKS = currentDefenderStrength.killingStrength * nerfFactor;
      defenderDS = currentDefenderStrength.defenseStrength * nerfFactor;
    } else {
      // Later turns - offense units start joining the defense with reinforcements
      // We still should include citizens/workers in the calculation
      if (debug) console.log('Fort is critically damaged, applying reinforcements from offense units');
      let reinforcementKS = includeOffenseUnits ? calculateReinforcementModifier(turn) : 0;
      let recoveryFactor = calculateRecoveryFactor(turn);
      defenderKS = (currentDefenderStrength.killingStrength + reinforcementKS) * recoveryFactor;
      defenderDS = currentDefenderStrength.defenseStrength + reinforcementKS;
    }
  } else {
    defenderKS = currentDefenderStrength.killingStrength;
    defenderDS = currentDefenderStrength.defenseStrength;
  }
  return { defenderKS, defenderDS };
}

function shouldBattleEndEarly(state, debug) {
  if (state.attackerOffenseRemaining <= 0) {
    if (debug) console.log('Battle ended early - attacker has no more offense units.');
    return true;
  }

  // Revise valid targets check to handle fort status properly
  let hasValidDefenderTargets = (
    state.defenderDefenseRemaining > 0 ||
    state.fortHP > 0 ||
    (state.fortHP === 0 && (state.defenderCitizensRemaining > 0 || state.defenderWorkersRemaining > 0)) ||
    (state.fortHP === 0 && state.defenderDefenseRemaining <= 0 &&
      state.defenderCitizensRemaining <= 0 && state.defenderWorkersRemaining <= 0 &&
      state.defenderOffenseRemaining > 0)
  );

  if (!hasValidDefenderTargets) {
    if (debug) {
      console.log('Battle ended early - no valid defender targets remain.');
      console.log(`Defender Units Remaining - Defense: ${state.defenderDefenseRemaining}, ` +
        `Citizens: ${state.defenderCitizensRemaining}, Workers: ${state.defenderWorkersRemaining}, ` +
        `Offense: ${state.defenderOffenseRemaining}`);
    }
    return true;
  }

  return false;
}

function calculateCasualties(state, attackerKS, defenderStats) {
  return newComputeCasualties(
    attackerKS,
    defenderStats.defenderDS,
    defenderStats.defenderKS,
    attackerKS,
    state.attackerOffenseRemaining,
    state.defenderDefenseRemaining + (defenderStats.includeCitz ? (state.defenderCitizensRemaining + state.defenderWorkersRemaining) : 0) + (defenderStats.includeOffense ? state.defenderOffenseRemaining : 0),
    computeAmpFactor(state.defenderDefenseRemaining + (defenderStats.includeCitz ? (state.defenderCitizensRemaining + state.defenderWorkersRemaining) : 0) + (defenderStats.includeOffense ? state.defenderOffenseRemaining : 0)),
    state.defenderDefenseRemaining / (state.defenderDefenseRemaining + (defenderStats.includeCitz ? (state.defenderCitizensRemaining + state.defenderWorkersRemaining) : 0) + (defenderStats.includeOffense ? state.defenderOffenseRemaining : 0)),
    state.initialFortHP,
    state.fortHP,
    defenderStats.includeCitz,
    defenderStats.includeOffense
  );
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
  defenderDS: number
): number {
  const ratio = attackerKS / (defenderDS || 1);
  let damageRange: [number, number];

  if (ratio <= 0.05) damageRange = [0, 1];
  else if (ratio <= 0.5) damageRange = [0, 3];
  else if (ratio <= 1.3) damageRange = [3, 8];
  else damageRange = [8, 12];

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

const itemTypeLookup = {};
Object.entries(ItemTypes).forEach(([type, item]) => {
  if (!itemTypeLookup[item.usage]) itemTypeLookup[item.usage] = {};
  if (!itemTypeLookup[item.usage][type]) itemTypeLookup[item.usage][type] = item;
});

const strengthCache = new Map();
export function calculateStrength(
  user: UserModel,
  unitType: 'OFFENSE' | 'DEFENSE',
  includeCitz: boolean = false,
  includeOffense: boolean = false
): { killingStrength: number; defenseStrength: number } {
  const includedTypes: string[] = [];

  if (unitType === 'OFFENSE' || includeOffense) {
    includedTypes.push('OFFENSE');
  }

  if (unitType === 'DEFENSE') {
    includedTypes.push('DEFENSE');
  }

  if (includeCitz) {
    includedTypes.push('CITIZEN', 'WORKER');
  }

  const filteredUnits = user.units?.filter(u => includedTypes.includes(u.type)) || [];

  const unitString = JSON.stringify(filteredUnits);
  const itemString = JSON.stringify(user.items?.filter(i => i.usage === unitType));
  const cacheKey = `${user.id}-${unitType}-${includeCitz}-${includeOffense}-${unitString}-${itemString}`;

  if (user.units?.filter(u => u.type === unitType).length > 0) {
    console.log(`Units of type ${unitType}:`, user.units?.filter(u => u.type === unitType));
  }

  if (strengthCache.has(cacheKey)) {
    const cached = strengthCache.get(cacheKey);
    if (cached.killingStrength > 0 || cached.defenseStrength > 0) {
      console.log(`Using cached strength for ${unitType}: KS=${cached.killingStrength}, DS=${cached.defenseStrength}`);
      return cached;
    }
    console.log(`Cached strength for ${unitType} is zero, recalculating...`);
    strengthCache.delete(cacheKey);
  }

  let killingStrength = 0;
  let defenseStrength = 0;
  const multiplier = getUnitMultiplier(user, unitType);

  // Process Primary Units (OFFENSE or DEFENSE)
  user?.units?.filter(u => u.type === unitType).forEach(unit => {
    const unitInfo = UnitTypes.find(
      info => info.type === unit.type && info.level === unit.level
    );
    if (!unitInfo) {
      console.warn(`Unit info not found for type: ${unit.type}`);
      return;
    }

    console.log(`Adding strength for ${unit.quantity} ${unit.type} units: KS=${unitInfo.killingStrength}, DS=${unitInfo.defenseStrength}`);
    killingStrength += (unitInfo.killingStrength || 0) * unit.quantity;
    defenseStrength += (unitInfo.defenseStrength || 0) * unit.quantity;

    if (unit.quantity === 0) return;

    const sortedItems = [...user.items]
      .filter(item => item.usage === unit.type)
      .sort((a, b) => {
        const itemInfoA = itemTypeLookup[unit.type]?.[a.type];
        const itemInfoB = itemTypeLookup[unit.type]?.[b.type];
        return (itemInfoB?.killingStrength || 0) - (itemInfoA?.killingStrength || 0);
      });

    const itemCounts: Record<ItemType, number> = {
      WEAPON: 0,
      HELM: 0,
      BOOTS: 0,
      BRACERS: 0,
      SHIELD: 0,
      ARMOR: 0,
    };

    sortedItems.forEach(item => {
      const currentCount = itemCounts[item.type] || 0;
      const itemInfo = itemTypeLookup[unit.type]?.[item.type];
      if (!itemInfo) return;

      const usableQuantity = Math.min(item.quantity, unit.quantity - currentCount);
      console.log(`Adding item strength for ${usableQuantity} ${item.type} items: KS=${itemInfo.killingStrength}, DS=${itemInfo.defenseStrength}`);
      killingStrength += itemInfo.killingStrength * usableQuantity;
      defenseStrength += itemInfo.defenseStrength * usableQuantity;
      itemCounts[item.type] = currentCount + usableQuantity;
    });
  });

  // Process support units (CITIZEN, WORKER, OFFENSE) based on flags
  if (includeCitz || includeOffense || (unitType === 'DEFENSE' && !user.units?.some(u => u.type === 'DEFENSE' && u.quantity > 0))) {
    user.units?.filter(u => includedTypes.includes(u.type) && u.type !== unitType).forEach(unit => {
      const unitInfo = UnitTypes.find(info => info.type === unit.type);
      if (unitInfo) {
        let effectivenessMultiplier = 1;
        if (unit.type === 'OFFENSE') {
          effectivenessMultiplier = unitType === 'DEFENSE' ? 0.7 : 1;
        } else if (unit.type === 'CITIZEN' || unit.type === 'WORKER') {
          effectivenessMultiplier = unitType === 'DEFENSE' ? 0.3 : 0.1;
        }
        console.log(`Adding support strength for ${unit.quantity} ${unit.type} units: KS=${unitInfo.killingStrength * effectivenessMultiplier}, DS=${unitInfo.defenseStrength * effectivenessMultiplier}`);
        killingStrength += unitInfo.killingStrength * unit.quantity * effectivenessMultiplier;
        defenseStrength += unitInfo.defenseStrength * unit.quantity * effectivenessMultiplier;
      }
    });
  }

  const result = {
    killingStrength: Math.ceil(killingStrength * multiplier),
    defenseStrength: Math.ceil(defenseStrength * multiplier),
  };

  console.log(`Final strength for ${unitType}: KS=${result.killingStrength}, DS=${result.defenseStrength}`);

  strengthCache.set(cacheKey, result);
  return result;
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
  if (ratio >= 0.1) return mtRand(0.0004, 0.00045);
  return mtRand(0.00025, 0.0003);
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
  fortHitpoints?: number,
  includeCitz: boolean = false,
  includeOffense: boolean = false
): { attackerCasualties: number; defenderCasualties: number } {
  // Calculate power ratios
  const offenseToDefenseRatio = attackerKS / (defenderDS || 1);
  const counterAttackRatio = defenderKS / (attackerDS || 1);

  // Base casualty values
  const attackerBaseValue = computeBaseValue(counterAttackRatio);
  const defenderBaseValue = computeBaseValue(offenseToDefenseRatio);

  // Adjust for battle phase and fortification status
  let phaseMultiplier = 1.0;
  let attackerPhaseMultiplier = 1.0;
  
  // Fort status multipliers
  if (fortHitpoints !== undefined) {
    if (fortHitpoints === 0) {
      // Fort destroyed - higher casualties for defender
      phaseMultiplier = 2.5;
      attackerPhaseMultiplier = 0.6; // Attacker takes fewer casualties when fort is destroyed
    } else if (fortHitpoints < initialFortHP * BATTLE_CONSTANTS.FORT_CRITICAL_THRESHOLD) {
      // Fort critically damaged - moderate casualties
      phaseMultiplier = 1.5;
      attackerPhaseMultiplier = 0.8; // Attacker takes fewer casualties when fort is critically damaged
    } else if (fortHitpoints < initialFortHP * 0.7) {
      // Fort damaged - slightly increased casualties
      phaseMultiplier = 1.2;
      attackerPhaseMultiplier = 0.9; // Attacker takes fewer casualties when fort is damaged
    }
  }
  
  // Defense proportion multiplier - low defense means higher casualties
  let defenseProportionMultiplier = 0.65;
  if (defenseProportion < BATTLE_CONSTANTS.LOW_DEFENSE_RATIO) {
    // Exponentially increase casualties as defense proportion decreases
    defenseProportionMultiplier += Math.pow((BATTLE_CONSTANTS.LOW_DEFENSE_RATIO - defenseProportion) * 4, 2);
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

  // Add minimum attacker casualties based on defender strength
  // Even powerful attackers should take some losses
  const minAttackerCasualties = Math.max(
    1,  // At least 1 casualty
    Math.ceil(attackerPop * 0.001)  // Or 0.1% of attacker force
  );

  attackerCasualties = Math.max(attackerCasualties, minAttackerCasualties);

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
  if (turn <= 8) return 0.7;       // Mid-late phase - significant fatigue
  return 0.55;                     // Late phase - significant fatigue
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
  turn?: number;
  includeCitz?: boolean;
  includeOffense?: boolean;
}): Promise<void> {
  const { result, attacker, defender, casualties, fortHP, initialFortHP, turn, includeCitz = false, includeOffense = false } = params;
  
  if (casualties.attackerCasualties <= 0 && casualties.defenderCasualties <= 0) {
    return; // No casualties to distribute
  }

  // Handle attacker casualties
  if (casualties.attackerCasualties > 0) {
    const offenseUnits = filterUnitsByType(attacker.units, 'OFFENSE');
    
    // Check if we have enough units to sustain the casualties
    const availableAttackerUnits = offenseUnits.reduce((sum, unit) => sum + unit.quantity, 0);
    const effectiveAttackerCasualties = Math.min(casualties.attackerCasualties, availableAttackerUnits);
    
    const lostUnits = distributeUnitCasualties(offenseUnits, effectiveAttackerCasualties);
    if (lostUnits.length > 0) {
      // Merge with existing losses
      lostUnits.forEach(loss => {
        const existingLoss = result.Losses.Attacker.units.find(
          u => u.type === loss.type && u.level === loss.level
        );
        if (existingLoss) {
          existingLoss.quantity += loss.quantity;
        } else {
          result.Losses.Attacker.units.push({ ...loss });
        }
      });
      
      result.Losses.Attacker.total += lostUnits.reduce((sum, unit) => sum + unit.quantity, 0);
    }
  }

  // Handle defender casualties
  if (casualties.defenderCasualties > 0) {
    // Determine split ratio based on battle conditions
    let defenseRatio = 0.75; // Default: 75% to defense units
    
    // Adjust ratios based on fort status and turn
    if (fortHP === 0) {
      // Fort destroyed - more casualties to non-defense units
      defenseRatio = 0.6;
    } else if (fortHP < initialFortHP * BATTLE_CONSTANTS.FORT_CRITICAL_THRESHOLD) {
      // Fort critically damaged - adjust based on turn
      if (turn && turn > 5) {
        defenseRatio = 0.65;
      }
    }

    // Get available unit counts for proper distribution
    const defenseUnits = filterUnitsByType(defender.units, 'DEFENSE');
    const citizenUnits = includeCitz ? filterUnitsByType(defender.units, 'CITIZEN') : [];
    const workerUnits = includeCitz ? filterUnitsByType(defender.units, 'WORKER') : [];
    const offenseUnits = includeOffense ? filterUnitsByType(defender.units, 'OFFENSE') : [];
    
    const availableDefenseUnits = defenseUnits.reduce((sum, unit) => sum + unit.quantity, 0);
    const availableCitizenUnits = citizenUnits.reduce((sum, unit) => sum + unit.quantity, 0);
    const availableWorkerUnits = workerUnits.reduce((sum, unit) => sum + unit.quantity, 0);
    const availableOffenseUnits = offenseUnits.reduce((sum, unit) => sum + unit.quantity, 0);
    
    const totalAvailableNonDefense = availableCitizenUnits + availableWorkerUnits + availableOffenseUnits;
    
    // Adjust the target distribution based on what units are actually available
    let targetDefenseCasualties = Math.round(casualties.defenderCasualties * defenseRatio);
    let targetNonDefenseCasualties = casualties.defenderCasualties - targetDefenseCasualties;
    
    // Cap casualties to available units
    const effectiveDefenseCasualties = Math.min(targetDefenseCasualties, availableDefenseUnits);
    let remainingDefenseOverflow = targetDefenseCasualties - effectiveDefenseCasualties;
    
    // Add overflow from defense to non-defense
    targetNonDefenseCasualties += remainingDefenseOverflow;
    
    // Cap non-defense casualties to available units
    const effectiveNonDefenseCasualties = Math.min(targetNonDefenseCasualties, totalAvailableNonDefense);
    
    // Process defense casualties
    if (effectiveDefenseCasualties > 0 && availableDefenseUnits > 0) {
      const defenseLosses = distributeUnitCasualties(defenseUnits, effectiveDefenseCasualties);
      
      defenseLosses.forEach(loss => {
        const existingLoss = result.Losses.Defender.units.find(
          u => u.type === loss.type && u.level === loss.level
        );
        if (existingLoss) {
          existingLoss.quantity += loss.quantity;
        } else {
          result.Losses.Defender.units.push({ ...loss });
        }
      });
      
      result.Losses.Defender.total += defenseLosses.reduce((sum, unit) => sum + unit.quantity, 0);
    }
    
    // Process non-defense casualties if allowed and available
    if (effectiveNonDefenseCasualties > 0 && totalAvailableNonDefense > 0) {
      // Divide casualties proportionally among available non-defense units
      const citizenRatio = totalAvailableNonDefense > 0 ? availableCitizenUnits / totalAvailableNonDefense : 0;
      const workerRatio = totalAvailableNonDefense > 0 ? availableWorkerUnits / totalAvailableNonDefense : 0;
      const offenseRatio = totalAvailableNonDefense > 0 ? availableOffenseUnits / totalAvailableNonDefense : 0;
      
      let citizenCasualties = Math.floor(effectiveNonDefenseCasualties * citizenRatio);
      let workerCasualties = Math.floor(effectiveNonDefenseCasualties * workerRatio);
      let offenseCasualties = effectiveNonDefenseCasualties - citizenCasualties - workerCasualties;
      
      // Ensure we don't assign more casualties than available units
      citizenCasualties = Math.min(citizenCasualties, availableCitizenUnits);
      workerCasualties = Math.min(workerCasualties, availableWorkerUnits);
      offenseCasualties = Math.min(offenseCasualties, availableOffenseUnits);
      
      // Process citizen casualties
      if (includeCitz && citizenCasualties > 0 && availableCitizenUnits > 0) {
        const citizenLosses = distributeUnitCasualties(citizenUnits, citizenCasualties);
        
        citizenLosses.forEach(loss => {
          const existingLoss = result.Losses.Defender.units.find(
            u => u.type === loss.type && u.level === loss.level
          );
          if (existingLoss) {
            existingLoss.quantity += loss.quantity;
          } else {
            result.Losses.Defender.units.push({ ...loss });
          }
        });
        
        result.Losses.Defender.total += citizenLosses.reduce((sum, unit) => sum + unit.quantity, 0);
      }
      
      // Process worker casualties
      if (includeCitz && workerCasualties > 0 && availableWorkerUnits > 0) {
        const workerLosses = distributeUnitCasualties(workerUnits, workerCasualties);
        
        workerLosses.forEach(loss => {
          const existingLoss = result.Losses.Defender.units.find(
            u => u.type === loss.type && u.level === loss.level
          );
          if (existingLoss) {
            existingLoss.quantity += loss.quantity;
          } else {
            result.Losses.Defender.units.push({ ...loss });
          }
        });
        
        result.Losses.Defender.total += workerLosses.reduce((sum, unit) => sum + unit.quantity, 0);
      }
      
      // Process offense casualties
      if (includeOffense && offenseCasualties > 0 && availableOffenseUnits > 0) {
        const offenseLosses = distributeUnitCasualties(offenseUnits, offenseCasualties);
        
        offenseLosses.forEach(loss => {
          const existingLoss = result.Losses.Defender.units.find(
            u => u.type === loss.type && u.level === loss.level
          );
          if (existingLoss) {
            existingLoss.quantity += loss.quantity;
          } else {
            result.Losses.Defender.units.push({ ...loss });
          }
        });
        
        result.Losses.Defender.total += offenseLosses.reduce((sum, unit) => sum + unit.quantity, 0);
      }
    }
  }
}

// Helper function to distribute casualties across units
function distributeUnitCasualties(units: BattleUnits[], totalCasualties: number): BattleUnits[] {
  const lostUnits: BattleUnits[] = [];
  let remainingCasualties = totalCasualties;

  // Create a deep copy of units to work with
  const workingUnits = units.map(unit => ({ ...unit }))
    .filter(unit => unit.quantity > 0) // Only consider units with quantity > 0
    .sort((a, b) => a.level - b.level); // Sort by level (lower levels lost first)

  // Calculate total available units
  const totalAvailable = workingUnits.reduce((sum, unit) => sum + unit.quantity, 0);

  // Cap casualties to available units
  remainingCasualties = Math.min(remainingCasualties, totalAvailable);

  if (remainingCasualties <= 0 || workingUnits.length === 0) {
    return []; // No casualties to distribute or no units available
  }

  // First pass - distribute casualties proportionally based on unit quantities
  const totalUnitCount = workingUnits.reduce((sum, unit) => sum + unit.quantity, 0);

  for (const unit of workingUnits) {
    if (remainingCasualties <= 0) break;

    // Calculate proportional casualties for this unit type
    const unitRatio = unit.quantity / totalUnitCount;
    let casualties = Math.floor(totalCasualties * unitRatio);

    // Don't assign more casualties than we have remaining to distribute
    casualties = Math.min(casualties, remainingCasualties);

    // Don't assign more casualties than units available
    casualties = Math.min(casualties, unit.quantity);

    if (casualties > 0) {
      lostUnits.push({
        type: unit.type,
        level: unit.level,
        quantity: casualties,
      });

      unit.quantity -= casualties;
      remainingCasualties -= casualties;
    }
  }

  // Second pass - if we still have casualties to distribute, take them from remaining units
  if (remainingCasualties > 0) {
    for (const unit of workingUnits) {
      if (remainingCasualties <= 0 || unit.quantity <= 0) continue;

      const casualties = Math.min(unit.quantity, remainingCasualties);

      // Find if we already added losses for this unit type/level
      const existingLoss = lostUnits.find(
        loss => loss.type === unit.type && loss.level === unit.level
      );

      if (existingLoss) {
        existingLoss.quantity += casualties;
      } else if (casualties > 0) {
        lostUnits.push({
          type: unit.type,
          level: unit.level,
          quantity: casualties,
        });
      }

      unit.quantity -= casualties;
      remainingCasualties -= casualties;
    }
  }

  // Apply the casualties to the original units
  lostUnits.forEach(loss => {
    const originalUnit = units.find(
      u => u.type === loss.type && u.level === loss.level
    );
    if (originalUnit) {
      originalUnit.quantity = Math.max(0, originalUnit.quantity - loss.quantity);
    }
  });

  return lostUnits;
}


export function filterUnitsByType(units: BattleUnits[], type: string): BattleUnits[] {
  return units
    .filter(unit => unit.type === type)
    .map(unit => ({ ...unit }))
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

  result.result = result.calculateResult(attacker, defender);
  // Apply experience to result
  result.experienceGained = {
    attacker: attackerXP,
    defender: defenderXP
  };
}
export function finalizeBattleResult(state: BattleState): void {
  const { attacker, defender, totalTurns, fortHP, initialFortHP, battleResult } = state;

  // Fix missing unit levels
  battleResult.Losses.Defender.units.forEach(unit => {
    if (unit.level === undefined) {
      const originalUnit = defender.units.find(u => u.type === unit.type);
      if(originalUnit) {
        unit.level = originalUnit.level;
      } else {
        unit.level = 1;
        console.warn(`Unit type ${unit.type} not found in defender's units. Defaulting level to 1.`);
      }
    }
  });

  battleResult.Losses.Attacker.units.forEach(unit => {
    if (unit.level === undefined) {
      const originalUnit = attacker.units.find(u => u.type === unit.type);
      if(originalUnit) {
        unit.level = originalUnit.level;
      } else {
        unit.level = 1;
        console.warn(`Unit type ${unit.type} not found in attacker's units. Defaulting level to 1.`);
      }
    }
  });

  battleResult.pillagedGold = calculateLoot(attacker, defender, totalTurns);
  battleResult.finalFortHP = fortHP;
  battleResult.fortDamaged = initialFortHP !== fortHP;
  battleResult.turnsTaken = totalTurns;
  
  // Summarize casualties by type and level for better reporting
  const summarizeUnitLosses = (units): { type: string; level: number; quantity: number; description: string; }[] => {
    const summary: { [key: string]: { type: string; level: number; quantity: number; description: string; } } = {};
    units.forEach(unit => {
      const key = `${unit.type}_${unit.level}`;
      if (!summary[key]) {
        summary[key] = {
          type: unit.type,
          level: unit.level,
          quantity: 0,
          description: `${unit.type} Level ${unit.level}`
        };
      }
      summary[key].quantity += unit.quantity;
    });
    return Object.values(summary);
  };

  // Add summarized casualties to battle result
  battleResult.casualtySummary = {
    attacker: summarizeUnitLosses(battleResult.Losses.Attacker.units),
    defender: summarizeUnitLosses(battleResult.Losses.Defender.units),
    attackerTotal: battleResult.Losses.Attacker.total,
    defenderTotal: battleResult.Losses.Defender.total,
    fortDamage: initialFortHP - fortHP
  };

  // Log final casualty report
  console.log("\n=== BATTLE SUMMARY ===");
  console.log(`Total turns: ${totalTurns}`);
  console.log(`Fort damage: ${initialFortHP - fortHP} (${Math.round((initialFortHP - fortHP) / initialFortHP * 100)}%)`);
  console.log("Attacker losses:");
  battleResult.casualtySummary.attacker.forEach(loss => {
    console.log(`- ${loss.quantity} ${loss.type} units (Level ${loss.level})`);
  });
  console.log(`Total attacker casualties: ${battleResult.Losses.Attacker.total}`);
  console.log("Defender losses:");
  battleResult.casualtySummary.defender.forEach(loss => {
    console.log(`- ${loss.quantity} ${loss.type} units (Level ${loss.level})`);
  });
  console.log(`Total defender casualties: ${battleResult.Losses.Defender.total}`);

  calculateAndApplyExperience(battleResult, {
    attacker,
    defender,
    attackTurns: totalTurns,
    fortDestroyed: fortHP <= 0
  });
}

function logUnitCasualties(turn: number, attackerLosses: BattleUnits[], defenderLosses: BattleUnits[], debug: boolean) {
  if (!debug) return;
  
  console.log(`\n=== Turn ${turn} Casualties ===`);
  
  // Log attacker losses
  if (attackerLosses.length > 0) {
    console.log('Attacker lost:');
    attackerLosses.forEach(loss => {
      console.log(`- ${loss.quantity} ${loss.type} units`);
    });
  } else {
    console.log('Attacker: No casualties');
  }
  
  // Log defender losses
  if (defenderLosses.length > 0) {
    console.log('Defender lost:');
    defenderLosses.forEach(loss => {
      console.log(`- ${loss.quantity} ${loss.type} units`);
    });
  } else {
    console.log('Defender: No casualties');
  }
}
