import {
  calculateRepairCost,
  calculateTotalUnitCost,
  calculateUpgradeCost,
} from './economy';
import { getSpyMissionLimits } from './population';
import {
  evaluateTargets,
  selectAttackStrategy,
  shouldSendIntel,
} from './targeting';
import { AgentDecision, PlayerState, TargetEvaluation } from './types';

const MAX_ATTACK_TURNS = 10;

export function makeDailyDecisions(
  player: PlayerState,
  population: PlayerState[],
  options: {
    attackLevelRange?: number;
    currentDay?: number;
    random?: () => number;
  } = {},
): AgentDecision {
  const random = options.random ?? Math.random;
  const decision: AgentDecision = {
    intelMissions: [],
    attacks: [],
    recruitment: {},
  };

  if (player.status !== 'active') {
    return decision;
  }

  if (!shouldActThisTick(player, random)) {
    return decision;
  }

  const availableAttackTurns = Math.max(
    0,
    Math.min(player.attackTurns, player.stamina),
  );
  const burstBudget = decideBurstTurnBudget(player, availableAttackTurns);
  if (burstBudget <= 0 && player.gold < 250000 && player.units.citizen < 150) {
    return decision;
  }

  const targets = evaluateTargets(
    player,
    population,
    player.intelCache,
    options.attackLevelRange,
    options.currentDay,
  );

  const intelLimit = getSpyMissionLimits(player.spyLevel);
  let plannedIntel = 0;
  const maxIntelPerDay = Math.min(
    intelLimit.maxPerDay,
    Math.max(1, intelLimit.maxPerUser * 3),
  );

  const intelCandidates = targets
    .filter((target) => target.shouldScout)
    .slice(0, Math.max(2, Math.min(6, Math.ceil(maxIntelPerDay / 2))));

  for (const target of player.units.spy > 0 ? intelCandidates : []) {
    if (player.dailyLimits.intelUsed + plannedIntel >= maxIntelPerDay) break;

    if (shouldSendIntel(player, target, player.intelCache, random)) {
      decision.intelMissions.push({
        target: target.playerId,
        spyCount: Math.max(1, Math.min(Math.floor(player.units.spy), 25)),
      });
      plannedIntel++;
    }
  }

  const processedIntel = processIntelResults(player, targets);

  const attackLimit = Math.max(0, Math.ceil(burstBudget / 3));
  let plannedAttacks = 0;
  let plannedTurnSpend = 0;

  for (const target of processedIntel.slice(0, 10)) {
    if (plannedAttacks >= attackLimit) break;

    const strategy = selectAttackStrategy(target, player.behavior.turnStrategy);

    if (strategy.shouldAttack) {
      const followUpPlan = buildAttackPlan(
        target,
        strategy.turns,
        attackLimit - plannedAttacks,
      );
      for (const plannedAttack of followUpPlan) {
        if (plannedTurnSpend + plannedAttack.turns > burstBudget) {
          break;
        }
        decision.attacks.push(plannedAttack);
        plannedAttacks++;
        plannedTurnSpend += plannedAttack.turns;
        if (plannedAttacks >= attackLimit) break;
      }
    }
  }

  const availableGold = player.gold;

  decision.recruitment = decideRecruitment(player, availableGold);

  const upgradeCosts = calculateUpgradePriorities(player, availableGold);
  if (upgradeCosts.spy) {
    decision.upgradeSpy = true;
  }
  if (upgradeCosts.sentry) {
    decision.upgradeSentry = true;
  }
  if (upgradeCosts.economy) {
    decision.upgradeEconomy = true;
  }

  const repairNeeded = player.fortMaxHp - player.fortHp;
  if (repairNeeded > 0) {
    const repairCost = calculateRepairCost(
      player.fortHp,
      player.fortMaxHp,
      player.fortLevel,
    );
    const repairBudget = player.fortHp <= 0 ? 0.5 : 0.2;
    if (repairCost < availableGold * repairBudget) {
      decision.repairFort = repairNeeded;
    }
  }

  const desiredBankThreshold = Math.max(
    150000,
    Math.floor(
      availableGold * (0.55 + player.behavior.wealthPreference * 0.35),
    ),
  );
  if (availableGold > desiredBankThreshold) {
    decision.bankGold = Math.floor(
      Math.min(
        availableGold - desiredBankThreshold * 0.6,
        availableGold * (0.2 + player.behavior.wealthPreference * 0.25),
      ),
    );
  }

  return decision;
}

