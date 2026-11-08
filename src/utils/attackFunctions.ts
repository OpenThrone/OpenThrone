import {
  attackerStaminaMultiplier,
  attackerStaminaPercent,
} from '@/constants/ArmyStamina';
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

import type { BattleTuning, CombatRuleset } from './balance/combatRuleset';
import { CURRENT_COMBAT_RULESET } from './balance/combatRulesets';
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
} from './balance/v5Combat';
import {
  allocateWoundedByType,
  shadowWoundedByType,
  SpreadRoster,
} from './casualtySpread';
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

function getFortificationByLevel(
  level: number | undefined | null,
  ruleset: CombatRuleset,
) {
  const forts = ruleset.fortifications;
  if (typeof level !== 'number') return forts[0]!;
  return forts.find((f) => f.level === level) ?? forts[level] ?? forts[0]!;
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
  ruleset: CombatRuleset,
): number {
  if (!Array.isArray(structureUpgrades)) return 0;
  const armoryLevel =
    structureUpgrades.find((u) => u?.type === 'ARMORY')?.level ?? 1;
  const upgrade = ruleset.armoryUpgrades.find((u) => u.level === armoryLevel);
  return Number(upgrade?.casualtyMitigationPercentage ?? 0) || 0;
}

function calculateFortMitigation(params: {
  defenderFortLevel: number | undefined;
  defenderCasualtyBonusPct: number | undefined;
  defenderStructureMitigationPct: number | undefined;
  fortHpRatio: number;
  ruleset: CombatRuleset;
}) {
  const fortification = getFortificationByLevel(
    params.defenderFortLevel ?? 0,
    params.ruleset,
  );
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
  attackerStaminaMultiplier: number;
  ruleset: CombatRuleset;
  /**
   * Casualty spread (combat-v10): the battle is fought on shadow rosters that
   * run lowest-first, and each side's dead are charged to the real rosters in
   * proportion to headcount. Absent under rulesets without the switch.
   */
  spread?: { attacker: SpreadRoster; defender: SpreadRoster };
  /** Wounded counts the lowest-first engine would have produced, per side and unit type. */
  spreadWounded?: {
    Attacker: Map<string, number>;
    Defender: Map<string, number>;
  };
}

/** Defines the simulation options shape used by related workflows. */
export type SimulationOptions = {
  random: RandomFn;
  /** Rules the battle is fought under; defaults to the current combat ruleset. */
  ruleset?: CombatRuleset;
  staminaPenaltyThreshold?: number;
  staminaMinMultiplier?: number;
  /** Remaining daily casualty allowance for the defender across all attackers. */
  defenderDailyCasualtyRemaining?: number;
  /** Remaining daily gold all attackers may take from this defender. */
  defenderDailyGoldRemaining?: bigint;
};

/** Defines the battle constants shape used by related workflows. */
export type BattleConstants = BattleTuning;

