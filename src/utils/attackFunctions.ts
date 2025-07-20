import { UnitTypes, ItemTypes, Fortifications } from "@/constants";
import UserModel from "@/models/Users";
import { BattleUnits, Fortification, ItemType } from "@/types/typings";
import mtRand from "./mtrand";
import BattleResult from "@/models/BattleResult";
import { logDebug, logError, logInfo } from "./logger";

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

/**
 * Simulates a battle between two users, updating their units and fortifications over a series of turns.
 * @param {UserModel} attacker - The attacking user.
 * @param {UserModel} defender - The defending user.
 * @param {number} initialFortHP - The initial hitpoints of the defender's fortification.
 * @param {number} totalTurns - The number of turns the battle will last.
 * @param {boolean} [debug=false] - Whether to enable debug logging.
 * @returns {Promise<BattleResult>} The result of the battle simulation.
 */
export async function simulateBattle(
  attacker: UserModel,
  defender: UserModel,
  initialFortHP: number,
  totalTurns: number,
  debug: boolean = false
): Promise<BattleResult> {
  if (debug) logDebug('Simulating battle between', attacker.displayName, 'and', defender.displayName);
  logDebug('simulateBattle')
  logDebug('setting total turns:', totalTurns);
  let state = initializeBattleState(attacker, defender, initialFortHP, debug);
  state.totalTurns = totalTurns;
  for (let turn = 1; turn <= totalTurns; turn++) {
    if (debug) logDebug(`\n=== Turn ${turn} ===`);
    await executeBattleTurn(state, turn, debug);

    if (shouldBattleEndEarly(state, debug)) break;
  }

  finalizeBattleResult(state);
  return state.battleResult;
}

/**
 * Initializes the battle state object with all relevant properties for the simulation.
 * @param {UserModel} attacker - The attacking user.
 * @param {UserModel} defender - The defending user.
 * @param {number} initialFortHP - The initial hitpoints of the defender's fortification.
 * @param {boolean} debug - Whether to enable debug logging.
 * @returns {BattleState} The initialized battle state.
 */
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
    baseAttackerOAP: attackerStrength.OAP,
    baseAttackerDAS: attackerStrength.DAS,
  };

  return state;
}

/**
 * Executes a single turn of the battle, updating the state with casualties and fortification damage.
 * @param {any} state - The current battle state.
 * @param {number} turn - The current turn number.
 * @param {boolean} debug - Whether to enable debug logging.
 */