function shouldActThisTick(
  player: PlayerState,
  random: () => number = Math.random,
): boolean {
  const readyToSpendTurns = player.attackTurns >= 3 && player.stamina >= 3;
  const hoardedTurns = player.attackTurns >= 12;
  const economyOnly = player.gold > 250000 || player.units.citizen > 200;
  const activityThreshold = hoardedTurns
    ? 0.9
    : readyToSpendTurns
      ? player.behavior.activityLevel * 0.14
      : player.behavior.activityLevel * 0.03;

  return economyOnly || random() < activityThreshold;
}

function decideBurstTurnBudget(
  player: PlayerState,
  availableAttackTurns: number,
): number {
  if (availableAttackTurns < 3) return 0;
  if (availableAttackTurns >= 30)
    return Math.min(availableAttackTurns, MAX_ATTACK_TURNS);
  if (availableAttackTurns >= 20)
    return Math.min(availableAttackTurns, MAX_ATTACK_TURNS);
  if (availableAttackTurns >= 12) return Math.min(availableAttackTurns, 10);
  if (availableAttackTurns >= 8) return Math.min(availableAttackTurns, 7);

  return player.behavior.aggression >= 0.7 ? availableAttackTurns : 0;
}

function processIntelResults(
  player: PlayerState,
  targets: TargetEvaluation[],
): TargetEvaluation[] {
  return targets.filter((t) => {
    if (t.intelAvailable && t.intel?.success) {
      player.intelCache.set(t.playerId, t.intel);
      return true;
    }

    if (t.motivation === 'retaliation' || t.motivation === 'repeat-farm') {
      return t.estimatedWinRate >= 0.3 || player.behavior.riskTolerance >= 0.6;
    }

    if (t.motivation === 'dominance') {
      return (
        player.behavior.aggression >= 0.6 &&
        player.behavior.riskTolerance >= 0.5 &&
        t.priority >= 65
      );
    }

    if (t.motivation === 'loot') {
      return (
        t.gold >= (player.level <= 8 ? 25000 : 300000) &&
        t.priority >= 55 &&
        player.behavior.riskTolerance >= 0.55 &&
        player.behavior.aggression >= 0.45
      );
    }

    if (t.motivation === 'xp') {
      return (
        (player.behavior.primaryGoal === 'growth' ||
          player.behavior.primaryGoal === 'dominance' ||
          player.level <= 8) &&
        player.behavior.aggression >= 0.4 &&
        t.estimatedWinRate >= 0.35 &&
        t.priority >= 40
      );
    }

    return false;
  });
}

function buildAttackPlan(
  target: TargetEvaluation,
  baseTurns: number,
  remainingSlots: number,
): Array<{ target: string; turns: number; reason: string }> {
  const plan: Array<{ target: string; turns: number; reason: string }> = [];
  if (remainingSlots <= 0) return plan;

  const winRatePercent = `${(target.estimatedWinRate * 100).toFixed(0)}%`;

  if (target.estimatedWinRate >= 0.7) {
    plan.push({
      target: target.playerId,
      turns: Math.max(8, Math.min(baseTurns, MAX_ATTACK_TURNS)),
      reason: `${winRatePercent} win rate, decisive ${target.motivation} attack`,
    });
    return plan;
  }

  if (target.estimatedWinRate >= 0.5) {
    plan.push({
      target: target.playerId,
      turns: Math.max(6, Math.min(baseTurns, MAX_ATTACK_TURNS)),
      reason: `${winRatePercent} win rate, committed ${target.motivation} attack`,
    });
    return plan;
  }

  plan.push({
    target: target.playerId,
    turns: Math.max(5, Math.min(baseTurns, MAX_ATTACK_TURNS)),
    reason: `${winRatePercent} win rate, measured ${target.motivation} attack`,
  });
  return plan;
}

