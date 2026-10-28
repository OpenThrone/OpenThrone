import {
  ArmoryUpgrades,
  Fortifications,
  HouseUpgrades,
  UnitTypes,
} from '@/constants';
import {
  defenderFatigueMultiplier,
  defenderFatiguePercent,
} from '@/constants/KingdomMorale';
import BattleResult, {
  createDamageAuditSide,
  type DamageAuditBindingCap,
  type DamageAuditSide,
} from '@/models/BattleResult';
import type {
  BattleArmyState,
  CombatRole,
  FormationStrength,
} from '@/types/combat';
import type { BattleUnits } from '@/types/typings';

import {
  calculateBattleCloseness,
  calculateCasualtyBudget,
  calculateDailyReplacementThroughput,
  calculateDefenseCoverage,
  calculateFortDamageShare,
  calculateGoldLevelModifier,
  calculateMoraleXpFactor,
  calculateUnderDefendedMultipliers,
  getRaceIdentity,
  softCapCasualties,
  V5_COMBAT_CONSTANTS,
} from './balance/v5Combat';
import {
  buildCombatFormations,
  calculateCombatStrength,
  type CombatStrengthUser,
  type DetailedCalculatedStrength,
} from './combatStrength';
import { mtRand } from './mtrand';
import { type RandomFn, requireRandom } from './random';

/** Defines the battle user like shape used by related workflows. */
export type BattleUserLike = Omit<
  CombatStrengthUser,
  'units' | 'mercenaries' | 'fortLevel' | 'attackBonus' | 'defenseBonus'
> & {
  id?: number | string;
  displayName?: string;
  level?: number;
  population?: number;
  fortLevel?: number;
  fortHitpoints?: number;
  gold?: bigint;
  units?: BattleUnits[];
  mercenaries?: BattleUnits[];
  bonus_points?: readonly { type?: string; level?: number }[];
  playerBonuses?: readonly { bonusType?: string; bonusAmount?: number }[];
  attackBonus?: number;
  defenseBonus?: number;
  houseLevel?: number;
  defensePressureToday?: number;
  defensePressureDate?: Date | string | null;
  stamina?: number;
  dailyCasualtyAllowanceRemaining?: number;
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
  const playerBonus = (user.playerBonuses ?? []).reduce(
    (sum, bonus) =>
      sum +
      (bonus.bonusType?.toUpperCase() === 'CASUALTY'
        ? Number(bonus.bonusAmount ?? 0)
        : 0),
    0,
  );
  const pointsBonus = (user.bonus_points ?? []).reduce(
    (sum, bonus) =>
      sum +
      (bonus.type?.toUpperCase() === 'CASUALTY' ? Number(bonus.level ?? 0) : 0),
    0,
  );
  return playerBonus + pointsBonus;
}

function getStructureCasualtyMitigationPercent(
  structureUpgrades: CombatStrengthUser['structure_upgrades'],
): number {
  if (!Array.isArray(structureUpgrades)) return 0;
  const armoryLevel =
    structureUpgrades.find((u) => u?.type === 'ARMORY')?.level ?? 1;
  const upgrade = ArmoryUpgrades.find((u) => u.level === armoryLevel);
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
  /** Fractional wall damage accrued this battle; fortHP is its rounded view. */
  fortDamageAccrued: number;
  totalTurns: number;
  /** Turns the attacker committed to; loot coverage derives from it, unlike totalTurns which tracks the turn being played. */
  committedTurns: number;
  isDefenderProtected: boolean;
  attackerOffenseRemaining: number;
  defenderDefenseRemaining: number;
  initialDefenseCount: number;
  /** Any assault turn broke through (loot and wall damage eligibility). */
  assaultSucceeded: boolean;
  /** Assault turns won and lost; the battle goes to whoever took more, ties hold. */
  assaultTurnsWon: number;
  assaultTurnsLost: number;
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
  maxPillageGold: bigint;
  initialDefenderGold: bigint;
  /** Remaining gold all attackers may take from this defender today; null = uncapped. */
  defenderDailyGoldRemaining: bigint | null;
  random: RandomFn;
  initialAttackerScore: number;
  initialDefenderScore: number;
  /** Remaining units the defender may lose today across all attackers (dogpile cap). */
  defenderDailyCasualtyRemaining?: number;
  /** Garrison fatigue multiplier from defense pressure today (#204); scales the defender's power, never casualties. */
  defenderFatigueMultiplier: number;
}

/** Defines the simulation options shape used by related workflows. */
export type SimulationOptions = {
  random: RandomFn;
  /** Remaining daily casualty allowance for the defender across all attackers. */
  defenderDailyCasualtyRemaining?: number;
  /** Remaining daily gold all attackers may take from this defender. */
  defenderDailyGoldRemaining?: bigint;
};

const DEFAULT_BATTLE_CONSTANTS = {
  MAX_TURNS: V5_COMBAT_CONSTANTS.MAX_ATTACK_TURNS,
  ATTACKER_DAMAGE_MULTIPLIER: 1,
  DEFENDER_COUNTER_DAMAGE_MULTIPLIER: 1,
  MAX_PILLAGE_SHARE_PER_ATTACK: V5_COMBAT_CONSTANTS.MAX_GOLD_PILLAGE_SHARE,
  DAMAGE_VARIANCE_MIN: 0.92,
  DAMAGE_VARIANCE_MAX: 1.08,
};

let BATTLE_CONSTANTS: BattleConstants = { ...DEFAULT_BATTLE_CONSTANTS };

/** Defines the battle constants shape used by related workflows. */
export type BattleConstants = Omit<
  typeof DEFAULT_BATTLE_CONSTANTS,
  'MAX_TURNS'
> & {
  MAX_TURNS: number;
};

/** Returns battle constants for callers that need normalized game data. */
export function getBattleConstants(): BattleConstants {
  return { ...BATTLE_CONSTANTS };
}

/** Set battle constants. */
export function setBattleConstants(overrides: Partial<BattleConstants>): void {
  BATTLE_CONSTANTS = {
    ...BATTLE_CONSTANTS,
    ...overrides,
    MAX_TURNS: Math.min(
      V5_COMBAT_CONSTANTS.MAX_ATTACK_TURNS,
      overrides.MAX_TURNS ?? BATTLE_CONSTANTS.MAX_TURNS,
    ),
  };
}

/** Reset battle constants. */
export function resetBattleConstants(): void {
  BATTLE_CONSTANTS = { ...DEFAULT_BATTLE_CONSTANTS };
}

/**
 * Simulates a battle between two users, updating their units and fortifications over a series of turns.
 * @param {UserModel} attacker - The attacking user.
 * @param {UserModel} defender - The defending user.
 * @param {number} initialFortHP - The initial hitpoints of the defender's fortification.
 * @param {number} totalTurns - The number of turns the battle will last.
 * @returns {Promise<BattleResult>} The result of the battle simulation.
 */