async function executeBattleTurn(state: any, turn: number, debug: boolean) {
  state.totalTurns = turn;
  state.levelMitigation = 1.00; // Default mitigation factor
  if (state.attacker.level > (state.defender.level + BATTLE_CONSTANTS.MAX_LEVEL_DIFFERENCE)) {
    state.levelMitigation = Math.pow(0.96, (state.attacker.level - state.defender.level - BATTLE_CONSTANTS.MAX_LEVEL_DIFFERENCE));
  }
  if (debug) logDebug(`Turn ${turn} - Level Mitigation: ${state.levelMitigation}`);


  let { KS: attackerKS, DS: attackerDS, OAP: attackerOAP, DAS: attackerDAS } = calculateAttackerStrength(state, turn);
  let { defenderDS, defenderKS, defenderOAP, defenderDAS } = calculateDefenderStrength(state, turn, debug);
  
  // Fort destruction debuff
  if (state.fortHP <= 0) {
    defenderDAS *= 0.5; // Defender's DAS is halved when the fort is destroyed
  }
  
  state.attackerKS = attackerKS;
  state.attackerDS = attackerDS;
  state.attackerOAP = attackerOAP;
  state.attackerDAS = attackerDAS;
  state.defenderKS = defenderKS;
  state.defenderDS = defenderDS;
  state.defenderOAP = defenderOAP;
  state.defenderDAS = defenderDAS;

  // Piercing Ratio Calculation
  state.piercingRatio = state.attackerOAP / (state.defenderDAS || 1);

  // Retain original offense/defense calculation for fort damage
  state.attackerAttackDamage = attackerKS * state.levelMitigation;
  state.attackerOffense = Math.round(state.attackerAttackDamage * (mtRand(99, 101) / 100)) + 1;
  state.defenderHealth = defenderDS * state.levelMitigation;
  state.defenderDefense = Math.round(state.defenderHealth * (mtRand(99, 101) / 100)) + 1;
  

  state.shouldIncludeCitz =
    state.defenderDefenseRemaining <= (BATTLE_CONSTANTS.LOW_DEFENSE_RATIO * state.defender.population)
    ||
    state.fortHP <= BATTLE_CONSTANTS.FORT_CRITICAL_THRESHOLD;
 

  // Only include offense units in later turns when fort is critically damaged
  state.includeOffenseUnits = state.shouldIncludeCitz && turn > 5 &&
    state.fortHP < Fortifications[state.defender.fortLevel].hitpoints * BATTLE_CONSTANTS.FORT_CRITICAL_THRESHOLD;


  if (state.fortHP > 0) {
    let fortDamage = calculateFortDamage(state.attackerOffense, state.defenderDefense);
    state.fortHP = Math.max(state.fortHP - fortDamage, 0);
  }

  let casualties = calculateCasualties(state);
  console.log('Casualties:', casualties);
  
  // Keep track of casualties this turn for logging
  const previousAttackerLosses = [...state.battleResult.Losses.Attacker.units];
  const previousDefenderLosses = [...state.battleResult.Losses.Defender.units];
  const initialAttackerTotal = state.battleResult.Losses.Attacker.total;
  const initialDefenderTotal = state.battleResult.Losses.Defender.total;

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
    includeCitz: state.shouldIncludeCitz,
    includeOffense: state.includeOffenseUnits
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
  }

  // Update stamina for next turn
  state.attackerStamina = calculateStaminaModifier(turn);
  if(debug) logDebug('FortHP at end of turn', state.fortHP);
}

/**
 * Calculates the attacker's strength for the current turn, factoring in stamina drop.
 * @param {any} state - The current battle state.
 * @param {number} turn - The current turn number.
 * @returns {{KS: number, DS: number}} The attacker's killing and defense strength.
 */
function calculateAttackerStrength(state, turn) {
  let staminaDrop = calculateStaminaDrop(turn);
  const stamnaImpact = state.attackerStamina * staminaDrop;
  return {
    KS: Math.ceil(state.baseAttackerKS * stamnaImpact),
    DS: Math.ceil(state.baseAttackerDS * stamnaImpact),
    OAP: Math.ceil(state.baseAttackerOAP * stamnaImpact),
    DAS: Math.ceil(state.baseAttackerDAS * stamnaImpact),
  };
}

/**
 * Calculates the defender's strength for the current turn, including possible reinforcements and nerfs.
 * @param {any} state - The current battle state.
 * @param {number} turn - The current turn number.
 * @param {boolean} debug - Whether to enable debug logging.
 * @returns {{defenderKS: number, defenderDS: number}} The defender's killing and defense strength.
 */
