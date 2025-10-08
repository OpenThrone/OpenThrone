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
  attackerMeleeAtkPower: number;
  attackerMeleeDefPower: number;
  attackerRangedAtkPower: number;
  attackerRangedDefPower: number;
  defenderMeleeAtkPower: number;
  defenderMeleeDefPower: number;
  defenderRangedAtkPower: number;
  defenderRangedDefPower: number;
  totalPillagedGold: bigint;
  totalAttackerCasualties: number;
  totalDefenderCasualties: number;
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
    attackerMeleeAtkPower: attackerStrength.MeleeAtkPower,
    attackerMeleeDefPower: attackerStrength.MeleeDefPower,
    attackerRangedAtkPower: attackerStrength.RangedAtkPower,
    attackerRangedDefPower: attackerStrength.RangedDefPower,
    defenderMeleeAtkPower: 0, // Will be calculated per turn for defender
    defenderMeleeDefPower: 0, // Will be calculated per turn for defender
    defenderRangedAtkPower: 0, // Will be calculated per turn for defender
    defenderRangedDefPower: 0, // Will be calculated per turn for defender
    totalPillagedGold: BigInt(0),
    totalAttackerCasualties: 0,
    totalDefenderCasualties: 0,
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


  let { MeleeAtkPower: attackerMeleeAtkPower, MeleeDefPower: attackerMeleeDefPower, RangedAtkPower: attackerRangedAtkPower, RangedDefPower: attackerRangedDefPower } = calculateAttackerStrength(state, turn);
  let { MeleeAtkPower: defenderMeleeAtkPower, MeleeDefPower: defenderMeleeDefPower, RangedAtkPower: defenderRangedAtkPower, RangedDefPower: defenderRangedDefPower } = calculateDefenderStrength(state, turn, debug);

  // Update state with current turn's calculated strengths
  state.attackerMeleeAtkPower = attackerMeleeAtkPower;
  state.attackerMeleeDefPower = attackerMeleeDefPower;
  state.attackerRangedAtkPower = attackerRangedAtkPower;
  state.attackerRangedDefPower = attackerRangedDefPower;
  state.defenderMeleeAtkPower = defenderMeleeAtkPower;
  state.defenderMeleeDefPower = defenderMeleeDefPower;
  state.defenderRangedAtkPower = defenderRangedAtkPower;
  state.defenderRangedDefPower = defenderRangedDefPower;

  // Fort destruction debuff (apply to defender's melee defense)
  if (state.fortHP <= 0) {
    state.defenderMeleeDefPower *= 0.5;
    state.defenderRangedDefPower *= 0.5;
  }

  // Turn-based attack logic
  let fortDamageThisTurn = 0;
  let attackerCasualtiesThisTurn = 0;
  let defenderCasualtiesThisTurn = 0;
  let pillagedGoldThisTurn = BigInt(0);

  // Defender's Ranged Attack (Every Turn)
  if (state.defenderRangedAtkPower > 0) {
    const damageToAttacker = state.defenderRangedAtkPower * state.levelMitigation;
    const casualties = newComputeCasualties(
      damageToAttacker, // Attacker's effective attack for ranged
      state.attackerMeleeDefPower, // Attacker's defense against ranged
      state.attackerOffenseRemaining,
      0, // No defender population targeted by ranged attack
      state.initialFortHP,
      state.defenderRangedAtkPower / (state.attackerMeleeDefPower || 1), // Piercing ratio for ranged
      state.fortHP,
      false,
      false
    );
    attackerCasualtiesThisTurn += casualties.attackerCasualties;
    if (debug) logDebug(`Defender Ranged Attack: ${damageToAttacker} damage, ${casualties.attackerCasualties} attacker casualties`);
  }

  if (turn % 2 !== 0) { // Odd Turn: Attacker's Turn
    // Attacker's Melee Attack
    const currentFortification = Fortifications.find(f => f.level === state.defender.fortLevel);
    const fortMeleeDefPower = currentFortification?.MeleeDefPower ?? 0;
    const fortRangedDefPower = currentFortification?.RangedDefPower ?? 0;

    const totalFortDefense = fortMeleeDefPower + fortRangedDefPower; // Sum of fort's defense powers
    const damageToFort = calculateFortDamage(state.attackerMeleeAtkPower, totalFortDefense);
    fortDamageThisTurn = damageToFort;
    state.fortHP = Math.max(state.fortHP - fortDamageThisTurn, 0);
    if (debug) logDebug(`Attacker Melee Attack: ${fortDamageThisTurn} fort damage`);

    const casualties = newComputeCasualties(
      state.attackerMeleeAtkPower,
      state.defenderMeleeDefPower,
      state.attackerOffenseRemaining,
      state.defenderDefenseRemaining + (state.shouldIncludeCitz ? (state.defenderCitizensRemaining + state.defenderWorkersRemaining) : 0) + (state.includeOffenseUnits ? state.defenderOffenseRemaining : 0),
      state.initialFortHP,
      state.attackerMeleeAtkPower / (state.defenderMeleeDefPower || 1), // Piercing ratio for melee
      state.fortHP,
      state.shouldIncludeCitz,
      state.includeOffenseUnits
    );
    attackerCasualtiesThisTurn += casualties.attackerCasualties;
    defenderCasualtiesThisTurn += casualties.defenderCasualties;
    if (debug) logDebug(`Attacker Melee Attack: ${casualties.defenderCasualties} defender casualties`);

    // PillageGold if applicable
    pillagedGoldThisTurn = calculateLoot(state.attacker, state.defender, turn);
    state.totalPillagedGold += pillagedGoldThisTurn;
    if (debug) logDebug(`Pillaged Gold this turn: ${pillagedGoldThisTurn}`);

    // Kill Citizens if applicable (handled by distributeCasualties)

  } else { // Even Turn: Defender's Turn
    // Defender's Melee Attack
    const casualties = newComputeCasualties(
      state.defenderMeleeAtkPower,
      state.attackerMeleeDefPower,
      state.defenderDefenseRemaining + (state.shouldIncludeCitz ? (state.defenderCitizensRemaining + state.defenderWorkersRemaining) : 0) + (state.includeOffenseUnits ? state.defenderOffenseRemaining : 0),
      state.attackerOffenseRemaining,
      state.initialFortHP,
      state.defenderMeleeAtkPower / (state.attackerMeleeDefPower || 1), // Piercing ratio for melee
      state.fortHP,
      false, // Defender's melee doesn't target citizens/workers directly
      false
    );
    attackerCasualtiesThisTurn += casualties.defenderCasualties; // Defender's attack causes attacker casualties
    if (debug) logDebug(`Defender Melee Attack: ${casualties.defenderCasualties} attacker casualties`);

    // ReducePillageGold if applicable
    const reducedGold = calculateLoot(state.defender, state.attacker, turn); // Assuming defender "loots back"
    state.totalPillagedGold -= reducedGold;
    if (debug) logDebug(`Reduced Pillaged Gold this turn: ${reducedGold}`);
  }
  
  // Update state tracking variables based on casualties
  state.attackerOffenseRemaining = Math.max(0, state.attackerOffenseRemaining - attackerCasualtiesThisTurn);
  state.totalAttackerCasualties += attackerCasualtiesThisTurn;

  // Update defender unit counts by checking the losses in battleResult
  // This part needs to be updated to reflect the casualties from this turn
  // and then apply them to the defender's remaining units.
  // For now, I'll just update the totalDefenderCasualties.
  state.totalDefenderCasualties += defenderCasualtiesThisTurn;

  // Distribute casualties to the virtual unit pools
  await distributeCasualties({
    result: state.battleResult,
    attacker: state.attacker,
    defender: state.defender,
    casualties: { attackerCasualties: attackerCasualtiesThisTurn, defenderCasualties: defenderCasualtiesThisTurn },
    fortHP: state.fortHP,
    defenderDefenseProportion: state.defenderDefenseRemaining /
      (state.defenderDefenseRemaining + state.defenderCitizensRemaining +
        state.defenderWorkersRemaining + state.defenderOffenseRemaining),
    initialFortHP: state.initialFortHP || Fortifications[state.defender.fortLevel].hitpoints,
    turn: turn,
    includeCitz: state.shouldIncludeCitz,
    includeOffense: state.includeOffenseUnits
  });

  // Update defender unit counts based on the actual losses recorded in battleResult
  // This is a bit tricky because distributeCasualties modifies battleResult.Losses.Defender.units
  // I need to re-calculate the remaining units based on the updated battleResult.Losses.Defender.units
  // For simplicity, I'll just re-read the defender's unit totals from the battleResult.
  // A more robust solution would involve passing the actual unit arrays and modifying them directly.
  state.defenderDefenseRemaining = state.defender.unitTotals.defense - state.battleResult.Losses.Defender.units.filter(u => u.type === 'DEFENSE').reduce((sum, u) => sum + u.quantity, 0);
  state.defenderCitizensRemaining = state.defender.unitTotals.citizens - state.battleResult.Losses.Defender.units.filter(u => u.type === 'CITIZEN').reduce((sum, u) => sum + u.quantity, 0);
  state.defenderWorkersRemaining = state.defender.unitTotals.workers - state.battleResult.Losses.Defender.units.filter(u => u.type === 'WORKER').reduce((sum, u) => sum + u.quantity, 0);
  state.defenderOffenseRemaining = state.defender.unitTotals.offense - state.battleResult.Losses.Defender.units.filter(u => u.type === 'OFFENSE').reduce((sum, u) => sum + u.quantity, 0);


  // Update stamina for next turn
  state.attackerStamina = calculateStaminaModifier(turn);
  if(debug) logDebug('FortHP at end of turn', state.fortHP);
}