/** Returns the live game's battle constants (the current ruleset's tuning). */
export function getDefaultBattleConstants(): BattleConstants {
  return { ...CURRENT_COMBAT_RULESET.battle };
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
  const ruleset = options?.ruleset ?? CURRENT_COMBAT_RULESET;
  const committedTurns = Math.floor(
    clamp(totalTurns, 1, ruleset.battle.MAX_TURNS),
  );
  const state = initializeBattleState(
    attacker,
    defender,
    initialFortHP,
    isDefenderProtected,
    random,
    ruleset,
    options?.staminaPenaltyThreshold,
    options?.staminaMinMultiplier,
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
  try {
    for (let turn = 1; turn <= committedTurns; turn++) {
      await executeBattleTurn(state, turn);

      if (shouldBattleEndEarly(state)) break;
    }

    finalizeBattleResult(state);
  } finally {
    // Hand the real rosters back even if a turn threw.
    state.spread?.attacker.restore(state.attacker);
    state.spread?.defender.restore(state.defender);
  }
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
  ruleset: CombatRuleset,
  staminaThreshold?: number,
  staminaMinimum?: number,
) {
  const battleResult = new BattleResult(attacker, defender);
  const attackerStrength = calculateStrength(
    attacker,
    'OFFENSE',
    false,
    false,
    ruleset,
  );
  const defenderStrength = calculateStrength(
    defender,
    'DEFENSE',
    false,
    false,
    ruleset,
  );
  // Garrison fatigue (#204) is fixed for the whole battle: pressure taken from
  // earlier attackers today tires the wall, and the applied percent travels
  // with the result so reports can show "Garrison fatigue: -X%".
  const fatigueMultiplier = defenderFatigueMultiplier(
    Number(defender.defensePressureToday ?? 0),
    ruleset.defenderFatigue,
  );
  battleResult.defenderFatiguePercent = defenderFatiguePercent(
    Number(defender.defensePressureToday ?? 0),
    ruleset.defenderFatigue,
  );
  const armyMultiplier = attackerStaminaMultiplier(
    attacker.stamina ?? 100,
    staminaThreshold,
    staminaMinimum,
  );
  battleResult.attackerFatiguePercent = attackerStaminaPercent(
    attacker.stamina ?? 100,
    staminaThreshold,
    staminaMinimum,
  );
  const fortification = getFortificationByLevel(
    defender.fortLevel ?? 0,
    ruleset,
  );
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
      const unitInfo = ruleset.units.find(
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

  // Casualty spread: fight on shadow rows (cloned after their HP is set) and
  // keep the caller's rows as the real roster the dead are charged to.
  let spread: BattleState['spread'];
  if (ruleset.casualtySpread) {
    spread = {
      attacker: new SpreadRoster(
        attacker.units,
        attacker.mercenaries,
        ruleset.constants,
      ),
      defender: new SpreadRoster(
        defender.units,
        defender.mercenaries,
        ruleset.constants,
      ),
    };
    attacker.units = spread.attacker.shadowUnits;
    attacker.mercenaries = spread.attacker.shadowMercenaries;
    defender.units = spread.defender.shadowUnits;
    defender.mercenaries = spread.defender.shadowMercenaries;
  }

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
      ruleset,
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
    attackerStaminaMultiplier: armyMultiplier,
    ruleset,
    spread,
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
  const { ruleset } = state;
  const { constants } = ruleset;
  const { battle } = ruleset;
  state.totalTurns = turn;
  state.defender.dailyCasualtyAllowanceRemaining =
    state.defenderDailyCasualtyRemaining;
  const fatigue = calculateCombatFatigue(turn);
  const attackerArmy = buildBattleArmyState(state.attacker, 'OFFENSE', ruleset);
  const attackerStrength = calculateArmyStrengthFromFormations(attackerArmy);
  // Gear decides breakthroughs; chip on a defense that holds comes from the
  // troops alone (#202, behind CHIP_FROM_TROOPS_ONLY).
  let troopChipScale = 1;
  if (constants.CHIP_FROM_TROOPS_ONLY) {
    let troops = 0;
    for (const f of attackerArmy.formations)
      troops +=
        (f.troopStats.MeleeAtkPower + f.troopStats.RangedAtkPower) * f.quantity;
    const total =
      attackerStrength.meleeAtkPower + attackerStrength.rangedAtkPower;
    troopChipScale = total > 0 ? troops / total : 1;
  }
  const includeCitz = state.defenderDefenseRemaining === 0 || state.fortHP <= 0;
  const includeOffense =
    state.fortHP <= 0 && state.defenderDefenseRemaining === 0;
  const defenderStrength = calculateStrength(
    state.defender,
    'DEFENSE',
    includeCitz,
    includeOffense,
    ruleset,
  ).totalStats;
  state.attackerMeleeAtkPower =
    attackerStrength.meleeAtkPower * fatigue * state.attackerStaminaMultiplier;
  state.attackerMeleeDefPower = attackerStrength.meleeDefPower * fatigue;
  state.attackerRangedAtkPower =
    attackerStrength.rangedAtkPower * fatigue * state.attackerStaminaMultiplier;
  state.attackerRangedDefPower = attackerStrength.rangedDefPower * fatigue;
  state.defenderMeleeAtkPower = defenderStrength.MeleeAtkPower;
  state.defenderMeleeDefPower = defenderStrength.MeleeDefPower;
  state.defenderRangedAtkPower = defenderStrength.RangedAtkPower;
  state.defenderRangedDefPower = defenderStrength.RangedDefPower;

  const attackerPhase = turn % 2 === 1;
  const source = attackerPhase ? 'ATTACKER' : 'DEFENDER';
  const multiplier = attackerPhase
    ? battle.ATTACKER_DAMAGE_MULTIPLIER
    : battle.DEFENDER_COUNTER_DAMAGE_MULTIPLIER;
  // One variance roll per channel per turn; the walls and the same-turn
  // ranged counter share them so replays and seeds stay stable.
  const meleeVariance = mtRand(
    battle.DAMAGE_VARIANCE_MIN,
    battle.DAMAGE_VARIANCE_MAX,
    state.random,
  );
  const rangedVariance = mtRand(
    battle.DAMAGE_VARIANCE_MIN,
    battle.DAMAGE_VARIANCE_MAX,
    state.random,
  );
  const meleeAttack =
    (attackerPhase
      ? attackerStrength.meleeAtkPower * fatigue
      : state.defenderMeleeAtkPower) *
    multiplier *
    meleeVariance;
  const rangedAttack =
    (attackerPhase
      ? attackerStrength.rangedAtkPower * fatigue
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
        ? rangedDefense * constants.RANGED_DEFENSE_ASSAULT_WEIGHT
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
    attackPressure * state.attackerStaminaMultiplier > contestDefensePressure &&
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
    const fortification = getFortificationByLevel(
      state.defender.fortLevel,
      ruleset,
    );
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
        1,
        ruleset,
      ) *
      calculateUnderDefendedMultipliers(coverage, ruleset).fortDamageMultiplier;
    const battleCap = maxFortHP * constants.FORT_DAMAGE.PER_BATTLE_CAP_SHARE;
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
            // Only an assault that fails keeps its chip to the troops' share.
            chipScale: assaultSucceeded ? 1 : troopChipScale,
            defenderFortLevel: state.defender.fortLevel,
            defenderCasualtyBonusPct: getUserCasualtyBonusPercent(
              state.defender,
            ),
            defenderStructureUpgrades: state.defender.structure_upgrades,
            ruleset,
          }
        : { ruleset },
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
      battle.DEFENDER_COUNTER_DAMAGE_MULTIPLIER *
      (1 + constants.RANGED_COUNTER_FORT_BONUS * fortHpRatio) *
      rangedVariance;
    const counter = newComputeCasualties(
      counterAttack,
      state.attackerRangedDefPower,
      0,
      0,
      maxFortHP,
      counterAttack / Math.max(1, state.attackerRangedDefPower),
      undefined,
      false,
      false,
      false,
      { ruleset },
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
    ruleset,
  });
  state.spread?.attacker.project(state.battleResult.Losses.Attacker.units);
  state.spread?.defender.project(state.battleResult.Losses.Defender.units);

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
        attackPressure: attackPressure * state.attackerStaminaMultiplier,
        // The loot check rides the SAME fatigued contest value that decided
        // the assault: a breach that happened only because the garrison was
        // tired still yields loot instead of an empty "success".
        defensePressure: contestDefensePressure,
        fortHpPercent,
        isDefenderProtected: state.isDefenderProtected,
        coveredTurns,
        ruleset,
      },
    );
    const dynamicBudget = calculatePillageBudget(
      state.initialDefenderGold,
      fortHpPercent,
      state.isDefenderProtected,
      state.defender.level ?? 1,
      ruleset,
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
  ruleset: CombatRuleset = CURRENT_COMBAT_RULESET,
): number {
  const safeMax = Math.max(0, Number(maxFortHP) || 0);
  if (safeMax <= 0) return 0;
  const wall =
    Math.max(0, Number(defensePressure) || 0) +
    Math.max(0, Number(fortificationDefensePower) || 0);
  const ratio = Math.max(0, Number(attackPressure) || 0) / Math.max(1, wall);
  const share = calculateFortDamageShare(ratio, ruleset);
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
  ruleset: CombatRuleset = CURRENT_COMBAT_RULESET,
): { attackerXP: number; defenderXP: number } {
  const maxTurns = ruleset.battle.MAX_TURNS;
  const turns = clamp(attackTurns, 1, maxTurns);
  const safeAttackerLevel = Math.max(1, Math.floor(Number(attackerLevel) || 1));
  const xpPerTurn = calculateProgressionXpPerTurn(safeAttackerLevel, ruleset);
  const commitmentEfficiency = calculateTurnCommitmentXpEfficiency(
    turns,
    maxTurns,
  );
  const xpLevelModifier = clamp(1 + levelDifference * 0.08, 0.35, 1.45);
  const closeness = clamp(calculateBattleCloseness(winRatio), 0.75, 1.18);
  const moraleFactor = calculateMoraleXpFactor(attackerMorale, turns, ruleset);
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

/**
 * Battle XP per committed turn at an attacker level, before other factors.
 * It tapers gently: 73% of the XP to level 100 lies above level 50, and turns
 * (48 a day) cap how fast anyone can earn it, so a steep taper put level 100
 * out of reach. Admin balance-sim runs put the fastest players at about
 * 30-34 months and full-time players at about 4 years.
 */
export function calculateProgressionXpPerTurn(
  level: number,
  ruleset: CombatRuleset = CURRENT_COMBAT_RULESET,
): number {
  const { bands, beyond } = ruleset.xpPerTurn;
  return bands.find((band) => level <= band.upToLevel)?.xp ?? beyond;
}

function calculateTurnCommitmentXpEfficiency(
  turns: number,
  maxTurns: number,
): number {
  const normalizedTurns = clamp(turns, 1, maxTurns) / maxTurns;
  return clamp(0.22 + 0.78 * normalizedTurns ** 0.85, 0.25, 1);
}

export function calculateStrength(
  user: BattleUserLike,
  unitType: 'OFFENSE' | 'DEFENSE',
  includeCitz = false,
  includeOffense = false,
  ruleset: CombatRuleset = CURRENT_COMBAT_RULESET,
): DetailedCalculatedStrength {
  const result = calculateCombatStrength(user, unitType, { ruleset });
  const bonus =
    unitType === 'OFFENSE' ? (user.attackBonus ?? 0) : (user.defenseBonus ?? 0);
  const race = getRaceIdentity(user.race, ruleset.race);
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
    const strength = calculateCombatStrength(user, type, {
      multiplier: 1,
      ruleset,
    });
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

function calculateDefenderLevelFactor(
  defenderLevel: number,
  ruleset: CombatRuleset,
): number {
  if (defenderLevel >= 20) return 1; // Full loot potential at higher levels

  if (defenderLevel < 10) {
    // Protected levels pay a flat share of the exposed gold
    return ruleset.constants.PROTECTED_LEVEL_LOOT_FACTOR;
  }

  // Scale between 70% at level 10 and 100% at level 20
  return 0.7 + (defenderLevel - 10) * ((1 - 0.7) / 10);
}

/**
 * Loot-cap multiplier on a protected defender's shielded gold. Tapers linearly
 * with level: 0.1 at level 1 up to 1.0 at level 10 (0.1 + 0.9 * (level - 1) / 9).
 */
export function getProtectedLootMultiplier(
  level = 1,
  ruleset: CombatRuleset = CURRENT_COMBAT_RULESET,
): number {
  const { constants } = ruleset;
  const start = constants.PROTECTED_LOOT_MULTIPLIER;
  const end = constants.PROTECTED_LOOT_MULTIPLIER_MAX;
  const span = constants.PROTECTION_TAPER_END_LEVEL - 1;
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
  ruleset: CombatRuleset = CURRENT_COMBAT_RULESET,
): number {
  const fortHp = clamp(fortHpPercent, 0, 1);
  const floorShare = ruleset.constants.FORT_LOOT_CAP_FLOOR_SHARE;
  const share =
    ruleset.battle.MAX_PILLAGE_SHARE_PER_ATTACK *
    (floorShare + (1 - floorShare) * (1 - fortHp));
  return isDefenderProtected
    ? share * getProtectedLootMultiplier(defenderLevel, ruleset)
    : share;
}

/**
 * Splits a treasury into the part a protected defender's shield covers and the
 * part raiders see at the normal rate. Unprotected defenders have no shield.
 */
function splitProtectedGold(
  gold: bigint,
  isDefenderProtected: boolean,
  ruleset: CombatRuleset,
): { shielded: bigint; exposed: bigint } {
  if (gold <= 0n) return { shielded: 0n, exposed: 0n };
  if (!isDefenderProtected) return { shielded: 0n, exposed: gold };
  const allowance = BigInt(ruleset.constants.PROTECTED_GOLD_ALLOWANCE);
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
  ruleset: CombatRuleset = CURRENT_COMBAT_RULESET,
): bigint {
  const { shielded, exposed } = splitProtectedGold(
    gold,
    isDefenderProtected,
    ruleset,
  );
  return (
    bigintShare(
      shielded,
      calculateFortAdjustedPillageCapShare(
        fortHpPercent,
        true,
        defenderLevel,
        ruleset,
      ),
    ) +
    bigintShare(
      exposed,
      calculateFortAdjustedPillageCapShare(fortHpPercent, false, 1, ruleset),
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
  /** Rules the raid is fought under; defaults to the current combat ruleset. */
  ruleset?: CombatRuleset;
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
  const ruleset = raid.ruleset ?? CURRENT_COMBAT_RULESET;
  const maxTurns = ruleset.battle.MAX_TURNS;
  const safeTurns = clamp(turns, 1, maxTurns);
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
  const underDefended = calculateUnderDefendedMultipliers(
    defenseCoverage,
    ruleset,
  );
  const defenderLevelFactor = calculateDefenderLevelFactor(
    defender.level ?? 0,
    ruleset,
  );
  // Linear in commitment: the fort-adjusted cap is earned over MAX_TURNS, and
  // a won assault turn takes the slice its covered turns represent.
  const coveredTurns = clamp(raid.coveredTurns ?? safeTurns, 1, maxTurns);
  const sharedFactor =
    (coveredTurns / maxTurns) *
    calculateGoldLevelModifier(levelDifference) *
    underDefended.rewardMultiplier *
    getRaceIdentity(attacker.race, ruleset.race).goldPillageMultiplier *
    uniformFactor;
  const { shielded, exposed } = splitProtectedGold(
    defender.gold ?? 0n,
    raid.isDefenderProtected === true,
    ruleset,
  );
  const shieldedCap = calculateFortAdjustedPillageCapShare(
    fortHpPercent,
    true,
    defender.level ?? 1,
    ruleset,
  );
  const exposedCap = calculateFortAdjustedPillageCapShare(
    fortHpPercent,
    false,
    1,
    ruleset,
  );
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
  chipScale = 1,
  constants: CombatRuleset['constants'] = CURRENT_COMBAT_RULESET.constants,
): number {
  const safeAttackPower = Math.max(0, Number(attackPower) || 0);
  const safeDefensePower = Math.max(0, Number(defensePower) || 0);

  if (safeAttackPower <= 0) return 0;

  const subtractiveDamage = Math.max(0, safeAttackPower - safeDefensePower);
  const { CHIP_TAPER_START_RATIO: start, CHIP_TAPER_FULL_RATIO: full } =
    constants;
  const chipShare = taperChip
    ? clamp(
        (safeAttackPower / Math.max(1e-9, safeDefensePower) - start) /
          (full - start),
        0,
        1,
      )
    : 1;
  const chipDamage =
    safeAttackPower * minimumDamageRatio * chipShare * clamp(chipScale, 0, 1);

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
    /** Share of the attack that comes from troops, not gear (chip only). */
    chipScale?: number;
    /** Rules the damage is computed under; defaults to the current combat ruleset. */
    ruleset?: CombatRuleset;
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
  const ruleset = options?.ruleset ?? CURRENT_COMBAT_RULESET;
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
    options?.chipScale ?? 1,
    ruleset.constants,
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
      ruleset,
    );
    const fortMitigation = calculateFortMitigation({
      defenderFortLevel,
      defenderCasualtyBonusPct: options?.defenderCasualtyBonusPct,
      defenderStructureMitigationPct: structureMitigationPct,
      fortHpRatio,
      ruleset,
    });
    mitigationMultiplier = fortMitigation.mitigationMultiplier;
    mitigation = { ...fortMitigation, fortHpRatio };
    damageDealt *= mitigationMultiplier;
  }

  if (isDefenderProtected === true) {
    damageDealt *= ruleset.constants.PROTECTED_DAMAGE_MULTIPLIER;
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
  /** Rules the casualties fall under; defaults to the current combat ruleset. */
  ruleset?: CombatRuleset;
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
    ruleset = CURRENT_COMBAT_RULESET,
  } = params;
  const { constants } = ruleset;

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
      ruleset.houseUpgrades[Math.max(0, Number(params.user.houseLevel ?? 0))] ??
      ruleset.houseUpgrades[0];
    const dailyThroughput = calculateDailyReplacementThroughput(
      {
        houseCitizens: Number(houseUpgrade?.citizensDaily ?? 1),
        race: params.user.race,
      },
      ruleset,
    );
    const budget = calculateCasualtyBudget(
      {
        dailyThroughput,
        population: params.population,
        turns: clamp(params.turns, 1, ruleset.battle.MAX_TURNS),
        levelDifference:
          (params.opponent.level ?? 0) - (params.user.level ?? 0),
        winQuality:
          params.cumulativeDamageToUser /
          Math.max(1, params.cumulativeDamageByUser),
        winQualityFloor: params.winQualityFloor,
        fortHpPercent: params.fortHpPercent,
        defensePressureToday: params.defensePressureToday,
      },
      ruleset,
    );
    const singleAttackCap = Math.floor(
      params.population * constants.SINGLE_ATTACK_POPULATION_LOSS_CAP,
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
    // damage spills to the next stack instead of erasing a unit line. Within a
    // type and level, hired mercenaries take the front line: they absorb a
    // share of the damage weighted by MERC_LOSS_WEIGHT over their headcount,
    // so a player's own troops are spared first.
    const sortedUnits = [...unitPool]
      .filter((u) => (u.quantity || 0) > 0)
      .sort(
        (a, b) =>
          a.level - b.level ||
          a.type.localeCompare(b.type) ||
          Number(!!b.isMercenary) - Number(!!a.isMercenary) ||
          (a.currentHP ?? 0) - (b.currentHP ?? 0),
      );

    const drainStack = (
      unit: BattleUnits,
      budget: number,
      reportRout: boolean,
    ) => {
      if (remainingDamage <= 0) return;
      if (maxCasualties !== undefined && casualtiesCount >= maxCasualties) {
        return;
      }
      // A weighted mercenary share may cap the damage this stack can absorb.
      let stackDamage = Math.min(remainingDamage, budget);

      const unitInfo = ruleset.units.find(
        (u) => u.type === unit.type && u.level === unit.level,
      );
      if (!unitInfo) return;

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
          Math.floor(initialQuantity * constants.PER_STACK_CASUALTY_CAP),
        ) - alreadyLost,
      );
      let killedFromStack = 0;

      while (
        unitsRemaining > 0 &&
        stackDamage > 0 &&
        killedFromStack < stackAllowed &&
        (maxCasualties === undefined || casualtiesCount < maxCasualties)
      ) {
        if (unitHP <= stackDamage) {
          stackDamage -= unitHP;
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
          unitHP -= stackDamage;
          remainingDamage -= stackDamage;
          stackDamage = 0;
        }
      }

      unit.quantity = unitsRemaining;
      unit.currentHP = unitsRemaining > 0 ? unitHP : (unitInfo.hp ?? 1);

      if (
        reportRout &&
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
    };

    // Walk one type/level line at a time, lowest level first. Within a line
    // the mercenary share and headcounts are fixed when the line is reached,
    // and any damage left after the regulars hit their stack cap spills to the
    // line's held-back mercenaries before the next line is touched.
    const lineKey = (u: BattleUnits) => `${u.level}:${u.type}`;
    const lines: BattleUnits[][] = [];
    for (const unit of sortedUnits) {
      const last = lines[lines.length - 1];
      if (last && lineKey(last[0]!) === lineKey(unit)) last.push(unit);
      else lines.push([unit]);
    }
    for (const line of lines) {
      if (remainingDamage <= 0) break;
      if (maxCasualties !== undefined && casualtiesCount >= maxCasualties)
        break;
      const mercStacks = line.filter((u) => u.isMercenary);
      const mercs = mercStacks.reduce((n, u) => n + u.quantity, 0);
      const regulars = line
        .filter((u) => !u.isMercenary)
        .reduce((n, u) => n + u.quantity, 0);
      if (!mercs || !regulars) {
        for (const unit of line) drainStack(unit, Infinity, true);
        continue;
      }
      const weight = constants.MERC_LOSS_WEIGHT;
      const lineBudget =
        (remainingDamage * weight * mercs) / (weight * mercs + regulars);
      const shares = new Map(
        mercStacks.map((u) => [u, (lineBudget * u.quantity) / mercs]),
      );
      // Contracts whose share cannot fell one of their troops pool those
      // shares, so a tiny contract does not cancel the split for the line.
      const hpOf = (u: BattleUnits) =>
        u.currentHP ??
        ruleset.units.find((t) => t.type === u.type && t.level === u.level)
          ?.hp ??
        1;
      const small = new Set(
        mercStacks.filter((u) => (shares.get(u) ?? 0) < hpOf(u)),
      );
      let pool = [...small].reduce((n, u) => n + (shares.get(u) ?? 0), 0);
      const firstRegular = line.find((u) => !u.isMercenary);
      const killsSomeone =
        mercStacks.some((u) => !small.has(u)) ||
        [...small].some((u) => pool >= hpOf(u)) ||
        (firstRegular !== undefined &&
          remainingDamage - lineBudget >= hpOf(firstRegular));
      // A split that would leave only wounds lands on the front line whole,
      // so a won assault still fells one unit.
      if (!killsSomeone) {
        for (const unit of line) drainStack(unit, Infinity, true);
        continue;
      }
      for (const unit of line) {
        if (small.has(unit)) {
          const before = remainingDamage;
          drainStack(unit, pool, false);
          pool -= before - remainingDamage;
        } else {
          drainStack(unit, shares.get(unit) ?? Infinity, !unit.isMercenary);
        }
      }
      for (const unit of mercStacks)
        if (unit.quantity > 0) drainStack(unit, Infinity, true);
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
            Math.floor(populationAtStart * constants.PROTECTED_LOSS_CAP_SHARE),
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
      winQualityFloor: constants.ATTACKER_WIN_QUALITY_FLOOR,
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
  ruleset: CombatRuleset,
): number {
  return entries.reduce((sum, entry) => {
    const cost =
      ruleset.units.find(
        (u) => u.type === entry.type && u.level === entry.level,
      )?.cost ?? 0;
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
  const { battleResult, defender, ruleset } = state;

  const woundedValue = (side: 'attacker' | 'defender') =>
    unitStackGoldValue(battleResult.wounded[side], ruleset);

  const attackerValueLost =
    unitStackGoldValue(battleResult.Losses.Attacker.units, ruleset) +
    woundedValue('attacker');
  const defenderUnitsValueLost =
    unitStackGoldValue(battleResult.Losses.Defender.units, ruleset) +
    woundedValue('defender');

  const fortification = getFortificationByLevel(
    defender.fortLevel ?? 0,
    ruleset,
  );
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
    ruleset: CombatRuleset;
  },
): void {
  const { attacker, defender, attackTurns, fortDestroyed, ruleset } = params;

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
    ruleset,
  );

  result.experienceGained = {
    attacker: attackerXP,
    defender: defenderXP,
  };
}
/**
 * Swaps the shadow's loss ledger for the real one once the battle is fought:
 * the dead are the real stacks' (spread by headcount), the totals, the wounded
 * count and the routed-stack flags are the shadow's.
 */
function chargeSpreadLosses(state: BattleState): void {
  const { spread, battleResult } = state;
  if (!spread) return;
  const share = state.ruleset.constants.WOUNDED_SHARE;
  const wounded = {
    Attacker: new Map<string, number>(),
    Defender: new Map<string, number>(),
  };
  const routed: BattleResult['routedStacks'] = [];
  for (const side of ['Attacker', 'Defender'] as const) {
    const roster = spread[side === 'Attacker' ? 'attacker' : 'defender'];
    const shadow = battleResult.Losses[side].units;
    wounded[side] = shadowWoundedByType(shadow, share);
    const routedTypes = new Set(
      battleResult.routedStacks
        .filter((r) => r.side === side)
        .map((r) => r.type),
    );
    battleResult.Losses[side].units = roster.realLosses();
    for (const stack of roster.cappedStacks(routedTypes))
      routed.push({ side, ...stack, level: stack.level });
  }
  state.spreadWounded = wounded;
  battleResult.routedStacks = routed;
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
  if (state.spread) chargeSpreadLosses(state);
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
    const entries = battleResult.Losses[side].units;
    // Under the spread the wounded count of each unit type is the
    // lowest-first engine's, taken across that type's real stacks in
    // proportion to their losses.
    const spreadShares = state.spreadWounded
      ? allocateWoundedByType(entries, state.spreadWounded[side])
      : undefined;
    for (let index = 0; index < entries.length; index++) {
      const entry = entries[index];
      if (!entry) continue;
      const woundedQty =
        spreadShares?.[index] ??
        Math.floor(entry.quantity * state.ruleset.constants.WOUNDED_SHARE);
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
    ruleset: state.ruleset,
  });
}

/** Build battle army state. */
export function buildBattleArmyState(
  user: BattleUserLike,
  usage: 'OFFENSE' | 'DEFENSE',
  ruleset: CombatRuleset = CURRENT_COMBAT_RULESET,
): BattleArmyState {
  return {
    formations: buildCombatFormations(user, usage, { ruleset }),
    collateral: [
      ...buildCombatFormations(user, 'CITIZEN', { ruleset }),
      ...buildCombatFormations(user, 'WORKER', { ruleset }),
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
  turns: number = CURRENT_COMBAT_RULESET.constants.MAX_ATTACK_TURNS,
  isDefenderProtected: boolean = (defender.level ?? 0) <= 9,
  options?: SimulationOptions,
): Promise<BattleResult> {
  const initialFortHP = Number.isFinite(defender.fortHitpoints)
    ? Math.max(0, Number(defender.fortHitpoints))
    : getFortificationByLevel(
        defender.fortLevel,
        options?.ruleset ?? CURRENT_COMBAT_RULESET,
      ).hitpoints;
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