function calculateDefenderStrength(state, turn, debug) {
  let shouldIncludeCitz =
    state.defenderDefenseRemaining <= (BATTLE_CONSTANTS.LOW_DEFENSE_RATIO * state.defender.population)
    ||
    state.fortHP <= BATTLE_CONSTANTS.FORT_CRITICAL_THRESHOLD;
  if (debug) logDebug(`Defender Defense Remaining: ${state.defenderDefenseRemaining}`, 
    `<= ${BATTLE_CONSTANTS.LOW_DEFENSE_RATIO * state.defender.population}: ${state.defenderDefenseRemaining <= (BATTLE_CONSTANTS.LOW_DEFENSE_RATIO * state.defender.population)}`,
  );
  if (debug) logDebug(`Should Include All Units: ${shouldIncludeCitz}`);
  
  // Only include offense units in later turns when fort is critically damaged
  const includeOffenseUnits = shouldIncludeCitz && turn > 5 && 
    state.fortHP < Fortifications[state.defender.fortLevel].hitpoints * BATTLE_CONSTANTS.FORT_CRITICAL_THRESHOLD;
  if (debug) logDebug(`Turn ${turn} - Fort HP: ${state.fortHP}, Critical Threshold: ${Fortifications[state.defender.fortLevel].hitpoints * BATTLE_CONSTANTS.FORT_CRITICAL_THRESHOLD}`);
  if (debug) logDebug(`Turn ${turn} - Should Include Offense Units: ${includeOffenseUnits}`);

  let currentDefenderStrength = calculateStrength(state.defender, 'DEFENSE', shouldIncludeCitz, includeOffenseUnits);
  if(debug) logDebug(`Defender Strength: ${JSON.stringify(currentDefenderStrength)}`);
  let defenderKS, defenderDS;

  if (state.fortHP < 0.3 * state.initialFortHP) {
    if (turn <= 5) {
      // Early turns - defense is weakened
      logDebug('Fort is critically damaged, applying nerf factor to defense units');
      logDebug('Fort is critically damaged, applying citizens/workers to calculation');
      logDebug(`Turn: ${turn}, Fort HP: ${state.fortHP}, Initial Fort HP: ${state.initialFortHP}`);
      let nerfFactor = calculateDefenseNerfFactor(turn, state.fortHP, state.initialFortHP);
      logDebug(`Nerf Factor: ${nerfFactor}`);
      defenderKS = currentDefenderStrength.killingStrength * nerfFactor;
      defenderDS = currentDefenderStrength.defenseStrength * nerfFactor;
    } else {
      // Later turns - offense units start joining the defense with reinforcements
      // We still should include citizens/workers in the calculation
      logDebug('Fort is critically damaged, applying reinforcements from offense units');
      let reinforcementKS = includeOffenseUnits ? calculateReinforcementModifier(turn) : 0;
      let recoveryFactor = calculateRecoveryFactor(turn);
      defenderKS = (currentDefenderStrength.killingStrength + reinforcementKS) * recoveryFactor;
      defenderDS = currentDefenderStrength.defenseStrength + reinforcementKS;
    }
  } else {
    defenderKS = currentDefenderStrength.killingStrength;
    defenderDS = currentDefenderStrength.defenseStrength;
  }
  return { defenderKS, defenderDS, defenderOAP: currentDefenderStrength.OAP, defenderDAS: currentDefenderStrength.DAS };
}

/**
 * Determines if the battle should end early based on remaining units and fortification status.
 * @param {any} state - The current battle state.
 * @param {boolean} debug - Whether to enable debug logging.
 * @returns {boolean} True if the battle should end early, false otherwise.
 */
function shouldBattleEndEarly(state, debug) {
  if (state.attackerOffenseRemaining <= 0) {
    logDebug('Battle ended early - attacker has no more offense units.');
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
    logDebug('Battle ended early - no valid defender targets remain.');
    logDebug(`Defender Units Remaining - Defense: ${state.defenderDefenseRemaining}, ` +
      `Citizens: ${state.defenderCitizensRemaining}, Workers: ${state.defenderWorkersRemaining}, ` +
      `Offense: ${state.defenderOffenseRemaining}`);
    return true;
  }

  return false;
}

/**
 * Calculates the number of casualties for both attacker and defender for the current turn.
 * @param {any} state - The current battle state.
 * @param {number} attackerKS - The attacker's killing strength.
 * @param {object} defenderStats - The defender's stats and flags for including citizens/offense units.
 * @returns {{attackerCasualties: number, defenderCasualties: number}} The casualties for both sides.
 */