/**
 * Calculates the attacker's strength for the current turn, factoring in stamina drop.
 * @param {any} state - The current battle state.
 * @param {number} turn - The current turn number.
 * @returns {{MeleeAtkPower: number, MeleeDefPower: number, RangedAtkPower: number, RangedDefPower: number}} The attacker's melee/ranged attack and defense strength.
 */
function calculateAttackerStrength(state, turn) {
  let staminaDrop = calculateStaminaDrop(turn);
  const staminaImpact = state.attackerStamina * staminaDrop;
  const attackerStrength = calculateStrength(state.attacker, 'OFFENSE');
  return {
    MeleeAtkPower: Math.ceil(attackerStrength.MeleeAtkPower * staminaImpact),
    MeleeDefPower: Math.ceil(attackerStrength.MeleeDefPower * staminaImpact),
    RangedAtkPower: Math.ceil(attackerStrength.RangedAtkPower * staminaImpact),
    RangedDefPower: Math.ceil(attackerStrength.RangedDefPower * staminaImpact),
  };
}

/**
 * Calculates the defender's strength for the current turn, including possible reinforcements and nerfs.
 * @param {any} state - The current battle state.
 * @param {number} turn - The current turn number.
 * @param {boolean} debug - Whether to enable debug logging.
 * @returns {{MeleeAtkPower: number, MeleeDefPower: number, RangedAtkPower: number, RangedDefPower: number}} The defender's melee/ranged attack and defense strength.
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
  
  let { MeleeAtkPower: defenderMeleeAtkPower, MeleeDefPower: defenderMeleeDefPower, RangedAtkPower: defenderRangedAtkPower, RangedDefPower: defenderRangedDefPower } = currentDefenderStrength;

  if (state.fortHP < 0.3 * state.initialFortHP) {
    if (turn <= 5) {
      // Early turns - defense is weakened
      logDebug('Fort is critically damaged, applying nerf factor to defense units');
      logDebug('Fort is critically damaged, applying citizens/workers to calculation');
      logDebug(`Turn: ${turn}, Fort HP: ${state.fortHP}, Initial Fort HP: ${state.initialFortHP}`);
      let nerfFactor = calculateDefenseNerfFactor(turn, state.fortHP, state.initialFortHP);
      logDebug(`Nerf Factor: ${nerfFactor}`);
      defenderMeleeAtkPower *= nerfFactor;
      defenderMeleeDefPower *= nerfFactor;
      defenderRangedAtkPower *= nerfFactor;
      defenderRangedDefPower *= nerfFactor;
    } else {
      // Later turns (Turn 6+) - offense units start joining the defense with reinforcements
      logDebug('Fort is critically damaged, applying reinforcements from offense units');
      let reinforcementModifier = includeOffenseUnits ? calculateReinforcementModifier(turn) : 0;
      let recoveryFactor = calculateRecoveryFactor(turn);
      
      // Apply reinforcement to melee and ranged defense
      defenderMeleeAtkPower = (defenderMeleeAtkPower + reinforcementModifier) * recoveryFactor;
      defenderMeleeDefPower = (defenderMeleeDefPower + reinforcementModifier) * recoveryFactor;
      defenderRangedAtkPower = (defenderRangedAtkPower + reinforcementModifier) * recoveryFactor;
      defenderRangedDefPower = (defenderRangedDefPower + reinforcementModifier) * recoveryFactor;
    }
  }
  return { MeleeAtkPower: defenderMeleeAtkPower, MeleeDefPower: defenderMeleeDefPower, RangedAtkPower: defenderRangedAtkPower, RangedDefPower: defenderRangedDefPower };
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
  attackerMeleeAtkPower: number,
  fortificationDefensePower: number // Combined melee and ranged defense of the fort
): number {
  const ratio = attackerMeleeAtkPower / (fortificationDefensePower || 1);
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

  const attackerXP = Math.round(isAttackerWinner ? totalXP * 0.75 : totalXP * 0.25);
  const defenderXP = Math.round(isAttackerWinner ? totalXP * 0.25 : totalXP * 0.75);

  logDebug('XP Calculation Details:', {
    isAttackerWinner,
    levelDifference,
    attackTurns,
    fortDestroyed,
    baseXP,
    levelBonus,
    fortBonus,
    turnsMultiplier,
    totalXP,
    attackerXP,
    defenderXP
  });

  return {
    attackerXP,
    defenderXP
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
): { MeleeAtkPower: number; MeleeDefPower: number; RangedAtkPower: number; RangedDefPower: number } {
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
    return { MeleeAtkPower: 0, MeleeDefPower: 0, RangedAtkPower: 0, RangedDefPower: 0 };
  }

  if (strengthCache.has(cacheKey)) {
    const cached = strengthCache.get(cacheKey);
    if (cached.MeleeAtkPower > 0 || cached.MeleeDefPower > 0 || cached.RangedAtkPower > 0 || cached.RangedDefPower > 0) {
      logDebug(`Using cached strength for ${unitType}: MeleeAtk=${cached.MeleeAtkPower}, MeleeDef=${cached.MeleeDefPower}, RangedAtk=${cached.RangedAtkPower}, RangedDef=${cached.RangedDefPower}`);
      return cached;
    }
    logDebug(`Cached strength for ${unitType} is zero, recalculating...`);
    strengthCache.delete(cacheKey);
  }

  let MeleeAtkPower = 0;
  let MeleeDefPower = 0;
  let RangedAtkPower = 0;
  let RangedDefPower = 0;
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

    // Apply item level restriction: unit.level >= item.level
    const usableItems = user.items
      .filter(item => item.usage === unit.type && item.level <= unit.level)
      .sort((a, b) => {
        const itemInfoA = itemTypeLookup[unit.type]?.[a.type];
        const itemInfoB = itemTypeLookup[unit.type]?.[b.type];
        return (itemInfoB?.MeleeAtkPower || 0) - (itemInfoA?.MeleeAtkPower || 0);
      });

    logDebug(`Adding strength for ${unit.quantity} ${unit.type} units: MeleeAtk=${unitInfo.MeleeAtkPower}, MeleeDef=${unitInfo.MeleeDefPower}, RangedAtk=${unitInfo.RangedAtkPower}, RangedDef=${unitInfo.RangedDefPower}`);
    MeleeAtkPower += (unitInfo.MeleeAtkPower || 0) * unit.quantity;
    MeleeDefPower += (unitInfo.MeleeDefPower || 0) * unit.quantity;
    RangedAtkPower += (unitInfo.RangedAtkPower || 0) * unit.quantity;
    RangedDefPower += (unitInfo.RangedDefPower || 0) * unit.quantity;

    logDebug(`Unit Strength - Type: ${unit.type}, Level: ${unit.level}, Quantity: ${unit.quantity}, ` +
      `MeleeAtk=${(unitInfo.MeleeAtkPower || 0) * unit.quantity}, MeleeDef=${(unitInfo.MeleeDefPower || 0) * unit.quantity}, ` +
      `RangedAtk=${(unitInfo.RangedAtkPower || 0) * unit.quantity}, RangedDef=${(unitInfo.RangedDefPower || 0) * unit.quantity}`);

    if (unit.quantity === 0) return;

    const itemCounts: Record<ItemType, number> = {
      WEAPON: 0,
      HELM: 0,
      BOOTS: 0,
      BRACERS: 0,
      SHIELD: 0,
      ARMOR: 0,
    };

    usableItems.forEach(item => {
      const currentCount = itemCounts[item.type] || 0;
      const itemInfo = itemTypeLookup[unit.type]?.[item.type];
      if (!itemInfo) return;

      const usableQuantity = Math.min(item.quantity, unit.quantity - currentCount);
      logDebug(`Adding item strength for ${usableQuantity} ${item.type} items: MeleeAtk=${itemInfo.MeleeAtkPower}, MeleeDef=${itemInfo.MeleeDefPower}, RangedAtk=${itemInfo.RangedAtkPower}, RangedDef=${itemInfo.RangedDefPower}`);
      MeleeAtkPower += (itemInfo.MeleeAtkPower || 0) * usableQuantity;
      MeleeDefPower += (itemInfo.MeleeDefPower || 0) * usableQuantity;
      RangedAtkPower += (itemInfo.RangedAtkPower || 0) * usableQuantity;
      RangedDefPower += (itemInfo.RangedDefPower || 0) * usableQuantity;
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
        logDebug(`Adding support strength for ${unit.quantity} ${unit.type} units: MeleeAtk=${unitInfo.MeleeAtkPower * effectivenessMultiplier}, MeleeDef=${unitInfo.MeleeDefPower * effectivenessMultiplier}, RangedAtk=${unitInfo.RangedAtkPower * effectivenessMultiplier}, RangedDef=${unitInfo.RangedDefPower * effectivenessMultiplier}`);
        MeleeAtkPower += (unitInfo.MeleeAtkPower || 0) * unit.quantity * effectivenessMultiplier;
        MeleeDefPower += (unitInfo.MeleeDefPower || 0) * unit.quantity * effectivenessMultiplier;
        RangedAtkPower += (unitInfo.RangedAtkPower || 0) * unit.quantity * effectivenessMultiplier;
        RangedDefPower += (unitInfo.RangedDefPower || 0) * unit.quantity * effectivenessMultiplier;
      }
    });
  }

  const result = {
    MeleeAtkPower: Math.ceil(MeleeAtkPower * multiplier),
    MeleeDefPower: Math.ceil(MeleeDefPower * multiplier),
    RangedAtkPower: Math.ceil(RangedAtkPower * multiplier),
    RangedDefPower: Math.ceil(RangedDefPower * multiplier),
  };

  logInfo(`Final strength for ${unitType}: MeleeAtk=${result.MeleeAtkPower}, MeleeDef=${result.MeleeDefPower}, RangedAtk=${result.RangedAtkPower}, RangedDef=${result.RangedDefPower}`);

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

/* Removed unused function computeBaseValue */
export function newComputeCasualties(
  attackerAtk: number,
  defenderDef: number,
  attackerPop: number,
  defenderPop: number,
  initialFortHP: number,
  piercingRatio: number,
  fortHitpoints?: number,
  includeCitz: boolean = false,
  includeOffense: boolean = false
): { attackerCasualties: number; defenderCasualties: number } {
  logDebug(`newComputeCasualties - AttackerAtk: ${attackerAtk}, DefenderDef: ${defenderDef}, PiercingRatio: ${piercingRatio}`);

  // === New HP-driven casualty model ===
  const baseLossPercent = 0.0025; // 0.25% floor attrition
  const scalingFactor = 0.01;     // slower ramp than before

  const casualtyFactor = piercingRatio - 1;

  let defenderLossPercent = baseLossPercent + (casualtyFactor * scalingFactor);
  let attackerLossPercent = baseLossPercent - (casualtyFactor * scalingFactor * 0.5); // attackers punished less

  // Apply clamps
  // Loosen casualty capping rules under overwhelming offense
  if (piercingRatio > 3) {
    // In overwhelming scenarios, defenders can take up to 20% losses per turn
    defenderLossPercent = Math.min(Math.max(defenderLossPercent, baseLossPercent), 0.2);
    // Attackers take negligible or no casualties once overwhelming
    attackerLossPercent = 0;
  } else {
    defenderLossPercent = Math.min(Math.max(defenderLossPercent, baseLossPercent), 0.05); // defenders max 5% casualties/turn
    attackerLossPercent = Math.min(Math.max(attackerLossPercent, 0), 0.03);              // attackers max 3% casualties/turn
  }

  let defenderCasualties = Math.floor(defenderPop * defenderLossPercent);
  let attackerCasualties = Math.floor(attackerPop * attackerLossPercent);

  // If fort is destroyed, civilians exposed gradually
  if (fortHitpoints !== undefined && fortHitpoints <= 0 && includeCitz) {
    const collateralExtra = Math.floor(defenderPop * 0.02); // 2% extra spread across turns
    defenderCasualties += collateralExtra;
  }

  // Cap casualties so never exceed populations
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
    // Distribute damage based on fort status
    const { collateralDamage, fightingDamage } = distributeDamage(casualties.defenderCasualties, defender, fortHP);

    const collateralPool = defender.units.filter(u => u.type === 'CITIZEN' || u.type === 'WORKER');
    const fightingPool = defender.units.filter(u => u.type === 'DEFENSE' || u.type === 'OFFENSE'); // Include offense in fighting pool if applicable

    // Distribute casualties with weighting for lower levels
    const collateralCasualties = distributeUnitCasualties(collateralPool, collateralDamage, 0.8); // Higher rate for collateral
    const fightingCasualties = distributeUnitCasualties(fightingPool, fightingDamage, 0.3); // Lower rate for fighting units

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

// Helper function to distribute casualties across units, weighting lower levels more heavily
function distributeUnitCasualties(units: BattleUnits[], totalCasualties: number, baseCasualtyRate: number): BattleUnits[] {
  const lostUnits: BattleUnits[] = [];
  let remainingCasualties = totalCasualties;

  const workingUnits = units.map(unit => ({ ...unit }))
    .filter(unit => unit.quantity > 0)
    .sort((a, b) => a.level - b.level); // Sort by level ascending (lower levels first)

  const totalAvailable = workingUnits.reduce((sum, unit) => sum + unit.quantity, 0);
  remainingCasualties = Math.min(remainingCasualties, totalAvailable);

  if (remainingCasualties <= 0 || workingUnits.length === 0) {
    return [];
  }

  // First pass: Apply weighted casualties
  for (const unit of workingUnits) {
    if (remainingCasualties <= 0) break;

    // Higher casualty rate for lower-level units
    const levelWeight = 1 + (3 - unit.level) * 0.2; // Example: Level 1 gets 1.4x, Level 3 gets 0.6x
    const weightedCasualtyRate = Math.max(0.1, baseCasualtyRate * levelWeight); // Ensure minimum rate

    let casualtiesForUnit = Math.floor(unit.quantity * weightedCasualtyRate);
    casualtiesForUnit = Math.min(casualtiesForUnit, remainingCasualties);
    casualtiesForUnit = Math.min(casualtiesForUnit, unit.quantity);

    if (casualtiesForUnit > 0) {
      lostUnits.push({
        type: unit.type,
        level: unit.level,
        quantity: casualtiesForUnit,
      });
      unit.quantity -= casualtiesForUnit;
      remainingCasualties -= casualtiesForUnit;
    }
  }

  // Second pass: Distribute any remaining casualties proportionally
  if (remainingCasualties > 0) {
    const currentTotalUnits = workingUnits.reduce((sum, unit) => sum + unit.quantity, 0);
    if (currentTotalUnits > 0) {
      for (const unit of workingUnits) {
        if (remainingCasualties <= 0 || unit.quantity <= 0) continue;

        const proportion = unit.quantity / currentTotalUnits;
        let casualties = Math.floor(remainingCasualties * proportion);
        casualties = Math.min(casualties, remainingCasualties);
        casualties = Math.min(casualties, unit.quantity);

        if (casualties > 0) {
          const existingLoss = lostUnits.find(loss => loss.type === unit.type && loss.level === unit.level);
          if (existingLoss) {
            existingLoss.quantity += casualties;
          } else {
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
    }
  }

  // Ensure no unit quantity goes below zero in the original array (though distributeCasualties returns new objects)
  // This part is more for conceptual clarity if we were modifying the original array directly.
  // Since we are returning new objects, this is less critical here.
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

export function calculateAndApplyExperience(
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
  
  // Determine winner based on multiple criteria
  const defenderLosses = result.Losses.Defender.total;
  const attackerLosses = result.Losses.Attacker.total;
  
  // Primary criterion: Unit casualties
  let isAttackerWinner = defenderLosses > attackerLosses;
  
  // Secondary criteria: When casualties are equal, consider additional factors
  if (defenderLosses === attackerLosses) {
    // 1. Fort damage dealt by attacker
    const fortDamage = (result.casualtySummary && result.casualtySummary.fortDamage) || 0;
    const initialFortHP = params.defender.fortHitpoints || Fortifications[params.defender.fortLevel].hitpoints;
    
    // 2. Damage dealt vs damage received (approximated by fort damage and casualty comparison)
    const attackerDealsMoreDamage = fortDamage > 0;
    
    // 3. Consider fort destruction as a clear win condition
    const fortDestroyed = result.finalFortHP <= 0;
    
    // Attacker wins if they dealt fort damage or destroyed the fort
    isAttackerWinner = attackerDealsMoreDamage || fortDestroyed;
    
    logDebug('Battle outcome determined by secondary criteria:', {
      defenderLosses,
      attackerLosses,
      fortDamage,
      initialFortHP,
      attackerDealsMoreDamage,
      fortDestroyed,
      isAttackerWinner
    });
  } else {
    logDebug('Battle outcome determined by casualties:', {
      defenderLosses,
      attackerLosses,
      isAttackerWinner
    });
  }
  
  // Calculate experience based on battle outcome
  const { attackerXP, defenderXP } = calculateBattleExperience(
    isAttackerWinner,
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
  
  logDebug('Experience applied to result:', {
    result: result.result,
    experienceGained: result.experienceGained
  });
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

  battleResult.pillagedGold = state.totalPillagedGold; // Use the accumulated total
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
    }
    );
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
function distributeDamage(totalCasualties: number, defender: UserModel, fortHP: number): { collateralDamage: number, fightingDamage: number } {
  let collateralDamage = 0;
  let fightingDamage = 0;

  const COLLATERAL_DEFENSE_SHARE = 0.3;

  const defenseCount = defender.unitTotals.defense;
  const citizenCount = defender.unitTotals.citizens + defender.unitTotals.workers;
  const totalPool = defenseCount + citizenCount;

  if (totalPool <= 0) {
    return { collateralDamage: 0, fightingDamage: 0 };
  }

  if (fortHP > 0) {
    // While fort stands, only 30% of citizens count as militia in the defense pool
    const effectiveCitizenShare = citizenCount * COLLATERAL_DEFENSE_SHARE;
    const totalDefensePool = defenseCount + effectiveCitizenShare;
    fightingDamage = totalCasualties * (defenseCount / totalDefensePool);
    collateralDamage = totalCasualties - fightingDamage;
  } else {
    // Fort is breached: distribute casualties strictly proportional to real counts
    fightingDamage = totalCasualties * (defenseCount / totalPool);
    collateralDamage = totalCasualties - fightingDamage;
  }

  return { collateralDamage, fightingDamage };
}