export async function simulateBattle(
  attacker: BattleUserLike,
  defender: BattleUserLike,
  initialFortHP: number,
  totalTurns: number,
  _debug: boolean = false,
  isDefenderProtected: boolean = (defender.level ?? 0) <= 9,
  options?: SimulationOptions,
): Promise<BattleResult> {
  const random = requireRandom(options?.random);
  const committedTurns = Math.floor(
    clamp(totalTurns, 1, BATTLE_CONSTANTS.MAX_TURNS),
  );
  const state = initializeBattleState(
    attacker,
    defender,
    initialFortHP,
    isDefenderProtected,
    random,
  );
  state.defenderDailyCasualtyRemaining =
    options?.defenderDailyCasualtyRemaining;
  state.defenderDailyGoldRemaining =
    options?.defenderDailyGoldRemaining === undefined
      ? null
      : options.defenderDailyGoldRemaining > 0n
        ? options.defenderDailyGoldRemaining
        : 0n;
  state.totalTurns = committedTurns;
  state.committedTurns = committedTurns;
  for (let turn = 1; turn <= committedTurns; turn++) {
    await executeBattleTurn(state, turn);

    if (shouldBattleEndEarly(state)) break;
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
 * @returns {BattleState} The initialized battle state.
 */
function initializeBattleState(
  attacker: BattleUserLike,
  defender: BattleUserLike,
  initialFortHP: number,
  isDefenderProtected: boolean,
  random: RandomFn,
) {
  const battleResult = new BattleResult(attacker, defender);
  const attackerStrength = calculateStrength(attacker, 'OFFENSE');
  const defenderStrength = calculateStrength(defender, 'DEFENSE');
  // Garrison fatigue (#204) is fixed for the whole battle: pressure taken from
  // earlier attackers today tires the wall, and the applied percent travels
  // with the result so reports can show "Garrison fatigue: -X%".
  const fatigueMultiplier = defenderFatigueMultiplier(
    Number(defender.defensePressureToday ?? 0),
  );
  battleResult.defenderFatiguePercent = defenderFatiguePercent(
    Number(defender.defensePressureToday ?? 0),
  );
  const fortification = getFortificationByLevel(defender.fortLevel ?? 0);
  const resolvedStartFortHP = Number.isFinite(initialFortHP)
    ? Math.max(0, initialFortHP)
    : 0;
  // The siege clock and fort soak run against the tier's full wall, so a
  // half-repaired fort takes the same bite and shields less, not more.
  const resolvedMaxFortHP = Math.max(
    fortification.hitpoints,
    resolvedStartFortHP,
  );

  // Mutate rows in place so engine survivors stay identical to the caller's
  // roster objects; replacing arrays would orphan locked reserves and any
  // persistence view captured before the battle.
  const initializeUnitHp = (
    units: BattleUnits[],
    isMercenary: boolean,
  ): BattleUnits[] => {
    for (const unit of units || []) {
      const unitInfo = UnitTypes.find(
        (info) => info.type === unit.type && info.level === unit.level,
      );
      unit.isMercenary = isMercenary;
      unit.currentHP =
        unit.currentHP ??
        (unit.forceKind === 'MERCENARY'
          ? (unitInfo?.hp ?? 1) * 0.8
          : (unitInfo?.hp ?? 1));
    }
    return units || [];
  };

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
    fortDamageAccrued: 0,
    initialDefenseCount: defenderTotals.defense,
    assaultSucceeded: false,
    assaultTurnsWon: 0,
    assaultTurnsLost: 0,
    totalTurns: 0,
    committedTurns: 0,
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
    initialDefenderGold: BigInt(defender.gold ?? BigInt(0)),
    maxPillageGold: calculatePillageBudget(
      defender.gold ?? 0n,
      resolvedMaxFortHP > 0
        ? clamp(resolvedStartFortHP / resolvedMaxFortHP, 0, 1)
        : 0,
      isDefenderProtected,
      defender.level ?? 1,
    ),
    defenderDailyGoldRemaining: null,
    random,
    initialAttackerScore:
      attackerStrength.totalStats.MeleeAtkPower +
      attackerStrength.totalStats.RangedAtkPower,
    initialDefenderScore:
      defenderStrength.totalStats.MeleeDefPower +
      defenderStrength.totalStats.RangedDefPower,
    defenderFatigueMultiplier: fatigueMultiplier,
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
 */
async function executeBattleTurn(state: BattleState, turn: number) {
  state.totalTurns = turn;
  state.defender.dailyCasualtyAllowanceRemaining =
    state.defenderDailyCasualtyRemaining;
  const fatigue = calculateCombatFatigue(turn);
  const attackerStrength = calculateArmyStrengthFromFormations(
    buildBattleArmyState(state.attacker, 'OFFENSE'),
  );
  const includeCitz = state.defenderDefenseRemaining === 0 || state.fortHP <= 0;
  const includeOffense =
    state.fortHP <= 0 && state.defenderDefenseRemaining === 0;
  const defenderStrength = calculateStrength(
    state.defender,
    'DEFENSE',
    includeCitz,
    includeOffense,
  ).totalStats;
  state.attackerMeleeAtkPower = attackerStrength.meleeAtkPower * fatigue;
  state.attackerMeleeDefPower = attackerStrength.meleeDefPower * fatigue;
  state.attackerRangedAtkPower = attackerStrength.rangedAtkPower * fatigue;
  state.attackerRangedDefPower = attackerStrength.rangedDefPower * fatigue;
  state.defenderMeleeAtkPower = defenderStrength.MeleeAtkPower;
  state.defenderMeleeDefPower = defenderStrength.MeleeDefPower;
  state.defenderRangedAtkPower = defenderStrength.RangedAtkPower;
  state.defenderRangedDefPower = defenderStrength.RangedDefPower;

  const attackerPhase = turn % 2 === 1;
  const source = attackerPhase ? 'ATTACKER' : 'DEFENDER';
  const multiplier = attackerPhase
    ? BATTLE_CONSTANTS.ATTACKER_DAMAGE_MULTIPLIER
    : BATTLE_CONSTANTS.DEFENDER_COUNTER_DAMAGE_MULTIPLIER;
  // One variance roll per channel per turn; the walls and the same-turn
  // ranged counter share them so replays and seeds stay stable.
  const meleeVariance = mtRand(
    BATTLE_CONSTANTS.DAMAGE_VARIANCE_MIN,
    BATTLE_CONSTANTS.DAMAGE_VARIANCE_MAX,
    state.random,
  );
  const rangedVariance = mtRand(
    BATTLE_CONSTANTS.DAMAGE_VARIANCE_MIN,
    BATTLE_CONSTANTS.DAMAGE_VARIANCE_MAX,
    state.random,
  );
  const meleeAttack =
    (attackerPhase
      ? state.attackerMeleeAtkPower
      : state.defenderMeleeAtkPower) *
    multiplier *
    meleeVariance;
  const rangedAttack =
    (attackerPhase
      ? state.attackerRangedAtkPower
      : state.defenderRangedAtkPower) *
    multiplier *
    rangedVariance;
  const meleeDefense = attackerPhase
    ? state.defenderMeleeDefPower
    : state.attackerMeleeDefPower;
  const rangedDefense = attackerPhase
    ? state.defenderRangedDefPower
    : state.attackerRangedDefPower;
  // Ranged defenders support melee-only assaults; matching ranged defense and counters stay unchanged.
  const attackPressure = meleeAttack + rangedAttack;
  const defensePressure =
    (meleeAttack > 0 ? meleeDefense : 0) +
    (rangedAttack > 0
      ? rangedDefense
      : attackerPhase && meleeAttack > 0
        ? rangedDefense * V5_COMBAT_CONSTANTS.RANGED_DEFENSE_ASSAULT_WEIGHT
        : 0);
  // Garrison fatigue (#204) tips whether the wall holds: the tired garrison's
  // contest defense is scaled down, and the normal consequences of a breach —
  // loot included — follow from that same fatigued contest, so a fatigued
  // breach always pays. Fort damage, counter damage, every casualty budget
  // and the pressure-based dogpile protection below keep the rested power,
  // so pressure never adds losses.
  const contestDefensePressure = attackerPhase
    ? defensePressure * state.defenderFatigueMultiplier
    : defensePressure;
  const assaultSucceeded =
    attackerPhase &&
    attackPressure > contestDefensePressure &&
    state.attackerOffenseRemaining > 0;
  state.assaultSucceeded ||= assaultSucceeded;
  if (attackerPhase && state.attackerOffenseRemaining > 0) {
    if (assaultSucceeded) state.assaultTurnsWon += 1;
    else state.assaultTurnsLost += 1;
  }
  const fortHpStart = state.fortHP;
  const maxFortHP = state.initialFortHP ?? 0;
  if (
    attackerPhase &&
    state.attackerOffenseRemaining > 0 &&
    state.fortHP > 0 &&
    maxFortHP > 0
  ) {
    // Walls erode as a share of max HP per assault turn, bounded per battle,
    // and a repelled assault still scorches them when it came close.
    const fortification = getFortificationByLevel(state.defender.fortLevel);
    const totals = getUnitTotals(state.defender);
    const population = Object.values(totals).reduce(
      (sum, count) => sum + count,
      0,
    );
    const coverage = calculateDefenseCoverage({
      defenseUnits: totals.defense,
      totalPopulation: population,
    });
    const turnDamage =
      calculateFortDamage(
        attackPressure,
        defensePressure,
        (fortification.MeleeDefPower ?? 0) +
          (fortification.RangedDefPower ?? 0),
        maxFortHP,
      ) * calculateUnderDefendedMultipliers(coverage).fortDamageMultiplier;
    const battleCap =
      maxFortHP * V5_COMBAT_CONSTANTS.FORT_DAMAGE.PER_BATTLE_CAP_SHARE;
    state.fortDamageAccrued = Math.min(
      battleCap,
      state.fortDamageAccrued + Math.max(0, turnDamage),
    );
    // Any assault that reached the walls leaves at least a visible scratch,
    // but only a successful assault can bring the last hitpoint down.
    const scratch =
      state.fortDamageAccrued > 0
        ? Math.max(1, Math.round(state.fortDamageAccrued))
        : 0;
    const appliedDamage = state.assaultSucceeded
      ? scratch
      : Math.min(scratch, Math.max(0, state.startFortHP - 1));
    state.fortHP = Math.max(0, state.startFortHP - appliedDamage);
  }

  let totalDamage = 0;
  let sameTurnCounterDamage = 0;
  for (const [attackType, attack, defense] of [
    ['MELEE', meleeAttack, meleeDefense],
    ['RANGED', rangedAttack, rangedDefense],
  ] as const) {
    if (attack <= 0) continue;
    const damage = newComputeCasualties(
      attack,
      defense,
      0,
      0,
      state.initialFortHP ?? 0,
      attack / Math.max(1, defense),
      attackerPhase ? state.fortHP : undefined,
      includeCitz,
      includeOffense,
      attackerPhase && state.isDefenderProtected,
      attackerPhase
        ? {
            taperChipDamage: true,
            defenderFortLevel: state.defender.fortLevel,
            defenderCasualtyBonusPct: getUserCasualtyBonusPercent(
              state.defender,
            ),
            defenderStructureUpgrades: state.defender.structure_upgrades,
          }
        : undefined,
    );
    totalDamage += damage.damageDealt;
    state.battleResult.mitigationLog.push({
      turn,
      source,
      attackType,
      rawDamage: damage.rawDamageDealt,
      mitigatedDamage: damage.damageDealt,
      fortSoakMultiplier: damage.fortSoakMultiplier,
      mitigationMultiplier: damage.mitigationMultiplier,
      fortHpStart,
      fortHpEnd: state.fortHP,
      fortHpRatio: state.initialFortHP
        ? clamp(state.fortHP / state.initialFortHP, 0, 1)
        : 0,
      defenderFortLevel: damage.mitigation?.defenderFortLevel,
      defenderFortMitigationPct: damage.mitigation?.defenderFortMitigationPct,
      defenderCasualtyBonusPct: damage.mitigation?.defenderCasualtyBonusPct,
      defenderStructureMitigationPct:
        damage.mitigation?.defenderStructureMitigationPct,
      totalMitigationPct: damage.mitigation?.totalMitigationPct,
      fortBreached: state.fortHP <= 0,
      includeCitz,
      includeOffense,
    });
  }

  if (attackerPhase && assaultSucceeded && totalDamage > 0) {
    // A won assault always lands: the first turn the walls give way kills at
    // least one defender instead of dissolving into sub-unit chip damage.
    const lowestDefenderHp = [
      ...(state.defender.units || []),
      ...(state.defender.mercenaries || []),
    ]
      .filter((u) => u.type === 'DEFENSE' && (u.quantity || 0) > 0)
      .map((u) => u.currentHP ?? 1)
      .reduce((min, hp) => Math.min(min, hp), Number.POSITIVE_INFINITY);
    if (
      Number.isFinite(lowestDefenderHp) &&
      state.battleResult.Losses.Defender.total === 0
    ) {
      totalDamage = Math.max(totalDamage, lowestDefenderHp);
    }
  }

  if (attackerPhase && state.defenderRangedAtkPower > 0) {
    // Ranged defenders answer on the attacker's own turn; the full melee and
    // ranged response still follows on the defender's turn.
    const fortHpRatio =
      maxFortHP > 0 ? clamp(state.fortHP / maxFortHP, 0, 1) : 0;
    const counterAttack =
      state.defenderRangedAtkPower *
      BATTLE_CONSTANTS.DEFENDER_COUNTER_DAMAGE_MULTIPLIER *
      (1 + V5_COMBAT_CONSTANTS.RANGED_COUNTER_FORT_BONUS * fortHpRatio) *
      rangedVariance;
    const counter = newComputeCasualties(
      counterAttack,
      state.attackerRangedDefPower,
      0,
      0,
      maxFortHP,
      counterAttack / Math.max(1, state.attackerRangedDefPower),
    );
    sameTurnCounterDamage = counter.damageDealt;
    state.battleResult.mitigationLog.push({
      turn,
      source: 'DEFENDER',
      attackType: 'RANGED',
      rawDamage: counter.rawDamageDealt,
      mitigatedDamage: counter.damageDealt,
      fortSoakMultiplier: counter.fortSoakMultiplier,
      mitigationMultiplier: counter.mitigationMultiplier,
      fortHpStart,
      fortHpEnd: state.fortHP,
      fortHpRatio,
      fortBreached: state.fortHP <= 0,
      includeCitz,
      includeOffense,
    });
  }

  await distributeCasualties({
    result: state.battleResult,
    attacker: state.attacker,
    defender: state.defender,
    attackerDamageDealt: attackerPhase ? totalDamage : 0,
    defenderDamageDealt: attackerPhase ? sameTurnCounterDamage : totalDamage,
    fortHP: state.fortHP,
    initialFortHP: state.initialFortHP ?? 0,
    turn,
    includeCitz,
    includeOffense,
    isDefenderProtected: state.isDefenderProtected,
    assaultSucceeded,
  });

  if (assaultSucceeded) {
    const fortHpPercent = state.initialFortHP
      ? clamp(state.fortHP / state.initialFortHP, 0, 1)
      : 0;
    // Each won assault turn pillages the share of the cap its pair of turns
    // covers, so loot grows linearly with commitment: a 1-turn raid takes a
    // tenth of what a fully won 10-turn assault takes.
    const coveredTurns = Math.min(2, state.committedTurns - turn + 1);
    const attempted = calculateLoot(
      state.attacker,
      state.defender,
      turn,
      state.random,
      {
        assaultSucceeded,
        attackPressure,
        // The loot check rides the SAME fatigued contest value that decided
        // the assault: a breach that happened only because the garrison was
        // tired still yields loot instead of an empty "success".
        // The loot check rides the SAME fatigued contest value that decided
        // the assault: a breach that happened only because the garrison was
        // tired still yields loot instead of an empty "success".
        defensePressure: contestDefensePressure,
        fortHpPercent,
        isDefenderProtected: state.isDefenderProtected,
        coveredTurns,
      },
    );
    const dynamicBudget = calculatePillageBudget(
      state.initialDefenderGold,
      fortHpPercent,
      state.isDefenderProtected,
      state.defender.level ?? 1,
    );
    state.maxPillageGold =
      dynamicBudget > state.maxPillageGold
        ? dynamicBudget
        : state.maxPillageGold;
    const remaining = state.maxPillageGold - state.totalPillagedGold;
    const applied = [
      attempted,
      state.defender.gold ?? 0n,
      remaining > 0n ? remaining : 0n,
      state.defenderDailyGoldRemaining ?? attempted,
    ].reduce((min, amount) => (amount < min ? amount : min), attempted);
    // A treasury in debt yields nothing; never pillage a negative amount.
    const safeApplied = applied > 0n ? applied : 0n;
    state.totalPillagedGold += safeApplied;
    state.defender.gold = (state.defender.gold ?? 0n) - safeApplied;
    if (state.defenderDailyGoldRemaining !== null)
      state.defenderDailyGoldRemaining -= safeApplied;
  }
  state.attackerOffenseRemaining = sumUnitQuantity(state.attacker, 'OFFENSE');
  state.defenderDefenseRemaining = sumUnitQuantity(state.defender, 'DEFENSE');
  state.defenderCitizensRemaining = sumUnitQuantity(state.defender, 'CITIZEN');
  state.defenderWorkersRemaining = sumUnitQuantity(state.defender, 'WORKER');
  state.defenderOffenseRemaining = sumUnitQuantity(state.defender, 'OFFENSE');
}

/**
 * Determines if the battle should end early based on remaining units and fortification status.
 * @param {any} state - The current battle state.
 * @returns {boolean} True if the battle should end early, false otherwise.
 */
function shouldBattleEndEarly(state: BattleState) {
  if (state.attackerOffenseRemaining <= 0) {
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
    return true;
  }

  return false;
}

/** The away army loses 2% effectiveness per elapsed turn, once (82% on turn 10). */
function calculateCombatFatigue(turn: number): number {
  return clamp(1 - 0.02 * (Math.max(1, turn) - 1), 0.5, 1);
}

/**
 * Wall damage for one assault turn, in hitpoints (fractional; callers round
 * the running total). The pressure ratio compares the attacker's total
 * pressure with the manned wall: the defender's defense pressure plus the
 * fort's own defense power. Share-of-max-HP scaling keeps every fort tier on
 * the same siege clock; see calculateFortDamageShare. The turn's
 * damage variance already lives in `attackPressure`; `variance` exists for
 * callers that pass unrolled pressure.
 */
export function calculateFortDamage(
  attackPressure: number,
  defensePressure: number,
  fortificationDefensePower: number,
  maxFortHP: number,
  variance = 1,
): number {
  const safeMax = Math.max(0, Number(maxFortHP) || 0);
  if (safeMax <= 0) return 0;
  const wall =
    Math.max(0, Number(defensePressure) || 0) +
    Math.max(0, Number(fortificationDefensePower) || 0);
  const ratio = Math.max(0, Number(attackPressure) || 0) / Math.max(1, wall);
  const share = calculateFortDamageShare(ratio);
  if (share <= 0) return 0;
  return share * safeMax * Math.max(0, Number(variance) || 0);
}

/** Calculates battle experience used by combat, economy, or presentation logic. */
export function calculateBattleExperience(
  isAttackerWinner: boolean,
  levelDifference: number,
  attackTurns: number,
  fortDestroyed: boolean,
  winRatio: number = 1,
  attackerMorale: number = 100,
  attackerLevel: number = 1,
): { attackerXP: number; defenderXP: number } {
  const turns = clamp(attackTurns, 1, BATTLE_CONSTANTS.MAX_TURNS);
  const safeAttackerLevel = Math.max(1, Math.floor(Number(attackerLevel) || 1));
  const xpPerTurn = calculateProgressionXpPerTurn(safeAttackerLevel);
  const commitmentEfficiency = calculateTurnCommitmentXpEfficiency(turns);
  const xpLevelModifier = clamp(1 + levelDifference * 0.08, 0.35, 1.45);
  const closeness = clamp(calculateBattleCloseness(winRatio), 0.75, 1.18);
  const moraleFactor = calculateMoraleXpFactor(attackerMorale, turns);
  const fortBonus = fortDestroyed ? 1.1 : 1;
  const baseXP =
    turns *
    xpPerTurn *
    commitmentEfficiency *
    xpLevelModifier *
    closeness *
    moraleFactor *
    fortBonus;

  // The defender's share is taken from the unmodified base: repelling an
  // assault pays better than losing one, regardless of the attacker's result.
  const attackerXP = Math.round(baseXP * (isAttackerWinner ? 1 : 0.22));
  const defenderXP = Math.round(baseXP * (isAttackerWinner ? 0.25 : 0.75));

  return {
    attackerXP,
    defenderXP,
  };
}

function calculateProgressionXpPerTurn(level: number): number {
  if (level <= 10) return 360;
  if (level <= 25) return 240;
  if (level <= 50) return 150;
  if (level <= 75) return 100;
  return 75;
}

function calculateTurnCommitmentXpEfficiency(turns: number): number {
  const normalizedTurns =
    clamp(turns, 1, BATTLE_CONSTANTS.MAX_TURNS) / BATTLE_CONSTANTS.MAX_TURNS;
  return clamp(0.22 + 0.78 * normalizedTurns ** 0.85, 0.25, 1);
}

export function calculateStrength(
  user: BattleUserLike,
  unitType: 'OFFENSE' | 'DEFENSE',
  includeCitz = false,
  includeOffense = false,
): DetailedCalculatedStrength {
  const result = calculateCombatStrength(user, unitType);
  const bonus =
    unitType === 'OFFENSE' ? (user.attackBonus ?? 0) : (user.defenseBonus ?? 0);
  const race = getRaceIdentity(user.race);
  const multiplier =
    (1 + bonus / 100) *
    (unitType === 'OFFENSE' ? race.offenseMultiplier : race.defenseMultiplier);
  const support: Array<{
    type: 'CITIZEN' | 'WORKER' | 'OFFENSE';
    effectiveness: number;
  }> = [];
  if (includeCitz)
    support.push(
      { type: 'CITIZEN', effectiveness: 0.1 },
      { type: 'WORKER', effectiveness: 0.1 },
    );
  if (includeOffense && unitType === 'DEFENSE')
    support.push({ type: 'OFFENSE', effectiveness: 0.7 });
  for (const { type, effectiveness } of support) {
    const strength = calculateCombatStrength(user, type, { multiplier: 1 });
    for (const section of ['baseStats', 'itemStats', 'upgradeStats'] as const) {
      for (const key of [
        'MeleeAtkPower',
        'MeleeDefPower',
        'RangedAtkPower',
        'RangedDefPower',
      ] as const)
        result[section][key] += strength[section][key] * effectiveness;
    }
  }
  for (const key of [
    'MeleeAtkPower',
    'MeleeDefPower',
    'RangedAtkPower',
    'RangedDefPower',
  ] as const) {
    result.totalStats[key] = Math.ceil(
      (result.baseStats[key] +
        result.itemStats[key] +
        result.upgradeStats[key]) *
        multiplier,
    );
  }
  return result;
}

function calculateDefenderLevelFactor(defenderLevel: number): number {
  if (defenderLevel >= 20) return 1; // Full loot potential at higher levels

  if (defenderLevel < 10) {
    // Protected levels pay a flat share of the exposed gold
    return V5_COMBAT_CONSTANTS.PROTECTED_LEVEL_LOOT_FACTOR;
  }

  // Scale between 70% at level 10 and 100% at level 20
  return 0.7 + (defenderLevel - 10) * ((1 - 0.7) / 10);
}

/**
 * Loot-cap multiplier on a protected defender's shielded gold. Tapers linearly
 * with level: 0.1 at level 1 up to 1.0 at level 10 (0.1 + 0.9 * (level - 1) / 9).
 */
export function getProtectedLootMultiplier(level = 1): number {
  const start = V5_COMBAT_CONSTANTS.PROTECTED_LOOT_MULTIPLIER;
  const end = V5_COMBAT_CONSTANTS.PROTECTED_LOOT_MULTIPLIER_MAX;
  const span = V5_COMBAT_CONSTANTS.PROTECTION_TAPER_END_LEVEL - 1;
  const progress = clamp((Number(level) || 1) - 1, 0, span) / span;
  return start + (end - start) * progress;
}

/**
 * Fort-aware loot cap share: a standing fort shields the treasury, scaling the
 * per-attack pillage cap down to FORT_LOOT_CAP_FLOOR_SHARE of the maximum
 * until the walls come down. Protected (low-level) defenders keep a token cap.
 */
export function calculateFortAdjustedPillageCapShare(
  fortHpPercent: number,
  isDefenderProtected = false,
  defenderLevel = 1,
): number {
  const fortHp = clamp(fortHpPercent, 0, 1);
  const floorShare = V5_COMBAT_CONSTANTS.FORT_LOOT_CAP_FLOOR_SHARE;
  const share =
    BATTLE_CONSTANTS.MAX_PILLAGE_SHARE_PER_ATTACK *
    (floorShare + (1 - floorShare) * (1 - fortHp));
  return isDefenderProtected
    ? share * getProtectedLootMultiplier(defenderLevel)
    : share;
}

/**
 * Splits a treasury into the part a protected defender's shield covers and the
 * part raiders see at the normal rate. Unprotected defenders have no shield.
 */
function splitProtectedGold(
  gold: bigint,
  isDefenderProtected: boolean,
): { shielded: bigint; exposed: bigint } {
  if (gold <= 0n) return { shielded: 0n, exposed: 0n };
  if (!isDefenderProtected) return { shielded: 0n, exposed: gold };
  const allowance = BigInt(V5_COMBAT_CONSTANTS.PROTECTED_GOLD_ALLOWANCE);
  const shielded = gold < allowance ? gold : allowance;
  return { shielded, exposed: gold - shielded };
}

/**
 * Most gold one battle may take from a treasury: the fort-adjusted cap share,
 * shrunk only on the protected allowance so a hoard cannot hide behind protection.
 */
export function calculatePillageBudget(
  gold: bigint,
  fortHpPercent: number,
  isDefenderProtected = false,
  defenderLevel = 1,
): bigint {
  const { shielded, exposed } = splitProtectedGold(gold, isDefenderProtected);
  return (
    bigintShare(
      shielded,
      calculateFortAdjustedPillageCapShare(fortHpPercent, true, defenderLevel),
    ) +
    bigintShare(
      exposed,
      calculateFortAdjustedPillageCapShare(fortHpPercent, false),
    )
  );
}

/** Calculates loot used by combat, economy, or presentation logic. */
export interface LootRaidContext {
  assaultSucceeded: boolean;
  attackPressure: number;
  /**
   * Defense pressure for the raid gate. Callers pass the same fatigued
   * contest value that decided the assault, so breach and loot agree.
   */
  defensePressure: number;
  fortHpPercent: number;
  isDefenderProtected?: boolean;
  /** Committed turns this won assault turn pays for (1 or 2); defaults to `turns`. */
  coveredTurns?: number;
}

/** Fixed-point share keeps the treasury ledger exact even above Number.MAX_SAFE_INTEGER. */
function bigintShare(balance: bigint, share: number): bigint {
  if (balance <= 0n) return 0n;
  return (
    (balance * BigInt(Math.floor(clamp(share, 0, 1) * 1_000_000_000))) /
    1_000_000_000n
  );
}

export function calculateLoot(
  attacker: BattleUserLike,
  defender: BattleUserLike,
  turns: number,
  random: RandomFn,
  raid: LootRaidContext,
): bigint {
  requireRandom(random);
  if (
    !raid.assaultSucceeded ||
    raid.attackPressure <= raid.defensePressure ||
    raid.attackPressure <= 0
  )
    return 0n;
  const safeTurns = clamp(turns, 1, BATTLE_CONSTANTS.MAX_TURNS);
  const uniformFactor = mtRand(92, 100, random) / 100;
  const levelDifference = (defender.level ?? 0) - (attacker.level ?? 0);
  const fortHpPercent = clamp(raid.fortHpPercent, 0, 1);
  const defenderTotals = getUnitTotals(defender);
  const defenseCoverage = calculateDefenseCoverage({
    defenseUnits: defenderTotals.defense,
    totalPopulation:
      defenderTotals.citizens +
      defenderTotals.workers +
      defenderTotals.offense +
      defenderTotals.defense +
      defenderTotals.spies +
      defenderTotals.sentries,
  });
  const underDefended = calculateUnderDefendedMultipliers(defenseCoverage);
  const defenderLevelFactor = calculateDefenderLevelFactor(defender.level ?? 0);
  // Linear in commitment: the fort-adjusted cap is earned over MAX_TURNS, and
  // a won assault turn takes the slice its covered turns represent.
  const coveredTurns = clamp(
    raid.coveredTurns ?? safeTurns,
    1,
    BATTLE_CONSTANTS.MAX_TURNS,
  );
  const sharedFactor =
    (coveredTurns / BATTLE_CONSTANTS.MAX_TURNS) *
    calculateGoldLevelModifier(levelDifference) *
    underDefended.rewardMultiplier *
    getRaceIdentity(attacker.race).goldPillageMultiplier *
    uniformFactor;
  const { shielded, exposed } = splitProtectedGold(
    defender.gold ?? 0n,
    raid.isDefenderProtected === true,
  );
  const shieldedCap = calculateFortAdjustedPillageCapShare(
    fortHpPercent,
    true,
    defender.level ?? 1,
  );
  const exposedCap = calculateFortAdjustedPillageCapShare(fortHpPercent, false);
  // The level ramp only softens unprotected gold; the shield already shrinks
  // its own slice (tapering from tenfold at level 1), so the ramp does not stack on it.
  const loot =
    bigintShare(shielded, shieldedCap * sharedFactor) +
    bigintShare(exposed, exposedCap * sharedFactor * defenderLevelFactor);
  const cap =
    bigintShare(shielded, shieldedCap) + bigintShare(exposed, exposedCap);
  return loot > cap ? cap : loot;
}

/**
 * Converts attack and defense power into mitigated damage.
 *
 * Uses subtraction as the primary model but enforces a chip-damage floor so
 * defense can never hard-nullify a non-zero attack.
 *
 * @param attackPower - Effective attack pressure after turn, race, morale, and roll modifiers.
 * @param defensePower - Effective defense pressure against the incoming damage type.
 * @param minimumDamageRatio - Minimum chip damage as a share of attack power.
 * @param taperChip - Scale the chip floor by the attack/defense ratio so badly
 *   outmatched assaults stop chipping the defense (attacker assaults only).
 * @returns Mitigated damage before casualty budgeting.
 */
function computeMitigatedDamage(
  attackPower: number,
  defensePower: number,
  minimumDamageRatio = 0.05,
  taperChip = false,
): number {
  const safeAttackPower = Math.max(0, Number(attackPower) || 0);
  const safeDefensePower = Math.max(0, Number(defensePower) || 0);

  if (safeAttackPower <= 0) return 0;

  const subtractiveDamage = Math.max(0, safeAttackPower - safeDefensePower);
  const { CHIP_TAPER_START_RATIO: start, CHIP_TAPER_FULL_RATIO: full } =
    V5_COMBAT_CONSTANTS;
  const chipShare = taperChip
    ? clamp(
        (safeAttackPower / Math.max(1e-9, safeDefensePower) - start) /
          (full - start),
        0,
        1,
      )
    : 1;
  const chipDamage = safeAttackPower * minimumDamageRatio * chipShare;

  return Math.max(subtractiveDamage, chipDamage);
}

/** New compute casualties. */
export function newComputeCasualties(
  attackerAtk: number,
  defenderDef: number,
  _attackerPop: number,
  _defenderPop: number,
  initialFortHP: number,
  piercingRatio: number,
  fortHitpoints?: number,
  _includeCitz: boolean = false,
  _includeOffense: boolean = false,
  isDefenderProtected: boolean = false,
  options?: {
    defenderFortLevel?: number;
    defenderCasualtyBonusPct?: number;
    defenderStructureUpgrades?: CombatStrengthUser['structure_upgrades'];
    /** Attacker assault: taper chip damage against much stronger defenses. */
    taperChipDamage?: boolean;
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
  const defenderDefFloor =
    attackerAtk > 0 ? Math.max(1, Math.floor(attackerAtk * 0.05)) : 1;
  const effectiveDefenderDef =
    Number.isFinite(defenderDef) && defenderDef > 0
      ? defenderDef
      : defenderDefFloor;

  let damageDealt = computeMitigatedDamage(
    attackerAtk,
    effectiveDefenderDef,
    0.05,
    options?.taperChipDamage === true,
  );

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

  if (isDefenderProtected === true) {
    damageDealt *= V5_COMBAT_CONSTANTS.PROTECTED_DAMAGE_MULTIPLIER;
  }

  return {
    damageDealt: Math.ceil(damageDealt),
    rawDamageDealt: Math.ceil(rawDamageDealt),
    fortSoakMultiplier,
    mitigationMultiplier,
    mitigation,
  };
}

/** Distribute casualties. */
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
  /** Level 9 and under: losses are capped at PROTECTED_LOSS_CAP_SHARE of population per battle. */
  isDefenderProtected?: boolean;
  /** The assault broke through this turn: a won assault always lands one hit. */
  assaultSucceeded?: boolean;
}): Promise<{ attackerCasualties: number; defenderCasualties: number }> {
  const {
    result,
    attacker,
    defender,
    attackerDamageDealt,
    defenderDamageDealt,
    fortHP,
    initialFortHP,
    turn = 1,
    includeCitz: _includeCitz = false,
    includeOffense: _includeOffense = false,
    isDefenderProtected = false,
    assaultSucceeded = false,
  } = params;

  let totalAttackerCasualties = 0;
  let totalDefenderCasualties = 0;

  // Battle-cumulative damage received by each side, this phase included;
  // feeds casualty win quality (kept apart from the diagnostic damage audit).
  result.damageReceived ??= { attacker: 0, defender: 0 };
  result.damageReceived.defender += Math.max(0, attackerDamageDealt);
  result.damageReceived.attacker += Math.max(0, defenderDamageDealt);
  const cumulativeDamageToDefender = result.damageReceived.defender;
  const cumulativeDamageToAttacker = result.damageReceived.attacker;

  /**
   * Replacement-anchored casualty cap for one side of the battle.
   *
   * The ceiling is min(5 days of rebuild throughput, 8% of the population at
   * risk), scaled down by battle severity (turn pressure, level gap, fort
   * state, dogpile pressure). `turns` is the cumulative turn number so the
   * budget grows over the battle; `alreadyLost` makes the cap a per-battle
   * allowance rather than a per-turn one. `dailyAllowanceRemaining` clamps the
   * total across all attackers in a day (dogpile protection).
   * `cap` is the limit; the other fields are its components, reported only
   * in the damage audit.
   *
   * Win quality (damage received / damage dealt) uses battle-cumulative
   * totals, not the current phase. Phases are one-sided (assault turns only
   * hurt the defender, defense turns only hurt the attacker), so a
   * phase-local ratio pinned the defender to the 0.3 floor and the attacker
   * to 1.0, letting a decisive attacker always reach its full 8% ceiling.
   * A side that has dealt nothing but taken damage gets winQuality 1 (via
   * max(1, dealt)); a side that has taken nothing has no casualties to cap.
   * The attacker's floor is ATTACKER_WIN_QUALITY_FLOOR (0.5), so even a
   * decisive raid costs at least half the ceiling; the defender keeps 0.3.
   */
  const budgetCasualtyCapDetailsFor = (params: {
    user: BattleUserLike;
    opponent: BattleUserLike;
    population: number;
    turns: number;
    fortHpPercent: number;
    /** Damage this side has received so far this battle, this phase included. */
    cumulativeDamageToUser: number;
    /** Damage this side has dealt so far this battle, this phase included. */
    cumulativeDamageByUser: number;
    alreadyLost: number;
    dailyAllowanceRemaining?: number;
    /** Lowest win-quality multiplier; defaults to the defender's 0.3. */
    winQualityFloor?: number;
    /** Attacks received today; only the defender under dogpile earns this. */
    defensePressureToday: number;
  }): {
    cap: number;
    singleAttackCap: number | null;
    softCap: number | null;
    dailyRemaining: number | null;
    perBattleRemaining: number;
  } => {
    if (params.population <= 0)
      return {
        cap: 0,
        singleAttackCap: null,
        softCap: null,
        dailyRemaining: null,
        perBattleRemaining: 0,
      };
    const houseUpgrade =
      HouseUpgrades[
        Math.max(
          0,
          Number(params.user.houseLevel ?? 0),
        ) as keyof typeof HouseUpgrades
      ] ?? HouseUpgrades[0];
    const dailyThroughput = calculateDailyReplacementThroughput({
      houseCitizens: Number(houseUpgrade?.citizensDaily ?? 1),
      race: params.user.race,
    });
    const budget = calculateCasualtyBudget({
      dailyThroughput,
      population: params.population,
      turns: clamp(params.turns, 1, BATTLE_CONSTANTS.MAX_TURNS),
      levelDifference: (params.opponent.level ?? 0) - (params.user.level ?? 0),
      winQuality:
        params.cumulativeDamageToUser /
        Math.max(1, params.cumulativeDamageByUser),
      winQualityFloor: params.winQualityFloor,
      fortHpPercent: params.fortHpPercent,
      defensePressureToday: params.defensePressureToday,
    });
    const singleAttackCap = Math.floor(
      params.population * V5_COMBAT_CONSTANTS.SINGLE_ATTACK_POPULATION_LOSS_CAP,
    );
    const softCap = Math.floor(softCapCasualties(params.population, budget));
    const perBattleRemaining = Math.max(
      0,
      Math.min(singleAttackCap, softCap) - params.alreadyLost,
    );

    if (
      typeof params.dailyAllowanceRemaining === 'number' &&
      Number.isFinite(params.dailyAllowanceRemaining)
    ) {
      const dailyRemaining = Math.max(
        0,
        Math.floor(params.dailyAllowanceRemaining) - params.alreadyLost,
      );
      return {
        cap: Math.min(perBattleRemaining, dailyRemaining),
        singleAttackCap,
        softCap,
        dailyRemaining,
        perBattleRemaining,
      };
    }
    return {
      cap: perBattleRemaining,
      singleAttackCap,
      softCap,
      dailyRemaining: null,
      perBattleRemaining,
    };
  };

  const auditFor = (side: 'attacker' | 'defender'): DamageAuditSide => {
    result.damageAudit ??= {
      attacker: createDamageAuditSide(),
      defender: createDamageAuditSide(),
    };
    return result.damageAudit[side];
  };
  /** Records one turn's damage against a side; diagnostic only. */
  const recordAudit = (
    side: 'attacker' | 'defender',
    entry: {
      rawIn: number;
      suppressed: number;
      binding: DamageAuditBindingCap;
      caps: DamageAuditSide['caps'];
    },
  ) => {
    const audit = auditFor(side);
    audit.rawIn += entry.rawIn;
    audit.applied += entry.rawIn - entry.suppressed;
    audit.suppressed += entry.suppressed;
    audit.caps = entry.caps;
    if (entry.suppressed > 0) {
      audit.suppressedBy[entry.binding] =
        (audit.suppressedBy[entry.binding] ?? 0) + entry.suppressed;
      let top: DamageAuditBindingCap = 'none';
      let topAmount = 0;
      for (const [label, amount] of Object.entries(audit.suppressedBy)) {
        if ((amount ?? 0) > topAmount) {
          top = label as DamageAuditBindingCap;
          topAmount = amount ?? 0;
        }
      }
      audit.bindingCap = top;
    }
  };
  /** Which cap limited a pass that left damage unspent. */
  const bindingCapFor = (
    pass: { hitCasualtyCap: boolean; hitStackCap: boolean },
    caps: {
      usedCap: number;
      protectedCap: number;
      singleAttackCap: number | null;
      softCap: number | null;
      dailyRemaining: number | null;
      perBattleRemaining: number;
    },
  ): DamageAuditBindingCap => {
    if (pass.hitCasualtyCap) {
      if (caps.protectedCap <= caps.usedCap) return 'protected';
      if (
        caps.dailyRemaining !== null &&
        caps.dailyRemaining < caps.perBattleRemaining
      )
        return 'daily';
      if (
        caps.singleAttackCap !== null &&
        caps.softCap !== null &&
        caps.singleAttackCap <= caps.softCap
      )
        return 'singleAttack';
      return 'soft';
    }
    return pass.hitStackCap ? 'stack' : 'none';
  };

  const applyDamageToUnits = (
    unitPool: BattleUnits[],
    damage: number,
    isDefender: boolean,
    _isCollateral: boolean = false,
    maxCasualties?: number,
  ): {
    casualties: number;
    remainingDamage: number;
    hitCasualtyCap: boolean;
    hitStackCap: boolean;
  } => {
    let remainingDamage = damage;
    let casualtiesCount = 0;
    let hitStackCap = false;
    const side = isDefender ? 'Defender' : 'Attacker';

    // Lowest levels absorb casualties first, but no single stack may lose more
    // than PER_STACK_CASUALTY_CAP of its starting size in one battle — excess
    // damage spills to the next stack instead of erasing a unit line.
    const sortedUnits = [...unitPool]
      .filter((u) => (u.quantity || 0) > 0)
      .sort(
        (a, b) =>
          a.level - b.level ||
          a.type.localeCompare(b.type) ||
          Number(a.isMercenary) - Number(b.isMercenary) ||
          (a.currentHP ?? 0) - (b.currentHP ?? 0),
      );

    for (const unit of sortedUnits) {
      if (remainingDamage <= 0) break;
      if (maxCasualties !== undefined && casualtiesCount >= maxCasualties) {
        break;
      }

      const unitInfo = UnitTypes.find(
        (u) => u.type === unit.type && u.level === unit.level,
      );
      if (!unitInfo) {
        continue;
      }

      let lossEntry = result.Losses[side].units.find(
        (u) =>
          u.type === unit.type &&
          u.level === unit.level &&
          u.isMercenary === unit.isMercenary &&
          u.forceContractId === unit.forceContractId,
      );
      const alreadyLost = lossEntry?.quantity ?? 0;

      let unitHP = unit.currentHP ?? unitInfo.hp;
      let unitsRemaining = unit.quantity || 0;
      const initialQuantity =
        sortedUnits
          .filter(
            (entry) =>
              entry.type === unit.type &&
              entry.level === unit.level &&
              entry.isMercenary === unit.isMercenary &&
              entry.forceContractId === unit.forceContractId,
          )
          .reduce((sum, entry) => sum + entry.quantity, 0) + alreadyLost;
      // Tiny stacks still bleed: the share cap never rounds below one unit,
      // otherwise a two-guard garrison would be immune to every assault.
      const stackAllowed = Math.max(
        0,
        Math.max(
          initialQuantity > 0 ? 1 : 0,
          Math.floor(
            initialQuantity * V5_COMBAT_CONSTANTS.PER_STACK_CASUALTY_CAP,
          ),
        ) - alreadyLost,
      );
      let killedFromStack = 0;

      while (
        unitsRemaining > 0 &&
        remainingDamage > 0 &&
        killedFromStack < stackAllowed &&
        (maxCasualties === undefined || casualtiesCount < maxCasualties)
      ) {
        if (unitHP <= remainingDamage) {
          remainingDamage -= unitHP;
          unitsRemaining--;
          casualtiesCount++;
          killedFromStack++;
          if (lossEntry) {
            lossEntry.quantity++;
          } else {
            lossEntry = {
              forceContractId: unit.forceContractId,
              id: unit.id ?? 0,
              userId: unit.userId ?? 0,
              type: unit.type,
              level: unit.level,
              isMercenary: unit.isMercenary ?? false,
              quantity: 1,
            };
            result.Losses[side].units.push(lossEntry);
          }
          unitHP =
            unit.forceKind === 'MERCENARY' ? unitInfo.hp * 0.8 : unitInfo.hp; // Reset HP for the next unit of the same type
        } else {
          unitHP -= remainingDamage;
          remainingDamage = 0;
        }
      }

      unit.quantity = unitsRemaining;
      unit.currentHP = unitsRemaining > 0 ? unitHP : (unitInfo.hp ?? 1);

      if (
        killedFromStack >= stackAllowed &&
        unitsRemaining > 0 &&
        remainingDamage > 0
      ) {
        hitStackCap = true;
        result.routedStacks.push({
          side,
          type: unit.type,
          level: unit.level ?? 1,
          lost: alreadyLost + killedFromStack,
          initialQuantity,
        });
      }
    }
    return {
      casualties: casualtiesCount,
      remainingDamage,
      hitCasualtyCap:
        remainingDamage > 0 &&
        maxCasualties !== undefined &&
        casualtiesCount >= maxCasualties,
      hitStackCap,
    };
  };

  // Apply attacker damage to defender units
  if (attackerDamageDealt > 0) {
    const defenderAllUnits = [
      ...(defender.units || []),
      ...(defender.mercenaries || []),
    ];
    const defenderFightingPool = defenderAllUnits.filter(
      (u) => u.type === 'DEFENSE' || (_includeOffense && u.type === 'OFFENSE'),
    );
    const defenderCollateralPool = defenderAllUnits.filter(
      (u) => u.type === 'CITIZEN' || u.type === 'WORKER',
    );

    const totals = getUnitTotals(defender);
    const totalPopulation =
      totals.citizens +
      totals.workers +
      totals.offense +
      totals.defense +
      totals.spies +
      totals.sentries;
    const fortHpPercent = clamp(fortHP / Math.max(1, initialFortHP), 0, 1);
    const populationAtStart = totalPopulation + result.Losses.Defender.total;
    const budgetDetails = budgetCasualtyCapDetailsFor({
      user: defender,
      opponent: attacker,
      population: populationAtStart,
      turns: turn,
      fortHpPercent,
      cumulativeDamageToUser: cumulativeDamageToDefender,
      cumulativeDamageByUser: cumulativeDamageToAttacker,
      alreadyLost: result.Losses.Defender.total,
      dailyAllowanceRemaining: defender.dailyCasualtyAllowanceRemaining,
      defensePressureToday: Number(defender.defensePressureToday ?? 0),
    });
    const budgetCap = budgetDetails.cap;
    // New players keep a hard per-battle ceiling instead of a damage floor:
    // attacks still visibly land, but never gut a starting army.
    const protectedCap = isDefenderProtected
      ? Math.max(
          0,
          Math.max(
            1,
            Math.floor(
              populationAtStart * V5_COMBAT_CONSTANTS.PROTECTED_LOSS_CAP_SHARE,
            ),
          ) - result.Losses.Defender.total,
        )
      : Number.POSITIVE_INFINITY;
    let defenderCapUnits = Math.min(budgetCap, protectedCap);
    // The budgets round down to zero for small lines and short assaults; a
    // won assault still lands one hit unless the daily allowance is spent.
    const dailyRemaining = defender.dailyCasualtyAllowanceRemaining;
    if (
      assaultSucceeded &&
      defenderCapUnits < 1 &&
      result.Losses.Defender.total === 0 &&
      defenderFightingPool.some((u) => (u.quantity || 0) > 0) &&
      (typeof dailyRemaining !== 'number' || dailyRemaining >= 1)
    ) {
      defenderCapUnits = 1;
    }
    const fightingPass = applyDamageToUnits(
      defenderFightingPool,
      attackerDamageDealt,
      true,
      false,
      defenderCapUnits,
    );
    const {
      casualties: fightingCasualties,
      remainingDamage: remainingAttackerDamage,
    } = fightingPass;
    totalDefenderCasualties += fightingCasualties;
    let finalPass = fightingPass;

    if (fortHP <= 0 && _includeCitz) {
      const collateralPass = applyDamageToUnits(
        defenderCollateralPool,
        remainingAttackerDamage,
        true,
        true,
        Math.max(0, defenderCapUnits - fightingCasualties),
      );
      totalDefenderCasualties += collateralPass.casualties;
      finalPass = {
        ...collateralPass,
        hitStackCap: collateralPass.hitStackCap || fightingPass.hitStackCap,
      };
    }

    recordAudit('defender', {
      rawIn: attackerDamageDealt,
      suppressed: finalPass.remainingDamage,
      binding: bindingCapFor(finalPass, {
        ...budgetDetails,
        usedCap: defenderCapUnits,
        protectedCap,
      }),
      caps: {
        singleAttackCap: budgetDetails.singleAttackCap,
        softCap: budgetDetails.softCap,
        dailyRemaining: budgetDetails.dailyRemaining,
        protectedCap: Number.isFinite(protectedCap) ? protectedCap : null,
        usedCap: defenderCapUnits,
      },
    });
  }

  // Apply defender damage to attacker units (symmetric budget protection)
  if (defenderDamageDealt > 0) {
    const attackerAllUnits = [
      ...(attacker.units || []),
      ...(attacker.mercenaries || []),
    ];
    const attackerOffensePool = attackerAllUnits.filter(
      (u) => u.type === 'OFFENSE',
    );
    const attackerPopulation =
      attackerOffensePool.reduce((sum, u) => sum + (u.quantity || 0), 0) +
      result.Losses.Attacker.total;
    const attackerBudget = budgetCasualtyCapDetailsFor({
      user: attacker,
      opponent: defender,
      population: attackerPopulation,
      turns: turn,
      fortHpPercent: 0, // no fort protection for the away army
      cumulativeDamageToUser: cumulativeDamageToAttacker,
      cumulativeDamageByUser: cumulativeDamageToDefender,
      alreadyLost: result.Losses.Attacker.total,
      defensePressureToday: 0, // the away army earns no dogpile protection
      winQualityFloor: V5_COMBAT_CONSTANTS.ATTACKER_WIN_QUALITY_FLOOR,
    });
    const attackerCapUnits = attackerBudget.cap;
    const attackerPass = applyDamageToUnits(
      attackerOffensePool,
      defenderDamageDealt,
      false,
      false,
      attackerCapUnits,
    );
    totalAttackerCasualties += attackerPass.casualties;
    recordAudit('attacker', {
      rawIn: defenderDamageDealt,
      suppressed: attackerPass.remainingDamage,
      binding: bindingCapFor(attackerPass, {
        ...attackerBudget,
        usedCap: attackerCapUnits,
        protectedCap: Number.POSITIVE_INFINITY,
      }),
      caps: {
        singleAttackCap: attackerBudget.singleAttackCap,
        softCap: attackerBudget.softCap,
        dailyRemaining: attackerBudget.dailyRemaining,
        protectedCap: null,
        usedCap: attackerCapUnits,
      },
    });
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

/** Gold value of a set of unit stacks (killed or wounded), optionally weighted. */
function unitStackGoldValue(
  entries: Array<{ type?: string; level?: number; quantity?: number }>,
): number {
  return entries.reduce((sum, entry) => {
    const cost =
      UnitTypes.find((u) => u.type === entry.type && u.level === entry.level)
        ?.cost ?? 0;
    return sum + cost * Math.max(0, Number(entry.quantity ?? 0));
  }, 0);
}

type CanonicalOutcomeReason =
  | 'DEFENSE_WIPED'
  | 'FORT_BREACHED'
  | 'ASSAULT_SUCCEEDED'
  | 'ATTACKER_REPELLED'
  | 'DEFENDER_HELD';

interface CanonicalOutcome {
  winner: 'ATTACKER' | 'DEFENDER';
  reason: CanonicalOutcomeReason;
  attackerValueLost: number;
  defenderValueLost: number;
  fortValueDamage: number;
  pillagedGoldValue: number;
  /** Gold carried home minus the attacker's killed and wounded replacement cost. */
  netGainValue: number;
  /** Defense-line headcount the attacker broke (killed + wounded). */
  defenseUnitsBroken: number;
  assaultSucceeded: boolean;
}

/** One verdict: chip damage, enemy repair costs and an initially absent fort cannot win a raid. */
function computeCanonicalOutcome(state: BattleState): CanonicalOutcome {
  const { battleResult, defender } = state;

  const woundedValue = (side: 'attacker' | 'defender') =>
    unitStackGoldValue(battleResult.wounded[side]);

  const attackerValueLost =
    unitStackGoldValue(battleResult.Losses.Attacker.units) +
    woundedValue('attacker');
  const defenderUnitsValueLost =
    unitStackGoldValue(battleResult.Losses.Defender.units) +
    woundedValue('defender');

  const fortification = getFortificationByLevel(defender.fortLevel ?? 0);
  const repairCostPerPoint = Number(fortification?.costPerRepairPoint ?? 0);
  const fortValueDamage =
    Math.max(0, state.startFortHP - state.fortHP) * repairCostPerPoint;

  const countDefenseUnits = (
    entries: Array<{ type?: string; quantity?: number }>,
  ) =>
    entries
      .filter((u) => u.type === 'DEFENSE')
      .reduce((sum, u) => sum + Math.max(0, Number(u.quantity ?? 0)), 0);
  const defenseUnitsBroken =
    countDefenseUnits(battleResult.Losses.Defender.units) +
    countDefenseUnits(battleResult.wounded.defender);
  const pillagedGoldValue = Number(state.totalPillagedGold ?? 0);
  const netGainValue = pillagedGoldValue - attackerValueLost;

  let winner: 'ATTACKER' | 'DEFENDER';
  let reason: CanonicalOutcomeReason;

  // Majority of assault turns decides the battle; ties hold for the defender.
  // Loot and wall damage already accrued per won turn, so a breach followed by
  // a collapse still costs the attacker the verdict.
  if (state.attackerOffenseRemaining <= 0) {
    winner = 'DEFENDER';
    reason = 'ATTACKER_REPELLED';
  } else if (state.assaultTurnsWon > state.assaultTurnsLost) {
    winner = 'ATTACKER';
    reason =
      state.startFortHP > 0 && state.fortHP <= 0
        ? 'FORT_BREACHED'
        : state.initialDefenseCount > 0 && state.defenderDefenseRemaining <= 0
          ? 'DEFENSE_WIPED'
          : 'ASSAULT_SUCCEEDED';
  } else {
    winner = 'DEFENDER';
    reason = 'DEFENDER_HELD';
  }

  return {
    winner,
    reason,
    attackerValueLost,
    defenderValueLost: defenderUnitsValueLost,
    fortValueDamage,
    pillagedGoldValue,
    netGainValue,
    defenseUnitsBroken,
    assaultSucceeded: state.assaultSucceeded,
  };
}

function calculateAndApplyExperience(
  result: BattleResult,
  params: {
    attacker: BattleUserLike;
    defender: BattleUserLike;
    attackTurns: number;
    fortDestroyed: boolean;
    isAttackerWinner: boolean;
    attackerScore?: number;
    defenderScore?: number;
  },
): void {
  const { attacker, defender, attackTurns, fortDestroyed } = params;

  const levelDifference = (defender.level ?? 0) - (attacker.level ?? 0);
  const winRatio =
    (params.attackerScore ?? 0) / Math.max(1, params.defenderScore ?? 1);

  const { attackerXP, defenderXP } = calculateBattleExperience(
    params.isAttackerWinner,
    levelDifference,
    attackTurns,
    fortDestroyed,
    winRatio,
    attacker.stamina ?? 100,
    attacker.level ?? 1,
  );

  result.experienceGained = {
    attacker: attackerXP,
    defender: defenderXP,
  };
}
function finalizeBattleResult(state: BattleState): void {
  const {
    attacker,
    defender,
    totalTurns,
    fortHP,
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
  // Split cumulative losses into killed vs wounded. Wounded units already
  // left the active rosters during the battle; they flow into the recovering
  // wounded_units pool and return to duty via daily healing.
  const splitWounded = (
    side: 'Attacker' | 'Defender',
  ): Array<{
    type: string;
    level: number;
    quantity: number;
    forceContractId?: number;
    isMercenary: boolean;
  }> => {
    const wounded: Array<{
      type: string;
      level: number;
      quantity: number;
      forceContractId?: number;
      isMercenary: boolean;
    }> = [];
    for (const entry of battleResult.Losses[side].units) {
      const woundedQty = Math.floor(
        entry.quantity * V5_COMBAT_CONSTANTS.WOUNDED_SHARE,
      );
      if (woundedQty <= 0) continue;
      entry.quantity -= woundedQty;
      battleResult.Losses[side].total -= woundedQty;
      wounded.push({
        forceContractId: entry.forceContractId,
        type: entry.type,
        level: entry.level ?? 1,
        quantity: woundedQty,
        isMercenary: !!entry.isMercenary,
      });
    }
    return wounded;
  };
  battleResult.wounded = {
    attacker: splitWounded('Attacker'),
    defender: splitWounded('Defender'),
  };

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
    wounded: battleResult.wounded,
    routedStacks: battleResult.routedStacks,
  };

  // One canonical outcome: result, XP, pillage eligibility, and logs all
  // derive from this single decision.
  const canonical = computeCanonicalOutcome(state);
  battleResult.canonicalOutcome = canonical;
  battleResult.result = canonical.winner === 'ATTACKER' ? 'WIN' : 'LOSS';

  calculateAndApplyExperience(battleResult, {
    attacker,
    defender,
    attackTurns: totalTurns,
    fortDestroyed: startFortHP > 0 && fortHP <= 0,
    isAttackerWinner: canonical.winner === 'ATTACKER',
    attackerScore: state.initialAttackerScore,
    defenderScore: state.initialDefenderScore,
  });
}

/** Build battle army state. */
export function buildBattleArmyState(
  user: BattleUserLike,
  usage: 'OFFENSE' | 'DEFENSE',
): BattleArmyState {
  return {
    formations: buildCombatFormations(user, usage),
    collateral: [
      ...buildCombatFormations(user, 'CITIZEN'),
      ...buildCombatFormations(user, 'WORKER'),
    ],
  };
}

/** Calculates army strength from formations used by combat, economy, or presentation logic. */
export function calculateArmyStrengthFromFormations(
  army: BattleArmyState,
  roleFilter?: CombatRole,
): FormationStrength {
  const result: FormationStrength = {
    meleeAtkPower: 0,
    meleeDefPower: 0,
    rangedAtkPower: 0,
    rangedDefPower: 0,
  };
  for (const f of army.formations) {
    if (roleFilter && f.combatRole !== roleFilter) continue;
    result.meleeAtkPower += f.perUnitStats.MeleeAtkPower * f.quantity;
    result.meleeDefPower += f.perUnitStats.MeleeDefPower * f.quantity;
    result.rangedAtkPower += f.perUnitStats.RangedAtkPower * f.quantity;
    result.rangedDefPower += f.perUnitStats.RangedDefPower * f.quantity;
  }
  return result;
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
  turns: number = V5_COMBAT_CONSTANTS.MAX_ATTACK_TURNS,
  isDefenderProtected: boolean = (defender.level ?? 0) <= 9,
  options?: SimulationOptions,
): Promise<BattleResult> {
  const initialFortHP = Number.isFinite(defender.fortHitpoints)
    ? Math.max(0, Number(defender.fortHitpoints))
    : getFortificationByLevel(defender.fortLevel).hitpoints;
  return simulateBattle(
    attacker,
    defender,
    initialFortHP,
    turns,
    false,
    isDefenderProtected,
    options,
  );
}