function calculateCasualties(state) {
  return newComputeCasualties(
    state.attackerOffense,
    state.defenderDefense,
    state.defenderKS,
    state.attackerDS, // Corrected from attackerKS
    state.attackerOffenseRemaining,
    state.defenderDefenseRemaining + (state.includeCitz ? (state.defenderCitizensRemaining + state.defenderWorkersRemaining) : 0) + (state.includeOffenseUnits ? state.defenderOffenseRemaining : 0),
    computeAmpFactor(state.defenderDefenseRemaining + (state.includeCitz ? (state.defenderCitizensRemaining + state.defenderWorkersRemaining) : 0) + (state.includeOffenseUnits ? state.defenderOffenseRemaining : 0)),
    state.defenderDefenseRemaining / (state.defenderDefenseRemaining + (state.includeCitz ? (state.defenderCitizensRemaining + state.defenderWorkersRemaining) : 0) + (state.includeOffenseUnits ? state.defenderOffenseRemaining : 0)),
    state.initialFortHP,
    state.piercingRatio, // Pass the piercing ratio
    state.fortHP,
    state.includeCitz,
    state.includeOffenseUnits
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
): { killingStrength: number; defenseStrength: number; OAP: number; DAS: number } {
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
  if (!user || !user.units || !user.items) {
    console.warn(`User or user units/items not found for type: ${unitType}`);
    return { killingStrength: 0, defenseStrength: 0, OAP: 0, DAS: 0 };
  }

  if (strengthCache.has(cacheKey)) {
    const cached = strengthCache.get(cacheKey);
    if (cached.killingStrength > 0 || cached.defenseStrength > 0) {
      logDebug(`Using cached strength for ${unitType}: KS=${cached.killingStrength}, DS=${cached.defenseStrength}`);
      return cached;
    }
    logDebug(`Cached strength for ${unitType} is zero, recalculating...`);
    strengthCache.delete(cacheKey);
  }

  let killingStrength = 0;
  let defenseStrength = 0;
  const multiplier = getUnitMultiplier(user, unitType);
  let OAP = 0;
  let DAS = 0;

  // Process Primary Units (OFFENSE or DEFENSE)
  user?.units?.filter(u => u.type === unitType).forEach(unit => {
    const unitInfo = UnitTypes.find(
      info => info.type === unit.type && info.level === unit.level
    );
    if (!unitInfo) {
      console.warn(`Unit info not found for type: ${unit.type}`);
      return;
    }

    logDebug(`Adding strength for ${unit.quantity} ${unit.type} units: KS=${unitInfo.killingStrength}, DS=${unitInfo.defenseStrength}`);
    killingStrength += (unitInfo.killingStrength || 0) * unit.quantity;
    defenseStrength += (unitInfo.defenseStrength || 0) * unit.quantity;
    OAP += (unitInfo.killingStrength || 0) * unit.quantity; // OAP mirrors KS for now
    DAS += (unitInfo.defenseStrength || 0) * unit.quantity; // DAS mirrors DS for now

    logDebug(`Unit Strength - Type: ${unit.type}, Level: ${unit.level}, Quantity: ${unit.quantity}, ` +
      `KS=${(unitInfo.killingStrength || 0) * unit.quantity}, DS=${(unitInfo.defenseStrength || 0) * unit.quantity}`);

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
      logDebug(`Adding item strength for ${usableQuantity} ${item.type} items: KS=${itemInfo.killingStrength}, DS=${itemInfo.defenseStrength}`);
      killingStrength += itemInfo.killingStrength * usableQuantity;
      defenseStrength += itemInfo.defenseStrength * usableQuantity;
      OAP += itemInfo.killingStrength * usableQuantity;
      DAS += itemInfo.defenseStrength * usableQuantity;
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
          effectivenessMultiplier = 0.1;
        }
        logDebug(`Adding support strength for ${unit.quantity} ${unit.type} units: KS=${unitInfo.killingStrength * effectivenessMultiplier}, DS=${unitInfo.defenseStrength * effectivenessMultiplier}`);
        killingStrength += unitInfo.killingStrength * unit.quantity * effectivenessMultiplier;
        defenseStrength += unitInfo.defenseStrength * unit.quantity * effectivenessMultiplier;
        OAP += unitInfo.killingStrength * unit.quantity * effectivenessMultiplier;
        DAS += unitInfo.defenseStrength * unit.quantity * effectivenessMultiplier;
      }
    });
  }

  const result = {
    killingStrength: Math.ceil(killingStrength * multiplier),
    defenseStrength: Math.ceil(defenseStrength * multiplier),
    OAP: Math.ceil(OAP * multiplier),
    DAS: Math.ceil(DAS * multiplier),
  };

  logInfo(`Final strength for ${unitType}: KS=${result.killingStrength}, DS=${result.defenseStrength}`);

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
  logDebug('turns:', turns);
  logDebug(`Uniform Factor: ${uniformFactor}, Turn Factor: ${turnFactor}`);

  const levelDifference = Math.min(Math.abs(defender.level - attacker.level), 5);
  const levelDifferenceFactor = 1 + Math.min(0.5, levelDifference * 0.05);
  logDebug(`Level Difference: ${levelDifference}, Level Difference Factor: ${levelDifferenceFactor}`);

  const defenderLevelFactor = calculateDefenderLevelFactor(defender.level);
  const lootFactor = uniformFactor * turnFactor * levelDifferenceFactor * defenderLevelFactor;
  logDebug(`Loot Factor: ${lootFactor}`);

  const defenderGold = BigInt(defender.gold);
  const calculatedLoot = Number(defenderGold) * lootFactor;
  logDebug(`Defender Gold: ${defenderGold}, Calculated Loot: ${calculatedLoot}`);
  if (!Number.isFinite(calculatedLoot) || isNaN(calculatedLoot) || calculatedLoot < 0) {
    console.warn(`Calculated loot is invalid: ${calculatedLoot}. Returning 0.`);
    return BigInt(0);
  }
  logDebug(`Calculated loot: ${calculatedLoot}, Defender Gold: ${defenderGold}, Loot Factor: ${lootFactor}`);
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
  piercingRatio: number,
  fortHitpoints?: number,
  includeCitz: boolean = false,
  includeOffense: boolean = false
): { attackerCasualties: number; defenderCasualties: number } {
  logError(`Piercing Ratio: ${piercingRatio}`);

  const baseLossPercent = 0.02;
  const scalingFactor = 0.04;

  const casualtyFactor = piercingRatio - 1;

  let defenderLossPercent = baseLossPercent + (casualtyFactor * scalingFactor);
  let attackerLossPercent = baseLossPercent - (casualtyFactor * scalingFactor);

  if (piercingRatio > 3) {
    attackerLossPercent = 0;
  }

  let defenderCasualties = Math.round(defenderPop * Math.max(0, defenderLossPercent));
  let attackerCasualties = Math.round(attackerPop * Math.max(0, attackerLossPercent));


  // If fort is destroyed, massive casualties for the defender
  if (fortHitpoints !== undefined && fortHitpoints <= 0) {
    defenderCasualties += Math.round(defenderPop * mtRand(20, 30) / 100);
  }

  // Cap casualties
  attackerCasualties = Math.min(attackerCasualties, attackerPop);
  defenderCasualties = Math.min(defenderCasualties, defenderPop);

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
    const availableAttackerUnits = offenseUnits.reduce((sum, unit) => sum + unit.quantity, 0);
    const effectiveAttackerCasualties = Math.min(casualties.attackerCasualties, availableAttackerUnits);
    const lostUnits = distributeUnitCasualties(offenseUnits, effectiveAttackerCasualties, 0.3);
    if (lostUnits.length > 0) {
      lostUnits.forEach(loss => {
        const existingLoss = result.Losses.Attacker.units.find(u => u.type === loss.type && u.level === loss.level);
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
    const { collateralDamage, fightingDamage } = distributeDamage(casualties.defenderCasualties, defender, fortHP);

    const collateralPool = defender.units.filter(u => u.type === 'CITIZEN' || u.type === 'WORKER');
    const fightingPool = defender.units.filter(u => u.type === 'DEFENSE');

    const collateralCasualties = distributeUnitCasualties(collateralPool, collateralDamage, 0.8);
    const fightingCasualties = distributeUnitCasualties(fightingPool, fightingDamage, 0.3);

    const allLostUnits = [...collateralCasualties, ...fightingCasualties];

    allLostUnits.forEach(loss => {
      const existingLoss = result.Losses.Defender.units.find(u => u.type === loss.type && u.level === loss.level);
      if (existingLoss) {
        existingLoss.quantity += loss.quantity;
      } else {
        result.Losses.Defender.units.push({ ...loss });
      }
    });

    result.Losses.Defender.total += allLostUnits.reduce((sum, unit) => sum + unit.quantity, 0);
  }
}

// Helper function to distribute casualties across units
function distributeUnitCasualties(units: BattleUnits[], totalCasualties: number, casualtyRate: number): BattleUnits[] {
  const lostUnits: BattleUnits[] = [];
  let remainingCasualties = Math.floor(totalCasualties * casualtyRate);

  const workingUnits = units.map(unit => ({ ...unit }))
    .filter(unit => unit.quantity > 0)
    .sort((a, b) => a.level - b.level);

  const totalAvailable = workingUnits.reduce((sum, unit) => sum + unit.quantity, 0);
  remainingCasualties = Math.min(remainingCasualties, totalAvailable);

  if (remainingCasualties <= 0 || workingUnits.length === 0) {
    return [];
  }

  const totalUnitCount = workingUnits.reduce((sum, unit) => sum + unit.quantity, 0);

  for (const unit of workingUnits) {
    if (remainingCasualties <= 0) break;

    const unitRatio = unit.quantity / totalUnitCount;
    let casualties = Math.floor(totalCasualties * unitRatio);
    casualties = Math.min(casualties, remainingCasualties);
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

  if (remainingCasualties > 0) {
    for (const unit of workingUnits) {
      if (remainingCasualties <= 0 || unit.quantity <= 0) continue;
      const casualties = Math.min(unit.quantity, remainingCasualties);
      const existingLoss = lostUnits.find(loss => loss.type === unit.type && loss.level === unit.level);
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

  lostUnits.forEach(loss => {
    const originalUnit = units.find(u => u.type === loss.type && u.level === loss.level);
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
  logDebug('Total Turns:', totalTurns);

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
  logDebug("\n=== BATTLE SUMMARY ===");
  logDebug(`Total turns: ${totalTurns}`);
  logDebug(`Fort damage: ${initialFortHP - fortHP} (${Math.round((initialFortHP - fortHP) / initialFortHP * 100)}%)`);
  logDebug("Attacker losses:");
  battleResult.casualtySummary.attacker.forEach(loss => {
    logDebug(`- ${loss.quantity} ${loss.type} units (Level ${loss.level})`);
  });
  logDebug(`Total attacker casualties: ${battleResult.Losses.Attacker.total}`);
  logDebug("Defender losses:");
  battleResult.casualtySummary.defender.forEach(loss => {
    logDebug(`- ${loss.quantity} ${loss.type} units (Level ${loss.level})`);
  });
  logDebug(`Total defender casualties: ${battleResult.Losses.Defender.total}`);

  calculateAndApplyExperience(battleResult, {
    attacker,
    defender,
    attackTurns: totalTurns,
    fortDestroyed: fortHP <= 0
  });
}

function logUnitCasualties(turn: number, attackerLosses: BattleUnits[], defenderLosses: BattleUnits[], debug: boolean) {
  if (!debug) return;
  
  logDebug(`\n=== Turn ${turn} Casualties ===`);
  
  // Log attacker losses
  if (attackerLosses.length > 0) {
    logDebug('Attacker lost:');
    attackerLosses.forEach(loss => {
      logDebug(`- ${loss.quantity} ${loss.type} units`);
    });
  } else {
    logDebug('Attacker: No casualties');
  }
  
  // Log defender losses
  if (defenderLosses.length > 0) {
    logDebug('Defender lost:');
    defenderLosses.forEach(loss => {
      logDebug(`- ${loss.quantity} ${loss.type} units`);
    });
  } else {
    logDebug('Defender: No casualties');
  }
}
function distributeDamage(attackerKS: number, defender: UserModel, fortHP: number): { collateralDamage: number, fightingDamage: number } {
  let collateralDamage = 0;
  let fightingDamage = 0;

  if (fortHP > 0) {
    // While the fort stands, collateral forces absorb most of the damage
    collateralDamage = attackerKS * 0.8;
    fightingDamage = attackerKS * 0.2; // 20% bleeds through
  } else {
    // Once the fort is breached, fighting forces take the brunt of the damage
    collateralDamage = attackerKS * 0.1;
    fightingDamage = attackerKS * 0.9;
  }

  return { collateralDamage, fightingDamage };
}
