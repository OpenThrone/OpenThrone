import {
  ArmoryUpgrades,
  BattleUpgrades,
  Fortifications,
  ItemTypes,
  UnitTypes,
} from '@/constants';
import BattleResult from '@/models/BattleResult';
import type {
  BreachState,
  StaminaModifiers,
  StaminaState,
} from '@/types/combat';
import type { BattleUnits, ItemType } from '@/types/typings';

import { logDebug, logInfo } from './logger';
import mtRand from './mtrand';

export type BattleUserLike = {
  [key: string]: any;
  id?: number;
  displayName?: string;
  level?: number;
  population?: number;
  fortLevel?: number;
  fortHitpoints?: number;
  gold?: bigint;
  units?: BattleUnits[];
  mercenaries?: BattleUnits[];
  items?: any[];
  structure_upgrades?: any[];
  battle_upgrades?: any[];
  bonus_points?: any[];
  playerBonuses?: any[];
  attackBonus?: number;
  defenseBonus?: number;
};

function getUnitTotals(user: BattleUserLike): {
  citizens: number;
  workers: number;
  offense: number;
  defense: number;
  spies: number;
  sentries: number;
} {
  const totals = {
    citizens: 0,
    workers: 0,
    offense: 0,
    defense: 0,
    spies: 0,
    sentries: 0,
  };

  const allUnits: BattleUnits[] = [
    ...(user.units || []),
    ...(user.mercenaries || []),
  ];

  for (const unit of allUnits) {
    const quantity = unit?.quantity ?? 0;
    switch (unit?.type) {
      case 'CITIZEN':
        totals.citizens += quantity;
        break;
      case 'WORKER':
        totals.workers += quantity;
        break;
      case 'OFFENSE':
        totals.offense += quantity;
        break;
      case 'DEFENSE':
        totals.defense += quantity;
        break;
      case 'SPY':
        totals.spies += quantity;
        break;
      case 'SENTRY':
        totals.sentries += quantity;
        break;
    }
  }

  return totals;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getFortificationByLevel(level: number | undefined | null) {
  if (typeof level !== 'number') return Fortifications[0];
  return (
    Fortifications.find((f) => f.level === level) ??
    Fortifications[level] ??
    Fortifications[0]
  );
}

function getUserCasualtyBonusPercent(user: BattleUserLike): number {
  const bonuses = (user as any)?.playerBonuses;
  const bonusFromPlayerBonuses = Array.isArray(bonuses)
    ? bonuses
        .filter(
          (b: any) => String(b?.bonusType ?? '').toUpperCase() === 'CASUALTY',
        )
        .reduce(
          (sum: number, b: any) => sum + (Number(b?.bonusAmount ?? 0) || 0),
          0,
        )
    : 0;

  const bonusPoints = (user as any)?.bonus_points;
  const bonusFromBonusPoints = Array.isArray(bonusPoints)
    ? bonusPoints
        .filter((b: any) => String(b?.type ?? '').toUpperCase() === 'CASUALTY')
        .reduce((sum: number, b: any) => sum + (Number(b?.level ?? 0) || 0), 0)
    : 0;

  return bonusFromPlayerBonuses + bonusFromBonusPoints;
}

function getStructureCasualtyMitigationPercent(
  structureUpgrades: any[] | undefined,
): number {
  if (!Array.isArray(structureUpgrades)) return 0;
  const armoryLevel =
    structureUpgrades.find((u) => u?.type === 'ARMORY')?.level ?? 1;
  const upgrade = ArmoryUpgrades.find((u: any) => u.level === armoryLevel);
  return Number(upgrade?.casualtyMitigationPercentage ?? 0) || 0;
}

function calculateFortMitigation(params: {
  defenderFortLevel: number | undefined;
  defenderCasualtyBonusPct: number | undefined;
  defenderStructureMitigationPct: number | undefined;
  fortHpRatio: number;
}) {
  const fortification = getFortificationByLevel(params.defenderFortLevel ?? 0);
  const fortMitigationPct =
    (Number(fortification?.casualtyMitigation ?? 0) || 0) / 100;
  const casualtyBonusPct =
    (Number(params.defenderCasualtyBonusPct ?? 0) || 0) / 100;
  const structureMitigationPct =
    (Number(params.defenderStructureMitigationPct ?? 0) || 0) / 100;

  const fortRelatedPct =
    (fortMitigationPct + casualtyBonusPct) * params.fortHpRatio;
  const totalMitigationPct = clamp(
    fortRelatedPct + structureMitigationPct,
    0,
    0.75,
  );
  const mitigationMultiplier = 1 - totalMitigationPct;

  return {
    defenderFortLevel: params.defenderFortLevel,
    defenderFortMitigationPct: fortMitigationPct * 100,
    defenderCasualtyBonusPct: casualtyBonusPct * 100,
    defenderStructureMitigationPct: structureMitigationPct * 100,
    totalMitigationPct: totalMitigationPct * 100,
    mitigationMultiplier,
  };
}
interface BattleState {
  attacker: BattleUserLike;
  defender: BattleUserLike;
  battleResult: BattleResult;
  fortHP: number;
  initialFortHP?: number;
  startFortHP: number;
  attackerStamina: number;
  totalTurns: number;
  isDefenderProtected: boolean;
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
  MAX_TURNS: 15,
  FORT_CRITICAL_THRESHOLD: 0.3,
  LOW_DEFENSE_RATIO: 0.25,
  BASE_STAMINA_DROP: 0.9,
  MAX_LEVEL_DIFFERENCE: 5,
  BASE_XP: 1000,
  STAMINA_MULTIPLIERS: {
    EARLY_PHASE: 1.0, // Turns 1-5
    MID_PHASE: 0.9, // Turns 6-10
    LATE_PHASE: 0.75, // Turns 11-15
    CRITICAL_PHASE: 0.5,
    REINFORCEMENT_PHASE: 0.6,
  },
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
  attacker: BattleUserLike,
  defender: BattleUserLike,
  initialFortHP: number,
  totalTurns: number,
  debug: boolean = false,
  isDefenderProtected: boolean = (defender.level ?? 0) <= 9,
): Promise<BattleResult> {
  if (debug)
    logDebug(
      'Simulating battle between',
      attacker.displayName,
      'and',
      defender.displayName,
    );
  logDebug('simulateBattle');
  logDebug('setting total turns:', totalTurns);
  const state = initializeBattleState(
    attacker,
    defender,
    initialFortHP,
    isDefenderProtected,
    debug,
  );
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
 * @param {boolean} isDefenderProtected - Whether defender is protected by low-level mitigation.
 * @param {boolean} debug - Whether to enable debug logging.
 * @returns {BattleState} The initialized battle state.
 */
function initializeBattleState(
  attacker: BattleUserLike,
  defender: BattleUserLike,
  initialFortHP: number,
  isDefenderProtected: boolean,
  debug: boolean,
) {
  const battleResult = new BattleResult(attacker as any, defender as any);
  const attackerStrength = calculateStrength(attacker, 'OFFENSE');
  const fortification = getFortificationByLevel(defender.fortLevel ?? 0);
  const resolvedStartFortHP = Number.isFinite(initialFortHP)
    ? Math.max(0, initialFortHP)
    : 0;
  const resolvedMaxFortHP =
    Number.isFinite(initialFortHP) && initialFortHP > 0
      ? initialFortHP
      : fortification.hitpoints;

  const initializeUnitHp = (
    units: BattleUnits[],
    isMercenary: boolean,
  ): BattleUnits[] =>
    (units || []).map((unit) => {
      const unitInfo = UnitTypes.find(
        (info) => info.type === unit.type && info.level === unit.level,
      );
      return {
        ...unit,
        isMercenary: unit.isMercenary ?? isMercenary,
        currentHP: unit.currentHP ?? unitInfo?.hp ?? 1,
      };
    });

  attacker.units = initializeUnitHp(attacker.units || [], false);
  attacker.mercenaries = initializeUnitHp(attacker.mercenaries || [], true);
  defender.units = initializeUnitHp(defender.units || [], false);
  defender.mercenaries = initializeUnitHp(defender.mercenaries || [], true);

  const attackerTotals = getUnitTotals(attacker);
  const defenderTotals = getUnitTotals(defender);

  const state: BattleState = {
    attacker,
    defender,
    battleResult,
    fortHP: resolvedStartFortHP,
    attackerStamina: 1.0,
    totalTurns: 0,
    isDefenderProtected,
    initialFortHP: resolvedMaxFortHP,
    startFortHP: resolvedStartFortHP,
    attackerOffenseRemaining: attackerTotals.offense,
    defenderDefenseRemaining: defenderTotals.defense,
    defenderCitizensRemaining: defenderTotals.citizens,
    defenderWorkersRemaining: defenderTotals.workers,
    defenderOffenseRemaining: defenderTotals.offense,
    attackerMeleeAtkPower: attackerStrength.totalStats.MeleeAtkPower,
    attackerMeleeDefPower: attackerStrength.totalStats.MeleeDefPower,
    attackerRangedAtkPower: attackerStrength.totalStats.RangedAtkPower,
    attackerRangedDefPower: attackerStrength.totalStats.RangedDefPower,
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

function sumUnitQuantity(
  user: BattleUserLike,
  type: BattleUnits['type'],
): number {
  const allUnits: BattleUnits[] = [
    ...(user.units || []),
    ...(user.mercenaries || []),
  ];
  return allUnits
    .filter((u) => u.type === type)
    .reduce((sum, u) => sum + (u.quantity || 0), 0);
}

function pruneEmptyUnits(user: BattleUserLike): void {
  user.units = (user.units || []).filter((u) => (u.quantity || 0) > 0);
  user.mercenaries = (user.mercenaries || []).filter(
    (u) => (u.quantity || 0) > 0,
  );
}
/**
 * Executes a single turn of the battle, updating the state with casualties and fortification damage.
 * @param {any} state - The current battle state.
 * @param {number} turn - The current turn number.
 * @param {boolean} debug - Whether to enable debug logging.
 */
async function executeBattleTurn(state: any, turn: number, debug: boolean) {
  state.totalTurns = turn;
  state.levelMitigation = 1.0; // Default mitigation factor
  const attackerLevel = Number(state.attacker?.level ?? 0);
  const defenderLevel = Number(state.defender?.level ?? 0);
  if (attackerLevel > defenderLevel + BATTLE_CONSTANTS.MAX_LEVEL_DIFFERENCE) {
    state.levelMitigation =
      0.96 **
      (attackerLevel - defenderLevel - BATTLE_CONSTANTS.MAX_LEVEL_DIFFERENCE);
  }
  if (debug)
    logDebug(`Turn ${turn} - Level Mitigation: ${state.levelMitigation}`);

  const {
    MeleeAtkPower: attackerMeleeAtkPower,
    MeleeDefPower: attackerMeleeDefPower,
    RangedAtkPower: attackerRangedAtkPower,
    RangedDefPower: attackerRangedDefPower,
  } = calculateAttackerStrength(state, turn);
  const {
    MeleeAtkPower: defenderMeleeAtkPower,
    MeleeDefPower: defenderMeleeDefPower,
    RangedAtkPower: defenderRangedAtkPower,
    RangedDefPower: defenderRangedDefPower,
  } = calculateDefenderStrength(state, turn, debug);

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
  const fortHpStartOfTurn = state.fortHP;

  // Defender's Ranged Attack (Every Turn)
  if (state.defenderRangedAtkPower > 0) {
    const rangedDamageResult = newComputeCasualties(
      state.defenderRangedAtkPower * state.levelMitigation, // Attacker's effective attack for ranged
      state.attackerRangedDefPower, // Attacker's defense against ranged
      state.attackerOffenseRemaining, // Attacker population (will be removed later)
      0, // No defender population targeted by ranged attack (will be removed later)
      state.initialFortHP,
      state.defenderRangedAtkPower / (state.attackerRangedDefPower || 1), // Piercing ratio for ranged
      undefined,
      false,
      false,
    );
    state.battleResult.mitigationLog.push({
      turn,
      source: 'DEFENDER',
      attackType: 'RANGED',
      rawDamage: rangedDamageResult.rawDamageDealt,
      mitigatedDamage: rangedDamageResult.damageDealt,
      fortSoakMultiplier: rangedDamageResult.fortSoakMultiplier,
      mitigationMultiplier: rangedDamageResult.mitigationMultiplier,
      fortHpStart: fortHpStartOfTurn,
      fortHpEnd: state.fortHP,
      fortHpRatio: state.initialFortHP
        ? clamp(state.fortHP / state.initialFortHP, 0, 1)
        : 0,
      fortBreached: state.fortHP <= 0,
      includeCitz: false,
      includeOffense: false,
    });
    const { attackerCasualties: rangedAttackerCasualties } =
      await distributeCasualties({
        result: state.battleResult,
        attacker: state.attacker,
        defender: state.defender,
        attackerDamageDealt: 0, // Defender's ranged attack deals damage to attacker
        defenderDamageDealt: rangedDamageResult.damageDealt,
        fortHP: state.fortHP,
        initialFortHP:
          state.initialFortHP ||
          getFortificationByLevel(state.defender.fortLevel).hitpoints,
        turn,
        includeCitz: state.shouldIncludeCitz,
        includeOffense: state.includeOffenseUnits,
      });
    attackerCasualtiesThisTurn += rangedAttackerCasualties;
    if (debug)
      logDebug(
        `Defender Ranged Attack: ${rangedDamageResult.damageDealt} damage, ${rangedAttackerCasualties} attacker casualties`,
      );
  }

  if (turn % 2 !== 0) {
    // Odd Turn: Attacker's Turn
    // Attacker's Melee Attack
    const currentFortification = Fortifications.find(
      (f) => f.level === state.defender.fortLevel,
    );
    const fortMeleeDefPower = currentFortification?.MeleeDefPower ?? 0;
    const fortRangedDefPower = currentFortification?.RangedDefPower ?? 0;

    const totalFortDefense = fortMeleeDefPower + fortRangedDefPower; // Sum of fort's defense powers
    const damageToFort = calculateFortDamage(
      state.attackerMeleeAtkPower,
      totalFortDefense,
    );
    fortDamageThisTurn = damageToFort;
    state.fortHP = Math.max(state.fortHP - fortDamageThisTurn, 0);
    if (debug)
      logDebug(`Attacker Melee Attack: ${fortDamageThisTurn} fort damage`);

    const meleeDamageResult = newComputeCasualties(
      state.attackerMeleeAtkPower,
      state.defenderMeleeDefPower,
      state.attackerOffenseRemaining, // Attacker population (will be removed later)
      state.defenderDefenseRemaining +
        (state.shouldIncludeCitz
          ? state.defenderCitizensRemaining + state.defenderWorkersRemaining
          : 0) +
        (state.includeOffenseUnits ? state.defenderOffenseRemaining : 0), // Defender population (will be removed later)
      state.initialFortHP,
      state.attackerMeleeAtkPower / (state.defenderMeleeDefPower || 1), // Piercing ratio for melee
      state.fortHP,
      state.shouldIncludeCitz,
      state.includeOffenseUnits,
      state.isDefenderProtected,
      {
        defenderFortLevel: state.defender.fortLevel,
        defenderCasualtyBonusPct: getUserCasualtyBonusPercent(state.defender),
        defenderStructureUpgrades: state.defender.structure_upgrades,
      },
    );
    state.battleResult.mitigationLog.push({
      turn,
      source: 'ATTACKER',
      attackType: 'MELEE',
      rawDamage: meleeDamageResult.rawDamageDealt,
      mitigatedDamage: meleeDamageResult.damageDealt,
      fortSoakMultiplier: meleeDamageResult.fortSoakMultiplier,
      mitigationMultiplier: meleeDamageResult.mitigationMultiplier,
      fortHpStart: fortHpStartOfTurn,
      fortHpEnd: state.fortHP,
      fortHpRatio: state.initialFortHP
        ? clamp(state.fortHP / state.initialFortHP, 0, 1)
        : 0,
      defenderFortLevel: meleeDamageResult.mitigation?.defenderFortLevel,
      defenderFortMitigationPct:
        meleeDamageResult.mitigation?.defenderFortMitigationPct,
      defenderCasualtyBonusPct:
        meleeDamageResult.mitigation?.defenderCasualtyBonusPct,
      defenderStructureMitigationPct:
        meleeDamageResult.mitigation?.defenderStructureMitigationPct,
      totalMitigationPct: meleeDamageResult.mitigation?.totalMitigationPct,
      fortBreached: state.fortHP <= 0,
      includeCitz: !!state.shouldIncludeCitz,
      includeOffense: !!state.includeOffenseUnits,
    });
    const {
      attackerCasualties: meleeAttackerCasualties,
      defenderCasualties: meleeDefenderCasualties,
    } = await distributeCasualties({
      result: state.battleResult,
      attacker: state.attacker,
      defender: state.defender,
      attackerDamageDealt: meleeDamageResult.damageDealt, // Attacker's melee attack deals damage to defender
      defenderDamageDealt: 0,
      fortHP: state.fortHP,
      initialFortHP:
        state.initialFortHP ||
        getFortificationByLevel(state.defender.fortLevel).hitpoints,
      turn,
      includeCitz: state.shouldIncludeCitz,
      includeOffense: state.includeOffenseUnits,
    });
    attackerCasualtiesThisTurn += meleeAttackerCasualties;
    defenderCasualtiesThisTurn += meleeDefenderCasualties;
    if (debug)
      logDebug(
        `Attacker Melee Attack: ${meleeDamageResult.damageDealt} damage, ${meleeDefenderCasualties} defender casualties`,
      );

    // PillageGold if applicable
    pillagedGoldThisTurn = calculateLoot(state.attacker, state.defender, turn);
    // Ensure pillageThis is BigInt and clamp to defender's current gold on-hand.
    const pillageThis =
      typeof pillagedGoldThisTurn === 'bigint'
        ? pillagedGoldThisTurn
        : BigInt(String(pillagedGoldThisTurn || '0'));
    const currentDefGold = BigInt(state.defender.gold ?? BigInt(0));
    const appliedPillage =
      pillageThis > currentDefGold ? currentDefGold : pillageThis;
    // Accumulate and immediately deduct from defender so subsequent turns use remaining gold.
    state.totalPillagedGold += appliedPillage;
    state.defender.gold = currentDefGold - appliedPillage;
    if (debug)
      logDebug(
        `Pillaged Gold this turn (requested: ${pillageThis}, applied: ${appliedPillage})`,
      );

    // Kill Citizens if applicable (handled by distributeCasualties)
  } else {
    // Even Turn: Defender's Turn
    // Defender's Melee Attack
    const meleeDamageResult = newComputeCasualties(
      state.defenderMeleeAtkPower,
      state.attackerMeleeDefPower,
      state.defenderDefenseRemaining +
        (state.shouldIncludeCitz
          ? state.defenderCitizensRemaining + state.defenderWorkersRemaining
          : 0) +
        (state.includeOffenseUnits ? state.defenderOffenseRemaining : 0), // Defender population (will be removed later)
      state.attackerOffenseRemaining, // Attacker population (will be removed later)
      state.initialFortHP,
      state.defenderMeleeAtkPower / (state.attackerMeleeDefPower || 1), // Piercing ratio for melee
      undefined,
      false, // Defender's melee doesn't target citizens/workers directly
      false,
    );
    const { attackerCasualties: meleeAttackerCasualties } =
      await distributeCasualties({
        result: state.battleResult,
        attacker: state.attacker,
        defender: state.defender,
        attackerDamageDealt: 0,
        defenderDamageDealt: meleeDamageResult.damageDealt, // Defender's melee attack deals damage to attacker
        fortHP: state.fortHP,
        initialFortHP:
          state.initialFortHP ||
          getFortificationByLevel(state.defender.fortLevel).hitpoints,
        turn,
        includeCitz: state.shouldIncludeCitz,
        includeOffense: state.includeOffenseUnits,
      });
    attackerCasualtiesThisTurn += meleeAttackerCasualties; // Defender's attack causes attacker casualties
    if (debug)
      logDebug(
        `Defender Melee Attack: ${meleeDamageResult.damageDealt} damage, ${meleeAttackerCasualties} attacker casualties`,
      );
  }

  // Update state tracking variables based on casualties
  pruneEmptyUnits(state.attacker);
  pruneEmptyUnits(state.defender);

  state.attackerOffenseRemaining = sumUnitQuantity(state.attacker, 'OFFENSE');
  state.defenderDefenseRemaining = sumUnitQuantity(state.defender, 'DEFENSE');
  state.defenderCitizensRemaining = sumUnitQuantity(state.defender, 'CITIZEN');
  state.defenderWorkersRemaining = sumUnitQuantity(state.defender, 'WORKER');
  state.defenderOffenseRemaining = sumUnitQuantity(state.defender, 'OFFENSE');

  state.totalAttackerCasualties += attackerCasualtiesThisTurn;
  state.totalDefenderCasualties += defenderCasualtiesThisTurn;

  // Update stamina for next turn
  state.attackerStamina = calculateStaminaModifier(turn);
  if (debug) logDebug('FortHP at end of turn', state.fortHP);
}

/**
 * Calculates the attacker's strength for the current turn, factoring in stamina drop.
 * @param {any} state - The current battle state.
 * @param {number} turn - The current turn number.
 * @returns {{MeleeAtkPower: number, MeleeDefPower: number, RangedAtkPower: number, RangedDefPower: number}} The attacker's melee/ranged attack and defense strength.
 */
function calculateAttackerStrength(state, turn) {
  const staminaDrop = calculateStaminaDrop(turn);
  const staminaImpact = state.attackerStamina * staminaDrop;
  const attackerStrength = calculateStrength(state.attacker, 'OFFENSE');
  return {
    MeleeAtkPower: Math.ceil(
      attackerStrength.totalStats.MeleeAtkPower * staminaImpact,
    ),
    MeleeDefPower: Math.ceil(
      attackerStrength.totalStats.MeleeDefPower * staminaImpact,
    ),
    RangedAtkPower: Math.ceil(
      attackerStrength.totalStats.RangedAtkPower * staminaImpact,
    ),
    RangedDefPower: Math.ceil(
      attackerStrength.totalStats.RangedDefPower * staminaImpact,
    ),
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
  const fortification = getFortificationByLevel(state.defender?.fortLevel ?? 0);
  const shouldIncludeCitz =
    state.defenderDefenseRemaining <=
      BATTLE_CONSTANTS.LOW_DEFENSE_RATIO * (state.defender?.population ?? 0) ||
    state.fortHP <=
      fortification.hitpoints * BATTLE_CONSTANTS.FORT_CRITICAL_THRESHOLD;
  if (debug)
    logDebug(
      `Defender Defense Remaining: ${state.defenderDefenseRemaining}`,
      `<= ${BATTLE_CONSTANTS.LOW_DEFENSE_RATIO * (state.defender?.population ?? 0)}: ${state.defenderDefenseRemaining <= BATTLE_CONSTANTS.LOW_DEFENSE_RATIO * (state.defender?.population ?? 0)}`,
    );
  if (debug) logDebug(`Should Include All Units: ${shouldIncludeCitz}`);

  // Only include offense units in later turns when fort is critically damaged
  const includeOffenseUnits =
    shouldIncludeCitz &&
    turn > 5 &&
    state.fortHP <
      fortification.hitpoints * BATTLE_CONSTANTS.FORT_CRITICAL_THRESHOLD;
  if (debug)
    logDebug(
      `Turn ${turn} - Fort HP: ${state.fortHP}, Critical Threshold: ${fortification.hitpoints * BATTLE_CONSTANTS.FORT_CRITICAL_THRESHOLD}`,
    );
  if (debug)
    logDebug(
      `Turn ${turn} - Should Include Offense Units: ${includeOffenseUnits}`,
    );

  state.shouldIncludeCitz = shouldIncludeCitz;
  state.includeOffenseUnits = includeOffenseUnits;

  const currentDefenderStrength = calculateStrength(
    state.defender,
    'DEFENSE',
    shouldIncludeCitz,
    includeOffenseUnits,
  );
  if (debug)
    logDebug(
      `Defender Strength: ${JSON.stringify(currentDefenderStrength.totalStats)}`,
    );

  let {
    MeleeAtkPower: defenderMeleeAtkPower,
    MeleeDefPower: defenderMeleeDefPower,
    RangedAtkPower: defenderRangedAtkPower,
    RangedDefPower: defenderRangedDefPower,
  } = currentDefenderStrength.totalStats;

  if (state.fortHP < 0.3 * state.initialFortHP) {
    if (turn <= 5) {
      // Early turns - defense is weakened
      logDebug(
        'Fort is critically damaged, applying nerf factor to defense units',
      );
      logDebug(
        'Fort is critically damaged, applying citizens/workers to calculation',
      );
      logDebug(
        `Turn: ${turn}, Fort HP: ${state.fortHP}, Initial Fort HP: ${state.initialFortHP}`,
      );
      const nerfFactor = calculateDefenseNerfFactor(
        turn,
        state.fortHP,
        state.initialFortHP,
      );
      logDebug(`Nerf Factor: ${nerfFactor}`);
      defenderMeleeAtkPower *= nerfFactor;
      defenderMeleeDefPower *= nerfFactor;
      defenderRangedAtkPower *= nerfFactor;
      defenderRangedDefPower *= nerfFactor;
    } else {
      // Later turns (Turn 6+) - offense units start joining the defense with reinforcements
      logDebug(
        'Fort is critically damaged, applying reinforcements from offense units',
      );
      const reinforcementModifier = includeOffenseUnits
        ? calculateReinforcementModifier(turn)
        : 0;
      const recoveryFactor = calculateRecoveryFactor(turn);

      // Apply reinforcement to melee and ranged defense
      defenderMeleeAtkPower =
        (defenderMeleeAtkPower + reinforcementModifier) * recoveryFactor;
      defenderMeleeDefPower =
        (defenderMeleeDefPower + reinforcementModifier) * recoveryFactor;
      defenderRangedAtkPower =
        (defenderRangedAtkPower + reinforcementModifier) * recoveryFactor;
      defenderRangedDefPower =
        (defenderRangedDefPower + reinforcementModifier) * recoveryFactor;
    }
  }
  return {
    MeleeAtkPower: defenderMeleeAtkPower,
    MeleeDefPower: defenderMeleeDefPower,
    RangedAtkPower: defenderRangedAtkPower,
    RangedDefPower: defenderRangedDefPower,
  };
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
  const hasValidDefenderTargets =
    state.defenderDefenseRemaining > 0 ||
    state.fortHP > 0 ||
    (state.fortHP === 0 &&
      (state.defenderCitizensRemaining > 0 ||
        state.defenderWorkersRemaining > 0)) ||
    (state.fortHP === 0 &&
      state.defenderDefenseRemaining <= 0 &&
      state.defenderCitizensRemaining <= 0 &&
      state.defenderWorkersRemaining <= 0 &&
      state.defenderOffenseRemaining > 0);

  if (!hasValidDefenderTargets) {
    logDebug('Battle ended early - no valid defender targets remain.');
    logDebug(
      `Defender Units Remaining - Defense: ${state.defenderDefenseRemaining}, ` +
        `Citizens: ${state.defenderCitizensRemaining}, Workers: ${state.defenderWorkersRemaining}, ` +
        `Offense: ${state.defenderOffenseRemaining}`,
    );
    return true;
  }

  return false;
}

export function calculateDefenseNerfFactor(
  turn: number,
  currentFortHP: number,
  initialFortHP: number,
): number {
  const fortDamageRatio = 1 - currentFortHP / initialFortHP;
  const baseFactor = 0.7 + 0.3 * (1 - fortDamageRatio);
  const turnMultiplier = 1 - turn * 0.05;
  return Math.max(0.5, baseFactor * turnMultiplier);
}

export function calculateStaminaDrop(turn: number): number {
  if (turn <= 5) return BATTLE_CONSTANTS.STAMINA_MULTIPLIERS.EARLY_PHASE;
  if (turn <= 10) return BATTLE_CONSTANTS.STAMINA_MULTIPLIERS.MID_PHASE;
  return BATTLE_CONSTANTS.STAMINA_MULTIPLIERS.LATE_PHASE;
}

export function calculateFortDamage(
  attackerMeleeAtkPower: number,
  fortificationDefensePower: number, // Combined melee and ranged defense of the fort
): number {
  const ratio = attackerMeleeAtkPower / (fortificationDefensePower || 1);
  let damageRange: [number, number];

  if (ratio <= 0.05)
    damageRange = [0, 0]; // Very low attack, no damage
  else if (ratio <= 0.2)
    damageRange = [0, 1]; // Low attack, minimal damage
  else if (ratio <= 0.5)
    damageRange = [1, 3]; // Moderate attack
  else if (ratio <= 1.0)
    damageRange = [3, 6]; // Balanced attack
  else if (ratio <= 1.5)
    damageRange = [6, 10]; // Strong attack
  else if (ratio <= 2.0)
    damageRange = [10, 15]; // Very strong attack
  else damageRange = [15, 25]; // Overwhelming attack

  const damage = Math.floor(mtRand(damageRange[0], damageRange[1]));
  return Math.max(damage, 0);
}

export function calculateBattleExperience(
  isAttackerWinner: boolean,
  levelDifference: number,
  attackTurns: number,
  fortDestroyed: boolean,
): { attackerXP: number; defenderXP: number } {
  const baseXP = BATTLE_CONSTANTS.BASE_XP;
  const levelBonus = levelDifference > 0 ? levelDifference * 0.05 * baseXP : 0;
  const fortBonus = fortDestroyed ? 0.5 * baseXP : 0;
  const turnsMultiplier = attackTurns / BATTLE_CONSTANTS.MAX_TURNS; // Max turns is now 15
  const baseXPPerTurn = baseXP / BATTLE_CONSTANTS.MAX_TURNS; // Distribute base XP across turns

  const totalXP =
    (baseXPPerTurn * attackTurns + levelBonus + fortBonus) * turnsMultiplier;

  const attackerXP = Math.round(
    isAttackerWinner ? totalXP * 0.75 : totalXP * 0.25,
  );
  const defenderXP = Math.round(
    isAttackerWinner ? totalXP * 0.25 : totalXP * 0.75,
  );

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
    defenderXP,
  });

  return {
    attackerXP,
    defenderXP,
  };
}

// calculates bonus multiplier based on the user’s bonus percentage.
function getUnitMultiplier(
  user: BattleUserLike,
  unitType: 'OFFENSE' | 'DEFENSE',
): number {
  const bonus = unitType === OFFENSE ? user.attackBonus : user.defenseBonus;
  return 1 + Number(bonus ?? 0) / 100;
}

const itemTypeLookup: { [key: string]: any[] } = {}; // Map usage -> array of items
ItemTypes.forEach((item) => {
  if (!itemTypeLookup[item.usage]) {
    itemTypeLookup[item.usage] = [];
  }
  itemTypeLookup[item.usage].push(item);
});

const strengthCache = new Map();
export interface CalculatedStrength {
  MeleeAtkPower: number;
  MeleeDefPower: number;
  RangedAtkPower: number;
  RangedDefPower: number;
}

export interface DetailedCalculatedStrength {
  baseStats: CalculatedStrength;
  itemStats: CalculatedStrength;
  upgradeStats: CalculatedStrength;
  totalStats: CalculatedStrength;
}

export function calculateStrength(
  user: BattleUserLike,
  unitType: 'OFFENSE' | 'DEFENSE',
  includeCitz: boolean = false,
  includeOffense: boolean = false,
): DetailedCalculatedStrength {
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

  // Include both regular units and mercenaries in the calculation
  const allUnits = [...(user.units || []), ...(user.mercenaries || [])];
  const filteredUnits =
    allUnits.filter((u) => includedTypes.includes(u.type)) || [];
  const unitString = JSON.stringify(filteredUnits);
  const itemString = JSON.stringify(
    user.items?.filter((i) => i.usage === unitType),
  );
  const cacheKey = `${user.id ?? '0'}-${unitType}-${includeCitz}-${includeOffense}-${unitString}-${itemString}`;
  if (!user || !user.units || !user.items) {
    console.warn(`User or user units/items not found for type: ${unitType}`);
    const zeroStrength: CalculatedStrength = {
      MeleeAtkPower: 0,
      MeleeDefPower: 0,
      RangedAtkPower: 0,
      RangedDefPower: 0,
    };
    return {
      baseStats: zeroStrength,
      itemStats: zeroStrength,
      upgradeStats: zeroStrength,
      totalStats: zeroStrength,
    };
  }

  if (strengthCache.has(cacheKey)) {
    const cached: DetailedCalculatedStrength = strengthCache.get(cacheKey);
    if (
      cached &&
      (cached.totalStats.MeleeAtkPower > 0 ||
        cached.totalStats.MeleeDefPower > 0 ||
        cached.totalStats.RangedAtkPower > 0 ||
        cached.totalStats.RangedDefPower > 0)
    ) {
      logDebug(
        `Using cached strength for ${unitType}: MeleeAtk=${cached.totalStats.MeleeAtkPower}, MeleeDef=${cached.totalStats.MeleeDefPower}, RangedAtk=${cached.totalStats.RangedAtkPower}, RangedDef=${cached.totalStats.RangedDefPower}`,
      );
      return cached;
    }
    logDebug(`Cached strength for ${unitType} is zero, recalculating...`);
    strengthCache.delete(cacheKey);
  }

  const baseStats: CalculatedStrength = {
    MeleeAtkPower: 0,
    MeleeDefPower: 0,
    RangedAtkPower: 0,
    RangedDefPower: 0,
  };
  const itemStats: CalculatedStrength = {
    MeleeAtkPower: 0,
    MeleeDefPower: 0,
    RangedAtkPower: 0,
    RangedDefPower: 0,
  };
  const upgradeStats: CalculatedStrength = {
    MeleeAtkPower: 0,
    MeleeDefPower: 0,
    RangedAtkPower: 0,
    RangedDefPower: 0,
  };

  const multiplier = getUnitMultiplier(user, unitType);

  // Process Primary Units (OFFENSE or DEFENSE) - include both regular units and mercenaries
  const allCombatUnits = [...(user?.units || []), ...(user?.mercenaries || [])];
  allCombatUnits
    .filter((u) => u.type === unitType)
    .forEach((unit) => {
      const unitInfo = UnitTypes.find(
        (info) => info.type === unit.type && info.level === unit.level,
      );
      if (!unitInfo) {
        console.warn(`Unit info not found for type: ${unit.type}`);
        return;
      }

      baseStats.MeleeAtkPower += (unitInfo.MeleeAtkPower || 0) * unit.quantity;
      baseStats.MeleeDefPower += (unitInfo.MeleeDefPower || 0) * unit.quantity;
      baseStats.RangedAtkPower +=
        (unitInfo.RangedAtkPower || 0) * unit.quantity;
      baseStats.RangedDefPower +=
        (unitInfo.RangedDefPower || 0) * unit.quantity;

      logDebug(
        `Unit Strength - Type: ${unit.type}, Level: ${unit.level}, Quantity: ${unit.quantity}, ` +
          `MeleeAtk=${(unitInfo.MeleeAtkPower || 0) * unit.quantity}, MeleeDef=${(unitInfo.MeleeDefPower || 0) * unit.quantity}, ` +
          `RangedAtk=${(unitInfo.RangedAtkPower || 0) * unit.quantity}, RangedDef=${(unitInfo.RangedDefPower || 0) * unit.quantity}`,
      );

      if (unit.quantity === 0) return;

      const canUseRanged = (unitInfo.rangedPercentage ?? 0) > 0;

      const itemCounts: { [K in ItemType]?: number } = {
        WEAPON: 0,
        HELM: 0,
        BOOTS: 0,
        BRACERS: 0,
        SHIELD: 0,
        ARMOR: 0,
      } as any;

      // Apply item level restriction: unit.level >= item.level
      const usableItems = user.items
        .filter((item) => item.usage === unit.type && item.level <= unit.level)
        .sort((a, b) => {
          const itemInfoA = itemTypeLookup[unit.type]?.find(
            (i) => i.type === a.type && i.level === a.level,
          );
          const itemInfoB = itemTypeLookup[unit.type]?.find(
            (i) => i.type === b.type && i.level === b.level,
          );
          return (
            (itemInfoB?.MeleeAtkPower || 0) - (itemInfoA?.MeleeAtkPower || 0)
          );
        });

      usableItems.forEach((item) => {
        const currentCount = itemCounts[item.type] || 0;
        const itemInfo = itemTypeLookup[unit.type]?.find(
          (i) => i.type === item.type && i.level === item.level,
        );
        if (!itemInfo) return;

        const usableQuantity = Math.min(
          item.quantity,
          unit.quantity - currentCount,
        );
        logDebug(
          `Adding item strength for ${usableQuantity} ${item.type} items: MeleeAtk=${itemInfo.MeleeAtkPower}, MeleeDef=${itemInfo.MeleeDefPower}, RangedAtk=${itemInfo.RangedAtkPower}, RangedDef=${itemInfo.RangedDefPower}`,
        );
        itemStats.MeleeAtkPower +=
          (itemInfo.MeleeAtkPower || 0) * usableQuantity;
        itemStats.MeleeDefPower +=
          (itemInfo.MeleeDefPower || 0) * usableQuantity;
        if (canUseRanged) {
          itemStats.RangedAtkPower +=
            (itemInfo.RangedAtkPower || 0) * usableQuantity;
        }
        itemStats.RangedDefPower +=
          (itemInfo.RangedDefPower || 0) * usableQuantity;
        itemCounts[item.type] = currentCount + usableQuantity;
      });
    });

  // Process support units (CITIZEN, WORKER, OFFENSE) based on flags - include both regular units and mercenaries
  if (
    includeCitz ||
    includeOffense ||
    (unitType === 'DEFENSE' &&
      !allCombatUnits?.some((u) => u.type === 'DEFENSE' && u.quantity > 0))
  ) {
    const allSupportUnits = [
      ...(user?.units || []),
      ...(user?.mercenaries || []),
    ];
    allSupportUnits
      .filter((u) => includedTypes.includes(u.type) && u.type !== unitType)
      .forEach((unit) => {
        const unitInfo = UnitTypes.find((info) => info.type === unit.type);
        if (unitInfo) {
          let effectivenessMultiplier = 1;
          if (unit.type === 'OFFENSE') {
            effectivenessMultiplier = unitType === 'DEFENSE' ? 0.7 : 1;
          } else if (unit.type === 'CITIZEN' || unit.type === 'WORKER') {
            effectivenessMultiplier = 0.1;
          }
          logDebug(
            `Adding support strength for ${unit.quantity} ${unit.type} units: MeleeAtk=${unitInfo.MeleeAtkPower * effectivenessMultiplier}, MeleeDef=${unitInfo.MeleeDefPower * effectivenessMultiplier}, RangedAtk=${unitInfo.RangedAtkPower * effectivenessMultiplier}, RangedDef=${unitInfo.RangedDefPower * effectivenessMultiplier}`,
          );
          baseStats.MeleeAtkPower +=
            (unitInfo.MeleeAtkPower || 0) *
            unit.quantity *
            effectivenessMultiplier;
          baseStats.MeleeDefPower +=
            (unitInfo.MeleeDefPower || 0) *
            unit.quantity *
            effectivenessMultiplier;
          baseStats.RangedAtkPower +=
            (unitInfo.RangedAtkPower || 0) *
            unit.quantity *
            effectivenessMultiplier;
          baseStats.RangedDefPower +=
            (unitInfo.RangedDefPower || 0) *
            unit.quantity *
            effectivenessMultiplier;
        }
      });
  }

  // Process Battle Upgrades
  user.battle_upgrades
    ?.filter((up) => up.type === unitType)
    .forEach((upgrade) => {
      const upgradeInfo = BattleUpgrades.find(
        (bu) => bu.type === upgrade.type && bu.level === upgrade.level,
      );
      if (upgradeInfo) {
        // Assuming battle upgrades directly add to stats
        upgradeStats.MeleeAtkPower +=
          (upgradeInfo.MeleeAtkPower || 0) * upgrade.quantity;
        upgradeStats.MeleeDefPower +=
          (upgradeInfo.MeleeDefPower || 0) * upgrade.quantity;
        upgradeStats.RangedAtkPower +=
          (upgradeInfo.RangedAtkPower || 0) * upgrade.quantity;
        upgradeStats.RangedDefPower +=
          (upgradeInfo.RangedDefPower || 0) * upgrade.quantity;
      }
    });

  const totalStats: CalculatedStrength = {
    MeleeAtkPower: Math.ceil(
      (baseStats.MeleeAtkPower +
        itemStats.MeleeAtkPower +
        upgradeStats.MeleeAtkPower) *
        multiplier,
    ),
    MeleeDefPower: Math.ceil(
      (baseStats.MeleeDefPower +
        itemStats.MeleeDefPower +
        upgradeStats.MeleeDefPower) *
        multiplier,
    ),
    RangedAtkPower: Math.ceil(
      (baseStats.RangedAtkPower +
        itemStats.RangedAtkPower +
        upgradeStats.RangedAtkPower) *
        multiplier,
    ),
    RangedDefPower: Math.ceil(
      (baseStats.RangedDefPower +
        itemStats.RangedDefPower +
        upgradeStats.RangedDefPower) *
        multiplier,
    ),
  };

  logInfo(
    `Final strength for ${unitType}: MeleeAtk=${totalStats.MeleeAtkPower}, MeleeDef=${totalStats.MeleeDefPower}, RangedAtk=${totalStats.RangedAtkPower}, RangedDef=${totalStats.RangedDefPower}`,
  );

  const result: DetailedCalculatedStrength = {
    baseStats,
    itemStats,
    upgradeStats,
    totalStats,
  };

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
  if (defenderLevel >= 20) return 1; // Full loot potential at higher levels

  if (defenderLevel < 10) {
    // Scale between 40% at level 1 and 70% at level 9
    return 0.4 + (defenderLevel - 1) * ((0.7 - 0.4) / 8);
  }

  // Scale between 70% at level 10 and 100% at level 20
  return 0.7 + (defenderLevel - 10) * ((1 - 0.7) / 10);
}

export function calculateLoot(
  attacker: BattleUserLike,
  defender: BattleUserLike,
  turns: number,
): bigint {
  const UNIFORM_MIN = 90;
  const UNIFORM_MAX = 99;
  const uniformFactor = mtRand(UNIFORM_MIN, UNIFORM_MAX) / 100;
  const turnLower = 100 + turns * 8; // Reduced impact of turns on lower bound
  const turnUpper = 100 + turns * 15; // Reduced impact of turns on upper bound
  const turnFactor = mtRand(turnLower, turnUpper) / 350; // Adjusted divisor for overall loot scaling
  logDebug('turns:', turns);
  logDebug(`Uniform Factor: ${uniformFactor}, Turn Factor: ${turnFactor}`);

  const levelDifference = Math.min(
    Math.abs((defender.level ?? 0) - (attacker.level ?? 0)),
    7,
  ); // Increased level difference cap
  const levelDifferenceFactor = 1 + Math.min(0.7, levelDifference * 0.07); // Increased impact of level difference
  logDebug(
    `Level Difference: ${levelDifference}, Level Difference Factor: ${levelDifferenceFactor}`,
  );

  const defenderLevelFactor = calculateDefenderLevelFactor(defender.level ?? 0);
  const lootFactor =
    uniformFactor * turnFactor * levelDifferenceFactor * defenderLevelFactor;
  logDebug(`Loot Factor: ${lootFactor}`);

  const defenderGold = BigInt(defender.gold);
  const calculatedLoot = Number(defenderGold) * lootFactor;
  if (
    !Number.isFinite(calculatedLoot) ||
    isNaN(calculatedLoot) ||
    calculatedLoot < 0
  ) {
    console.warn(`Calculated loot is invalid: ${calculatedLoot}. Returning 0.`);
    return BigInt(0);
  }
  logDebug(
    `Calculated loot: ${calculatedLoot}, Defender Gold: ${defenderGold}, Loot Factor: ${lootFactor}`,
  );
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
  attackerPop: number, // This might become redundant if we track individual unit HP
  defenderPop: number, // This might become redundant if we track individual unit HP
  initialFortHP: number,
  piercingRatio: number,
  fortHitpoints?: number,
  includeCitz: boolean = false,
  includeOffense: boolean = false,
  isDefenderProtected: boolean = false,
  options?: {
    defenderFortLevel?: number;
    defenderCasualtyBonusPct?: number;
    defenderStructureUpgrades?: any[];
  },
): {
  damageDealt: number;
  rawDamageDealt: number;
  fortSoakMultiplier: number;
  mitigationMultiplier: number;
  mitigation?: {
    defenderFortLevel?: number;
    defenderFortMitigationPct: number;
    defenderCasualtyBonusPct: number;
    defenderStructureMitigationPct: number;
    totalMitigationPct: number;
    mitigationMultiplier: number;
    fortHpRatio: number;
  };
} {
  logDebug(
    `newComputeCasualties - AttackerAtk: ${attackerAtk}, DefenderDef: ${defenderDef}, PiercingRatio: ${piercingRatio}`,
  );

  const defenderDefFloor =
    attackerAtk > 0 ? Math.max(1, Math.floor(attackerAtk * 0.05)) : 1;
  const effectiveDefenderDef =
    Number.isFinite(defenderDef) && defenderDef > 0
      ? defenderDef
      : defenderDefFloor;

  // Calculate raw damage dealt
  let damageDealt = Math.max(0, attackerAtk - effectiveDefenderDef);

  // Apply piercing ratio to increase damage in overwhelming scenarios.
  // Avoid multiplying by huge ratios (e.g. when defenderDef is ~0) which can explode damage values.
  if (piercingRatio > 1) {
    const safeRatio = clamp(piercingRatio, 1, 100);
    const piercingMultiplier = 1 + Math.log10(safeRatio); // 1..3 for ratio 1..100
    damageDealt *= piercingMultiplier;
  }

  const rawDamageDealt = damageDealt;

  const safeInitialFortHP =
    Number.isFinite(initialFortHP) && initialFortHP > 0 ? initialFortHP : 0;
  const safeFortHP = Number.isFinite(fortHitpoints as any)
    ? Math.max(0, Number(fortHitpoints))
    : undefined;

  let fortSoakMultiplier = 1;
  let fortHpRatio = 0;
  if (safeFortHP !== undefined && safeFortHP > 0 && safeInitialFortHP > 0) {
    fortHpRatio = clamp(safeFortHP / safeInitialFortHP, 0, 1);
    fortSoakMultiplier = 1 - 0.5 * fortHpRatio;
    damageDealt *= fortSoakMultiplier;
  }

  let mitigationMultiplier = 1;
  let mitigation:
    | {
        defenderFortLevel?: number;
        defenderFortMitigationPct: number;
        defenderCasualtyBonusPct: number;
        defenderStructureMitigationPct: number;
        totalMitigationPct: number;
        mitigationMultiplier: number;
        fortHpRatio: number;
      }
    | undefined;

  const defenderFortLevel = options?.defenderFortLevel;
  if (typeof defenderFortLevel === 'number' && safeInitialFortHP > 0) {
    const structureMitigationPct = getStructureCasualtyMitigationPercent(
      options?.defenderStructureUpgrades,
    );
    const fortMitigation = calculateFortMitigation({
      defenderFortLevel,
      defenderCasualtyBonusPct: options?.defenderCasualtyBonusPct,
      defenderStructureMitigationPct: structureMitigationPct,
      fortHpRatio,
    });
    mitigationMultiplier = fortMitigation.mitigationMultiplier;
    mitigation = { ...fortMitigation, fortHpRatio };
    damageDealt *= mitigationMultiplier;
  }

  if (isDefenderProtected) {
    damageDealt = Math.floor(damageDealt * 0.1);
  }

  return {
    damageDealt: Math.ceil(damageDealt),
    rawDamageDealt: Math.ceil(rawDamageDealt),
    fortSoakMultiplier,
    mitigationMultiplier,
    mitigation,
  };
}

export function calculateStaminaModifier(turn: number): number {
  if (turn <= 5) return 1.0; // Early phase - full stamina
  if (turn <= 10) return 0.85; // Mid phase - slight fatigue
  if (turn <= 12) return 0.7; // Mid-late phase - significant fatigue
  return 0.55; // Late phase - significant fatigue
}

export function calculateReinforcementModifier(turn: number): number {
  if (turn <= 7) return 0; // No reinforcements in early phase
  return Math.min((turn - 7) * 0.1, 0.4); // Up to 40% reinforcement bonus, starting later
}

export function calculateRecoveryFactor(turn: number): number {
  const baseRecovery = 0.7; // Slightly lower base recovery
  const recoveryPerTurn = 0.04; // Slightly lower recovery per turn
  return Math.min(baseRecovery + (turn - 7) * recoveryPerTurn, 1.0);
}
export async function distributeCasualties(params: {
  result: BattleResult;
  attacker: BattleUserLike;
  defender: BattleUserLike;
  attackerDamageDealt: number; // Raw damage dealt by attacker
  defenderDamageDealt: number; // Raw damage dealt by defender
  fortHP: number;
  initialFortHP: number;
  turn?: number;
  includeCitz?: boolean;
  includeOffense?: boolean;
  debug?: boolean;
}): Promise<{ attackerCasualties: number; defenderCasualties: number }> {
  const {
    result,
    attacker,
    defender,
    attackerDamageDealt,
    defenderDamageDealt,
    fortHP,
    initialFortHP,
    turn,
    includeCitz = false,
    includeOffense = false,
    debug,
  } = params;

  let totalAttackerCasualties = 0;
  let totalDefenderCasualties = 0;

  // Helper to apply damage to a unit pool and track casualties
  const applyDamageToUnits = (
    unitPool: BattleUnits[],
    damage: number,
    isDefender: boolean,
    isCollateral: boolean = false,
    debug?: boolean,
  ): { casualties: number; remainingDamage: number } => {
    let remainingDamage = damage;
    let casualtiesCount = 0;

    // Sort units by level (lowest first) to apply damage to weaker units first
    const sortedUnits = [...unitPool]
      .filter((u) => (u.quantity || 0) > 0)
      .sort((a, b) => (a.level || 0) - (b.level || 0));
    if (debug)
      logDebug(
        `[DEBUG] applyDamageToUnits: Processing unit pool (sorted):`,
        JSON.stringify(sortedUnits),
      );

    for (const unit of sortedUnits) {
      if (debug)
        logDebug(
          `[DEBUG] applyDamageToUnits: Processing unit:`,
          JSON.stringify(unit),
          `Remaining damage: ${remainingDamage}`,
        );
      if (remainingDamage <= 0) break;

      const unitInfo = UnitTypes.find(
        (u) => u.type === unit.type && u.level === unit.level,
      );
      if (debug)
        logDebug(
          `[DEBUG] applyDamageToUnits: UnitInfo lookup for ${unit.type} Level ${unit.level}:`,
          JSON.stringify(unitInfo),
        );
      if (!unitInfo) {
        if (debug)
          logDebug(
            `[DEBUG] applyDamageToUnits: Unit info not found for ${unit.type} Level ${unit.level}. Unit added without modification.`,
          );
        continue;
      }

      let unitHP = unit.currentHP ?? unitInfo.hp;
      let unitsRemaining = unit.quantity || 0;

      while (unitsRemaining > 0 && remainingDamage > 0) {
        if (unitHP <= remainingDamage) {
          // Unit is destroyed
          remainingDamage -= unitHP;
          unitsRemaining--;
          casualtiesCount++;
          // Record loss in BattleResult
          const existingLoss = result.Losses[
            isDefender ? 'Defender' : 'Attacker'
          ].units.find((u) => u.type === unit.type && u.level === unit.level);
          if (existingLoss) {
            existingLoss.quantity++;
          } else {
            // Provide placeholder values for id, userId, isMercenary for lost units
            result.Losses[isDefender ? 'Defender' : 'Attacker'].units.push({
              id: (unit as any).id ?? 0, // Placeholder ID
              userId: isDefender ? defender.id : attacker.id, // Assign to the respective user
              type: unit.type,
              level: unit.level,
              quantity: 1,
              isMercenary: unit.isMercenary ?? false,
            });
          }
          unitHP = unitInfo.hp; // Reset HP for the next unit of the same type
          if (debug)
            logDebug(
              `[DEBUG] applyDamageToUnits: Unit destroyed. Casualties: ${casualtiesCount}, Remaining damage: ${remainingDamage}`,
            );
        } else {
          // Unit takes partial damage
          unitHP -= remainingDamage;
          remainingDamage = 0;
          if (debug)
            logDebug(
              `[DEBUG] applyDamageToUnits: Unit took partial damage. Remaining HP: ${unitHP}`,
            );
        }
      }

      unit.quantity = unitsRemaining;
      unit.currentHP = unitsRemaining > 0 ? unitHP : (unitInfo.hp ?? 1);
    }
    if (debug)
      logDebug(
        `[DEBUG] applyDamageToUnits: Casualties count: ${casualtiesCount}, Remaining damage: ${remainingDamage}`,
      );
    return { casualties: casualtiesCount, remainingDamage };
  };

  // Apply attacker damage to defender units
  if (attackerDamageDealt > 0) {
    const defenderAllUnits = [
      ...(defender.units || []),
      ...(defender.mercenaries || []),
    ];
    const defenderFightingPool = defenderAllUnits.filter(
      (u) => u.type === 'DEFENSE' || (includeOffense && u.type === 'OFFENSE'),
    );
    const defenderCollateralPool = defenderAllUnits.filter(
      (u) => u.type === 'CITIZEN' || u.type === 'WORKER',
    );

    // Prioritize damage to fighting units first
    const {
      casualties: fightingCasualties,
      remainingDamage: remainingAttackerDamage,
    } = applyDamageToUnits(
      defenderFightingPool,
      attackerDamageDealt,
      true,
      false,
      debug,
    );
    totalDefenderCasualties += fightingCasualties;

    // If damage remains, apply to collateral units (if fort is breached)
    if (fortHP <= 0 && includeCitz) {
      const { casualties: collateralCasualties } = applyDamageToUnits(
        defenderCollateralPool,
        remainingAttackerDamage,
        true,
        true,
        debug,
      );
      totalDefenderCasualties += collateralCasualties;
    }
  }

  // Apply defender damage to attacker units
  if (defenderDamageDealt > 0) {
    const attackerAllUnits = [
      ...(attacker.units || []),
      ...(attacker.mercenaries || []),
    ];
    const attackerOffensePool = attackerAllUnits.filter(
      (u) => u.type === 'OFFENSE',
    );
    const { casualties: attackerCasualties } = applyDamageToUnits(
      attackerOffensePool,
      defenderDamageDealt,
      false,
      false,
      debug,
    );
    totalAttackerCasualties += attackerCasualties;
  }
  result.Losses.Attacker.total += totalAttackerCasualties;
  result.Losses.Defender.total += totalDefenderCasualties;

  pruneEmptyUnits(attacker);
  pruneEmptyUnits(defender);

  return {
    attackerCasualties: totalAttackerCasualties,
    defenderCasualties: totalDefenderCasualties,
  };
}

// Helper function to distribute casualties across units, weighting lower levels more heavily
function distributeUnitCasualties(
  units: BattleUnits[],
  totalCasualties: number,
  baseCasualtyRate: number,
): BattleUnits[] {
  const lostUnits: BattleUnits[] = [];
  let remainingCasualties = totalCasualties;

  const workingUnits = units
    .map((unit) => ({ ...unit }))
    .filter((unit) => unit.quantity > 0)
    .sort((a, b) => a.level - b.level); // Sort by level ascending (lower levels first)

  const totalAvailable = workingUnits.reduce(
    (sum, unit) => sum + unit.quantity,
    0,
  );
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
        id: 0, // Placeholder ID
        userId: 0, // Placeholder User ID (not directly available here)
        type: unit.type,
        level: unit.level,
        quantity: casualtiesForUnit,
        isMercenary: false, // Default to false
      });
      unit.quantity -= casualtiesForUnit;
      remainingCasualties -= casualtiesForUnit;
    }
  }

  // Second pass: Distribute any remaining casualties proportionally
  if (remainingCasualties > 0) {
    const currentTotalUnits = workingUnits.reduce(
      (sum, unit) => sum + unit.quantity,
      0,
    );
    if (currentTotalUnits > 0) {
      for (const unit of workingUnits) {
        if (remainingCasualties <= 0 || unit.quantity <= 0) continue;

        const proportion = unit.quantity / currentTotalUnits;
        let casualties = Math.floor(remainingCasualties * proportion);
        casualties = Math.min(casualties, remainingCasualties);
        casualties = Math.min(casualties, unit.quantity);

        if (casualties > 0) {
          const existingLoss = lostUnits.find(
            (loss) => loss.type === unit.type && loss.level === unit.level,
          );
          if (existingLoss) {
            existingLoss.quantity += casualties;
          } else {
            lostUnits.push({
              id: 0, // Placeholder ID
              userId: 0, // Placeholder User ID (not directly available here)
              type: unit.type,
              level: unit.level,
              quantity: casualties,
              isMercenary: false, // Default to false
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
  lostUnits.forEach((loss) => {
    const originalUnit = units.find(
      (u) => u.type === loss.type && u.level === loss.level,
    );
    if (originalUnit) {
      originalUnit.quantity = Math.max(
        0,
        originalUnit.quantity - loss.quantity,
      );
    }
  });

  return lostUnits;
}

export function filterUnitsByType(
  units: BattleUnits[],
  type: string,
): BattleUnits[] {
  return units
    .filter((unit) => unit.type === type)
    .map((unit) => ({ ...unit }));
}

export function calculateAndApplyExperience(
  result: BattleResult,
  params: {
    attacker: BattleUserLike;
    defender: BattleUserLike;
    attackTurns: number;
    fortDestroyed: boolean;
  },
): void {
  const { attacker, defender, attackTurns, fortDestroyed } = params;

  // Calculate level difference bonus
  const levelDifference = Math.abs(
    (defender.level ?? 0) - (attacker.level ?? 0),
  );

  // Determine winner based on multiple criteria
  const defenderLosses = result.Losses.Defender.total;
  const attackerLosses = result.Losses.Attacker.total;

  // Primary criterion: Unit casualties
  let isAttackerWinner = defenderLosses > attackerLosses;

  // Secondary criteria: When casualties are equal, consider additional factors
  if (defenderLosses === attackerLosses) {
    // 1. Fort damage dealt by attacker
    const fortDamage =
      (result.casualtySummary && result.casualtySummary.fortDamage) || 0;
    const initialFortHP =
      params.defender.fortHitpoints ||
      getFortificationByLevel(params.defender.fortLevel).hitpoints;

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
      isAttackerWinner,
    });
  } else {
    logDebug('Battle outcome determined by casualties:', {
      defenderLosses,
      attackerLosses,
      isAttackerWinner,
    });
  }

  // Calculate experience based on battle outcome
  const { attackerXP, defenderXP } = calculateBattleExperience(
    isAttackerWinner,
    levelDifference,
    attackTurns,
    fortDestroyed,
  );

  // Apply experience to result
  result.experienceGained = {
    attacker: attackerXP,
    defender: defenderXP,
  };

  // Set the final battle result based on the determined winner
  if (isAttackerWinner) {
    result.result = 'WIN';
  } else {
    result.result = 'LOSS';
  }

  logDebug('Experience applied to result:', {
    result: result.result,
    experienceGained: result.experienceGained,
  });
}
export function finalizeBattleResult(state: BattleState): void {
  /* 0|OTDev  |   attackerOffenseRemaining: 351,
0|OTDev  |   defenderDefenseRemaining: 0,
0|OTDev  |   defenderCitizensRemaining: 0,
0|OTDev  |   defenderWorkersRemaining: 261,
0|OTDev  |   defenderOffenseRemaining: 1,
0|OTDev  |   attackerMeleeAtkPower: 5883,
0|OTDev  |   attackerMeleeDefPower: 2694,
0|OTDev  |   attackerRangedAtkPower: 0,
0|OTDev  |   attackerRangedDefPower: 7035,
0|OTDev  |   defenderMeleeAtkPower: 23,
0|OTDev  |   defenderMeleeDefPower: 38,
0|OTDev  |   defenderRangedAtkPower: 0,
0|OTDev  |   defenderRangedDefPower: 0,
0|OTDev  |   totalPillagedGold: 46569n,
0|OTDev  |   totalAttackerCasualties: 0,
0|OTDev  |   totalDefenderCasualties: 252,
0|OTDev  |   levelMitigation: 1,
0|OTDev  |   shouldIncludeCitz: true,
0|OTDev  |   includeOffenseUnits: false,
*/
  const {
    attacker,
    defender,
    totalTurns,
    fortHP,
    initialFortHP,
    battleResult,
    startFortHP,
    attackerOffenseRemaining,
    attackerMeleeAtkPower,
    attackerMeleeDefPower,
    attackerRangedAtkPower,
    attackerRangedDefPower,
    defenderMeleeAtkPower,
    defenderMeleeDefPower,
    defenderRangedAtkPower,
    defenderRangedDefPower,
    defenderDefenseRemaining,
  } = state;
  // Ensure all lost units have a level defined for summarization
  battleResult.Losses.Defender.units.forEach((unit) => {
    if (unit.level === undefined) {
      const originalUnit = defender.units.find((u) => u.type === unit.type);
      unit.level = originalUnit?.level ?? 1; // Default to 1 if original not found
      console.warn(
        `Unit type ${unit.type} in defender losses had no level. Defaulting to ${unit.level}.`,
      );
    }
  });

  battleResult.Losses.Attacker.units.forEach((unit) => {
    if (unit.level === undefined) {
      const originalUnit = attacker.units.find((u) => u.type === unit.type);
      unit.level = originalUnit?.level ?? 1; // Default to 1 if original not found
      console.warn(
        `Unit type ${unit.type} in attacker losses had no level. Defaulting to ${unit.level}.`,
      );
    }
  });

  logDebug('Total Turns:', totalTurns);

  battleResult.pillagedGold = state.totalPillagedGold;
  battleResult.finalFortHP = fortHP;
  // Keep legacy property in sync (used in older tests/components).
  battleResult.fortHitpoints = fortHP;
  battleResult.fortDamaged = startFortHP !== fortHP;
  battleResult.turnsTaken = totalTurns;
  battleResult.attackerStats = {
    offenseRemaining: attackerOffenseRemaining,
    meleeAtkPower: attackerMeleeAtkPower,
    meleeDefPower: attackerMeleeDefPower,
    rangedAtkPower: attackerRangedAtkPower,
    rangedDefPower: attackerRangedDefPower,
  };
  battleResult.defenderStats = {
    defenseRemaining: defenderDefenseRemaining,
    meleeAtkPower: defenderMeleeAtkPower,
    meleeDefPower: defenderMeleeDefPower,
    rangedAtkPower: defenderRangedAtkPower,
    rangedDefPower: defenderRangedDefPower,
  };

  // Summarize casualties by type and level for better reporting
  const summarizeUnitLosses = (
    units: BattleUnits[],
  ): Array<{
    type: string;
    level: number;
    quantity: number;
    description: string;
  }> => {
    const summary: {
      [key: string]: {
        type: string;
        level: number;
        quantity: number;
        description: string;
      };
    } = {};
    units.forEach((unit) => {
      const key = `${unit.type}_${unit.level}`;
      if (!summary[key]) {
        summary[key] = {
          type: unit.type,
          level: unit.level,
          quantity: 0,
          description: `${unit.type} Level ${unit.level}`,
        };
      }
      summary[key].quantity += unit.quantity;
    });
    return Object.values(summary);
  };

  // Add summarized casualties to battle result
  const mitigationSamples = (battleResult.mitigationLog || []).filter(
    (e) => e.source === 'ATTACKER',
  );
  const multipliers = mitigationSamples
    .map((e) => e.mitigationMultiplier)
    .filter((m) => typeof m === 'number' && Number.isFinite(m));
  const mitigationSummary = multipliers.length
    ? {
        averageMultiplier:
          multipliers.reduce((sum, v) => sum + v, 0) / multipliers.length,
        minMultiplier: Math.min(...multipliers),
        maxMultiplier: Math.max(...multipliers),
        samples: multipliers.length,
      }
    : undefined;

  battleResult.casualtySummary = {
    attacker: summarizeUnitLosses(battleResult.Losses.Attacker.units),
    defender: summarizeUnitLosses(battleResult.Losses.Defender.units),
    attackerTotal: battleResult.Losses.Attacker.total,
    defenderTotal: battleResult.Losses.Defender.total,
    fortDamage: startFortHP - fortHP,
    mitigation: mitigationSummary,
    fortBreached: fortHP <= 0,
    battleStats: {
      attacker: battleResult.attackerStats,
      defender: battleResult.defenderStats,
    },
  };

  // Log final casualty report
  logDebug('\n=== BATTLE SUMMARY ===');
  logDebug(`Total turns: ${totalTurns}`);
  logDebug(
    `Fort damage: ${startFortHP - fortHP} (${Math.round(((startFortHP - fortHP) / (initialFortHP || 1)) * 100)}%)`,
  );
  logDebug('Attacker losses:');
  battleResult.casualtySummary.attacker.forEach((loss) => {
    logDebug(`- ${loss.quantity} ${loss.type} units (Level ${loss.level})`);
  });
  logDebug(`Total attacker casualties: ${battleResult.Losses.Attacker.total}`);
  logDebug('Defender losses:');
  battleResult.casualtySummary.defender.forEach((loss) => {
    logDebug(`- ${loss.quantity} ${loss.type} units (Level ${loss.level})`);
  });
  logDebug(`Total defender casualties: ${battleResult.Losses.Defender.total}`);

  calculateAndApplyExperience(battleResult, {
    attacker,
    defender,
    attackTurns: totalTurns,
    fortDestroyed: fortHP <= 0,
  });
}

function logUnitCasualties(
  turn: number,
  attackerLosses: BattleUnits[],
  defenderLosses: BattleUnits[],
  debug: boolean,
) {
  if (!debug) return;

  logDebug(`\n=== Turn ${turn} Casualties ===`);

  // Log attacker losses
  if (attackerLosses.length > 0) {
    logDebug('Attacker lost:');
    attackerLosses.forEach((loss) => {
      logDebug(`- ${loss.quantity} ${loss.type} units`);
    });
  } else {
    logDebug('Attacker: No casualties');
  }

  // Log defender losses
  if (defenderLosses.length > 0) {
    logDebug('Defender lost:');
    defenderLosses.forEach((loss) => {
      logDebug(`- ${loss.quantity} ${loss.type} units`);
    });
  } else {
    logDebug('Defender: No casualties');
  }
}
function distributeDamage(
  totalCasualties: number,
  defender: BattleUserLike,
  fortHP: number,
): { collateralDamage: number; fightingDamage: number } {
  let collateralDamage = 0;
  let fightingDamage = 0;

  const COLLATERAL_DEFENSE_SHARE = 0.3;

  const totals = getUnitTotals(defender);
  const defenseCount = totals.defense;
  const citizenCount = totals.citizens + totals.workers;
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

/**
 * Calculates the current stamina state for a user.
 * @param user - The user model.
 * @returns StaminaState
 */
export function calculateStamina(user: BattleUserLike): StaminaState {
  const maxStamina = 100; // Base max stamina
  const currentStamina = maxStamina; // Default to max, as user model doesn't have stamina field
  const regenerationRate = 1; // Per turn or unit
  return {
    current: currentStamina,
    max: maxStamina,
    regenerationRate,
  };
}

/**
 * Gets stamina modifiers for a user.
 * @param user - The user model.
 * @returns StaminaModifiers
 */
export function getStaminaModifiers(user: BattleUserLike): StaminaModifiers {
  const baseRegeneration = 1;
  const bonuses: { [key: string]: number } = {
    attackBonus: (user.attackBonus || 0) / 100,
    defenseBonus: (user.defenseBonus || 0) / 100,
  };
  const penalties: { [key: string]: number } = {};
  return {
    baseRegeneration,
    bonuses,
    penalties,
  };
}

/**
 * Calculates turn scaling factor based on turn number.
 * @param turn - Current turn number.
 * @returns Scaling factor.
 */
export function calculateTurnScaling(turn: number): number {
  if (turn <= 5) return 1.0;
  if (turn <= 10) return 0.9;
  return 0.8;
}

/**
 * Calculates fort bonus based on fort level.
 * @param fortLevel - Fort level.
 * @returns Bonus value.
 */
export function calculateFortBonus(fortLevel: number): number {
  return fortLevel * 10; // Example: bonus increases with level
}

/**
 * Gets the breach state of the fort.
 * @param currentFortHP - Current fort HP.
 * @param initialFortHP - Initial fort HP.
 * @returns BreachState
 */
export function getFortBreachState(
  currentFortHP: number,
  initialFortHP: number,
): BreachState {
  const breached = currentFortHP <= 0;
  const turnsToBreach = breached
    ? 0
    : Math.ceil((initialFortHP - currentFortHP) / 50); // Example calculation
  const breachDamage = breached ? 100 : 0;
  const breachChance = breached
    ? 1
    : Math.max(0, (initialFortHP - currentFortHP) / initialFortHP);
  return {
    breached,
    turnsToBreach,
    breachDamage,
    breachChance,
  };
}

/**
 * Applies mercenary modifiers to user stats.
 * @param user - User model.
 * @param stats - Stats to modify.
 * @returns Modified stats.
 */
export function applyMercenaryModifiers(
  user: BattleUserLike,
  stats: DetailedCalculatedStrength,
): DetailedCalculatedStrength {
  // Example: mercenaries add 10% bonus
  const mercenaryBonus = (user.mercenaries?.length || 0) * 0.1;
  return {
    baseStats: stats.baseStats,
    itemStats: stats.itemStats,
    upgradeStats: stats.upgradeStats,
    totalStats: {
      MeleeAtkPower: Math.ceil(
        stats.totalStats.MeleeAtkPower * (1 + mercenaryBonus),
      ),
      MeleeDefPower: Math.ceil(
        stats.totalStats.MeleeDefPower * (1 + mercenaryBonus),
      ),
      RangedAtkPower: Math.ceil(
        stats.totalStats.RangedAtkPower * (1 + mercenaryBonus),
      ),
      RangedDefPower: Math.ceil(
        stats.totalStats.RangedDefPower * (1 + mercenaryBonus),
      ),
    },
  };
}

/**
 * Calculates ranged advantage for attacker over defender.
 * @param attacker - Attacker user.
 * @param defender - Defender user.
 * @returns Advantage factor.
 */
export function calculateRangedAdvantage(
  attacker: BattleUserLike,
  defender: BattleUserLike,
): number {
  const attackerRanged = calculateStrength(attacker, 'OFFENSE').totalStats
    .RangedAtkPower;
  const defenderRangedDef = calculateStrength(defender, 'DEFENSE').totalStats
    .RangedDefPower;
  return attackerRanged / (defenderRangedDef || 1);
}

/**
 * Executes an attack simulation.
 * @param attacker - Attacker user.
 * @param defender - Defender user.
 * @param turns - Number of turns.
 * @returns BattleResult
 */
export async function executeAttack(
  attacker: BattleUserLike,
  defender: BattleUserLike,
  turns: number = 15,
  isDefenderProtected: boolean = (defender.level ?? 0) <= 9,
): Promise<BattleResult> {
  const initialFortHP = Number.isFinite(defender.fortHitpoints as any)
    ? Math.max(0, Number(defender.fortHitpoints))
    : getFortificationByLevel(defender.fortLevel).hitpoints;
  try {
    return await simulateBattle(
      attacker,
      defender,
      initialFortHP,
      turns,
      false,
      isDefenderProtected,
    );
  } finally {
    strengthCache.clear();
  }
}