function decideRecruitment(
  player: PlayerState,
  availableGold: number,
): Partial<PlayerState['units']> {
  const recruitment: Partial<PlayerState['units']> = {};

  if (availableGold < 10000) return recruitment;

  const availableCitizens = player.units.citizen;
  if (availableCitizens <= 50) {
    return recruitment;
  }

  const totalDefense =
    player.units.guard + player.units.archer * 2 + player.units.royalGuard * 3;
  const totalOffense =
    player.units.soldier + player.units.knight * 2 + player.units.berserker * 3;

  // If defenseless (wiped), prioritize defense rebuild before anything else
  const isRebuilding = totalDefense <= 10 && totalOffense <= 10;
  const budget = isRebuilding
    ? availableGold * 0.8
    : availableGold * (1 - player.behavior.wealthPreference);

  let offenseRatio = player.behavior.aggression;
  let defenseRatio = 1 - offenseRatio;
  const earlyAccount = player.level <= 8;
  const isDefensiveGoal = player.behavior.primaryGoal === 'defense';
  const isWealthGoal = player.behavior.primaryGoal === 'wealth';

  if (totalDefense <= 10 && totalOffense > 10) {
    defenseRatio = 0.6;
    offenseRatio = 0.4;
  } else if (totalOffense <= 10 && totalDefense > 10) {
    offenseRatio = 0.6;
    defenseRatio = 0.4;
  }

  if (earlyAccount || isDefensiveGoal || isWealthGoal) {
    offenseRatio *= earlyAccount ? 0.45 : 0.7;
    defenseRatio = Math.max(defenseRatio, isWealthGoal ? 0.55 : 0.65);
  }

  const workerBudget =
    !isRebuilding && (earlyAccount || isWealthGoal)
      ? Math.min(
          availableGold * 0.35,
          availableGold *
            (0.12 +
              player.behavior.wealthPreference * 0.18 +
              (earlyAccount ? 0.12 : 0)),
        )
      : 0;
  const protectedBudget = Math.max(0, budget - workerBudget);
  const offenseBudget = protectedBudget * offenseRatio * 0.65;
  const defenseBudget = protectedBudget * defenseRatio * 0.75;
  const clandestineBudget =
    protectedBudget *
    Math.min(
      0.22,
      player.behavior.spyPreference *
        (isDefensiveGoal || earlyAccount ? 0.22 : 0.18),
    );

  const soldierCost = 1500;
  const knightCost = 10000;
  const guardCost = 1500;
  const archerCost = 10000;
  const spyCost = 1500;
  const sentryCost = 1500;
  const workerCost = 2000;

  const maxSoldiers = Math.min(
    Math.floor(offenseBudget / soldierCost),
    availableCitizens,
  );
  recruitment.soldier = maxSoldiers;

  const remainingAfterSoldiers = offenseBudget - maxSoldiers * soldierCost;
  const maxKnights = Math.min(
    Math.floor(remainingAfterSoldiers / knightCost),
    availableCitizens - maxSoldiers,
  );
  recruitment.knight = maxKnights;

  const maxGuards = Math.min(
    Math.floor(defenseBudget / guardCost),
    availableCitizens - maxSoldiers - maxKnights,
  );
  recruitment.guard = maxGuards;

  const remainingAfterGuards = defenseBudget - maxGuards * guardCost;
  const maxArchers = Math.min(
    Math.floor(remainingAfterGuards / archerCost),
    availableCitizens - maxSoldiers - maxKnights - maxGuards,
  );
  recruitment.archer = maxArchers;

  const citizensAfterCombat =
    availableCitizens - maxSoldiers - maxKnights - maxGuards - maxArchers;
  const spyBudget = clandestineBudget * player.behavior.spyPreference;
  const sentryBudget = clandestineBudget * (1 - player.behavior.riskTolerance);
  const maxSpies = Math.min(
    Math.floor(spyBudget / spyCost),
    citizensAfterCombat,
  );
  recruitment.spy = maxSpies;

  const maxSentries = Math.min(
    Math.floor(sentryBudget / sentryCost),
    citizensAfterCombat - maxSpies,
  );
  recruitment.sentry = maxSentries;

  const citizensAfterSecurity = citizensAfterCombat - maxSpies - maxSentries;
  const maxWorkers = Math.min(
    Math.floor(workerBudget / workerCost),
    citizensAfterSecurity,
  );
  recruitment.worker = maxWorkers;

  return recruitment;
}

function calculateUpgradePriorities(
  player: PlayerState,
  availableGold: number,
): { spy?: boolean; sentry?: boolean; economy?: boolean } {
  const result: { spy?: boolean; sentry?: boolean; economy?: boolean } = {};

  if (player.behavior.spyPreference > 0.5) {
    const spyCost = calculateUpgradeCost(player.spyLevel, 'spy');
    if (spyCost < availableGold * 0.15 && player.spyLevel < 22) {
      result.spy = true;
    }
  }

  if (player.behavior.riskTolerance < 0.5) {
    const sentryCost = calculateUpgradeCost(player.sentryLevel, 'sentry');
    if (sentryCost < availableGold * 0.15 && player.sentryLevel < 22) {
      result.sentry = true;
    }
  }

  if (player.behavior.wealthPreference > 0.6) {
    const economyCost = calculateUpgradeCost(player.economyLevel, 'economy');
    if (economyCost < availableGold * 0.2 && player.economyLevel < 7) {
      result.economy = true;
    }
  }

  return result;
}

export function applyDecision(
  player: PlayerState,
  decision: AgentDecision,
): PlayerState {
  let newPlayer = { ...player };
  let goldSpent = 0;

  if (decision.recruitment && Object.keys(decision.recruitment).length > 0) {
    const totalCost = calculateTotalUnitCost(decision.recruitment);
    if (totalCost <= newPlayer.gold) {
      newPlayer.gold -= totalCost;
      goldSpent += totalCost;

      const units = { ...newPlayer.units };
      if (decision.recruitment.soldier) {
        units.soldier = (units.soldier ?? 0) + decision.recruitment.soldier;
        units.citizen =
          (units.citizen ?? 0) - (decision.recruitment.soldier ?? 0);
      }
      if (decision.recruitment.knight) {
        units.knight = (units.knight ?? 0) + decision.recruitment.knight;
        units.citizen =
          (units.citizen ?? 0) - (decision.recruitment.knight ?? 0);
      }
      if (decision.recruitment.berserker) {
        units.berserker =
          (units.berserker ?? 0) + decision.recruitment.berserker;
        units.citizen =
          (units.citizen ?? 0) - (decision.recruitment.berserker ?? 0);
      }
      if (decision.recruitment.guard) {
        units.guard = (units.guard ?? 0) + decision.recruitment.guard;
        units.citizen =
          (units.citizen ?? 0) - (decision.recruitment.guard ?? 0);
      }
      if (decision.recruitment.archer) {
        units.archer = (units.archer ?? 0) + decision.recruitment.archer;
        units.citizen =
          (units.citizen ?? 0) - (decision.recruitment.archer ?? 0);
      }
      if (decision.recruitment.royalGuard) {
        units.royalGuard =
          (units.royalGuard ?? 0) + decision.recruitment.royalGuard;
        units.citizen =
          (units.citizen ?? 0) - (decision.recruitment.royalGuard ?? 0);
      }
      for (const key of [
        'spy',
        'infiltrator',
        'assassin',
        'sentry',
        'sentinel',
        'inquisitor',
      ] as const) {
        if (decision.recruitment[key]) {
          units[key] = (units[key] ?? 0) + (decision.recruitment[key] ?? 0);
          units.citizen =
            (units.citizen ?? 0) - (decision.recruitment[key] ?? 0);
        }
      }
      if (decision.recruitment.worker) {
        units.worker = (units.worker ?? 0) + decision.recruitment.worker;
        units.citizen =
          (units.citizen ?? 0) - (decision.recruitment.worker ?? 0);
      }
      newPlayer.units = units;
      for (const key of Object.keys(newPlayer.units) as Array<
        keyof PlayerState['units']
      >) {
        newPlayer.units[key] = Math.max(
          0,
          Math.floor(newPlayer.units[key] ?? 0),
        );
      }
    }
  }

  if (decision.upgradeSpy && newPlayer.spyLevel < 22) {
    const cost = calculateUpgradeCost(newPlayer.spyLevel, 'spy');
    if (cost <= newPlayer.gold - goldSpent) {
      newPlayer.gold -= cost;
      goldSpent += cost;
      newPlayer.spyLevel++;
    }
  }

  if (decision.upgradeSentry && newPlayer.sentryLevel < 22) {
    const cost = calculateUpgradeCost(newPlayer.sentryLevel, 'sentry');
    if (cost <= newPlayer.gold - goldSpent) {
      newPlayer.gold -= cost;
      goldSpent += cost;
      newPlayer.sentryLevel++;
    }
  }

  if (decision.upgradeEconomy && newPlayer.economyLevel < 7) {
    const cost = calculateUpgradeCost(newPlayer.economyLevel, 'economy');
    if (cost <= newPlayer.gold - goldSpent) {
      newPlayer.gold -= cost;
      goldSpent += cost;
      newPlayer.economyLevel++;
    }
  }

  if (decision.repairFort && decision.repairFort > 0) {
    const repairCost = calculateRepairCost(
      newPlayer.fortHp,
      newPlayer.fortMaxHp,
      newPlayer.fortLevel,
    );
    if (repairCost <= newPlayer.gold - goldSpent) {
      newPlayer.gold -= repairCost;
      newPlayer.fortHp = newPlayer.fortMaxHp;
    }
  }

  newPlayer.gold = Math.max(0, Math.floor(newPlayer.gold));
  newPlayer.goldInBank = Math.max(0, Math.floor(newPlayer.goldInBank));

  return newPlayer;
}
