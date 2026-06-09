import { getPlayerPower } from './economy';
import {
  IntelResult,
  PlayerState,
  StrategicGoal,
  TargetEvaluation,
  TargetMotivation,
  TurnStrategy,
} from './types';

/** Evaluate targets. */
export function evaluateTargets(
  attacker: PlayerState,
  population: PlayerState[],
  intelCache: Map<string, IntelResult>,
  attackLevelRange = Number(process.env.NEXT_PUBLIC_ATTACK_LEVEL_RANGE ?? 5),
  currentDay = 0,
): TargetEvaluation[] {
  const evaluations: TargetEvaluation[] = [];
  const attackerPower = getPlayerPower(attacker);
  const activePlayers = population.filter(
    (player) => player.status === 'active',
  );
  const powerRank = [...activePlayers]
    .map((player) => ({ id: player.id, power: getPlayerPower(player) }))
    .sort((a, b) => b.power - a.power);
  const attackerRank =
    powerRank.findIndex((player) => player.id === attacker.id) + 1;
  const isTopPlayer =
    attackerRank > 0 && attackerRank <= Math.max(3, activePlayers.length * 0.1);
  const goal = getStrategicGoal(attacker, isTopPlayer);
  const minimumGoldTarget = getMinimumGoldTarget(attacker, goal);

  for (const target of activePlayers) {
    if (target.id === attacker.id) continue;

    if (
      attacker.level < target.level - attackLevelRange ||
      attacker.level > target.level + attackLevelRange
    ) {
      continue;
    }

    const cachedIntel = intelCache.get(target.id);
    const intelAge =
      cachedIntel?.day != null
        ? Math.max(0, currentDay - cachedIntel.day)
        : undefined;
    const intelFreshness = getIntelFreshness(intelAge, cachedIntel?.success);
    const hasIntel =
      !!cachedIntel?.success &&
      (intelFreshness === 'fresh' || intelFreshness === 'decaying');
    const recentlyAttackedByTarget =
      (attacker.incomingAttackHistory.get(target.id)?.length ?? 0) > 0;
    const previouslyAttackedTarget =
      (attacker.attackHistory.get(target.id)?.length ?? 0) > 0 ||
      (attacker.targetMemory.get(target.id)?.attacks ?? 0) > 0;
    const targetMemory = attacker.targetMemory.get(target.id);

    // Skip targets with near-zero power (wiped out and rebuilding)
    const targetPower = getPlayerPower({
      ...target,
      units: cachedIntel?.defenderInfo?.units ?? target.units,
    } as PlayerState);
    if (targetPower < attackerPower * 0.05) continue;

    let estimatedWinRate = 0.5;
    let estimatedLoot = target.gold * 0.2;
    let riskLevel: 'low' | 'medium' | 'high' | 'unknown' = 'unknown';
    let recommendedTurns = 10;
    let powerRatio = attackerPower / Math.max(1, targetPower);

    if (hasIntel && cachedIntel?.defenderInfo) {
      powerRatio = attackerPower / Math.max(1, targetPower);
      const intelDecayPenalty =
        intelFreshness === 'decaying'
          ? Math.min(0.24, Math.max(0, (intelAge ?? 0) - 1) * 0.12)
          : 0;
      estimatedWinRate = Math.max(
        0.05,
        calculateWinProbability(powerRatio) - intelDecayPenalty,
      );
      estimatedLoot =
        calculateExpectedLoot(
          target.gold,
          estimatedWinRate,
          cachedIntel.defenderInfo.fortHp,
          cachedIntel.defenderInfo.fortMaxHp,
        ) *
        (1 - intelDecayPenalty);

      if (powerRatio > 1.5) {
        riskLevel = 'low';
        recommendedTurns = 10;
      } else if (powerRatio > 0.8) {
        riskLevel = 'medium';
        recommendedTurns = 7;
      } else if (powerRatio > 0.5) {
        riskLevel = 'high';
        recommendedTurns = 5;
      } else {
        riskLevel = 'high';
        recommendedTurns = 3;
      }
    } else {
      riskLevel = 'unknown';
      estimatedWinRate = Math.max(
        0.25,
        calculateWinProbability(powerRatio) * 0.85,
      );
      estimatedLoot = target.gold * 0.12 * estimatedWinRate;
      recommendedTurns = 3;
    }

    const motivation = getTargetMotivation({
      attacker,
      target,
      goal,
      recentlyAttackedByTarget,
      previouslyAttackedTarget,
      targetMemory,
      targetRank: powerRank.findIndex((player) => player.id === target.id) + 1,
      attackerRank,
      minimumGoldTarget,
    });

    if (
      motivation === 'opportunistic' &&
      target.gold < minimumGoldTarget &&
      !recentlyAttackedByTarget
    ) {
      continue;
    }

    const priority = calculatePriority({
      winRate: estimatedWinRate,
      expectedLoot: estimatedLoot,
      targetGold: target.gold,
      riskLevel,
      behavior: attacker.behavior,
      motivation,
      goal,
      powerRatio,
      targetMemory,
    });
    const shouldScout = shouldScoutTarget({
      attacker,
      hasIntel,
      estimatedWinRate,
      targetGold: target.gold,
      riskLevel,
      motivation,
      priority,
      minimumGoldTarget,
    });

    evaluations.push({
      playerId: target.id,
      gold: target.gold,
      intelAvailable: hasIntel,
      intel: cachedIntel,
      estimatedWinRate,
      estimatedLoot,
      riskLevel,
      recommendedTurns,
      priority,
      motivation,
      shouldScout,
      intelAge,
      intelFreshness,
      recentlyAttackedByTarget,
      previouslyAttackedTarget,
    });
  }

  return evaluations.sort((a, b) => b.priority - a.priority);
}

function getIntelFreshness(
  age: number | undefined,
  success: boolean | undefined,
): TargetEvaluation['intelFreshness'] {
  if (!success || age == null) return 'none';
  if (age <= 1) return 'fresh';
  if (age <= 3) return 'decaying';
  return 'expired';
}

function calculateWinProbability(powerRatio: number): number {
  if (powerRatio >= 4) return 0.99;
  if (powerRatio <= 0.25) return 0.01;
  return 1 / (1 + Math.exp(-4 * Math.log(powerRatio)));
}

function calculateExpectedLoot(
  defenderGold: number,
  winProbability: number,
  fortHp: number,
  fortMaxHp: number,
): number {
  const fortIntegrity = fortMaxHp > 0 ? fortHp / fortMaxHp : 0;
  const baseLootFactor = 0.2 + fortIntegrity * 0.15;
  return defenderGold * baseLootFactor * winProbability;
}

function getStrategicGoal(
  attacker: PlayerState,
  isTopPlayer: boolean,
): StrategicGoal {
  if (
    Array.from(attacker.incomingAttackHistory.values()).some(
      (history) => history.length > 0,
    )
  ) {
    return 'retaliation';
  }
  if (isTopPlayer && attacker.level >= 12) return 'dominance';
  if (attacker.level <= 8 && attacker.behavior.primaryGoal !== 'retaliation') {
    if (attacker.behavior.primaryGoal === 'wealth') return 'wealth';
    if (
      attacker.behavior.primaryGoal === 'defense' &&
      attacker.behavior.aggression < 0.35
    ) {
      return 'defense';
    }
    return 'growth';
  }
  return attacker.behavior.primaryGoal;
}

function getMinimumGoldTarget(
  attacker: PlayerState,
  goal: StrategicGoal,
): number {
  const earlyAccount = attacker.level <= 8;
  const base = Math.max(earlyAccount ? 8000 : 50000, attacker.gold * 0.08);
  if (goal === 'growth')
    return Math.max(earlyAccount ? 5000 : base, attacker.gold * 0.03);
  if (goal === 'wealth') {
    return Math.max(earlyAccount ? 15000 : base, attacker.gold * 0.18);
  }
  if (goal === 'defense') {
    return Math.max(earlyAccount ? 25000 : base, attacker.gold * 0.25);
  }
  if (goal === 'dominance') return Math.max(25000, attacker.gold * 0.04);
  if (goal === 'retaliation') return 10000;
  return base;
}

function getTargetMotivation(params: {
  attacker: PlayerState;
  target: PlayerState;
  goal: StrategicGoal;
  recentlyAttackedByTarget: boolean;
  previouslyAttackedTarget: boolean;
  targetMemory?: { attacks: number; wins: number; lastLoot: number };
  targetRank: number;
  attackerRank: number;
  minimumGoldTarget: number;
}): TargetMotivation {
  if (params.recentlyAttackedByTarget) return 'retaliation';
  if (
    params.previouslyAttackedTarget &&
    (params.target.gold >= params.minimumGoldTarget ||
      (params.targetMemory?.lastLoot ?? 0) > 50000)
  ) {
    return 'repeat-farm';
  }
  if (
    params.goal === 'dominance' &&
    params.targetRank > 0 &&
    params.attackerRank > 0 &&
    params.targetRank <= Math.max(params.attackerRank + 5, 10)
  ) {
    return 'dominance';
  }
  if (
    params.goal === 'growth' &&
    params.target.level >= params.attacker.level - 2 &&
    params.target.level <= params.attacker.level + 2
  ) {
    return 'xp';
  }
  if (params.target.gold >= params.minimumGoldTarget) return 'loot';
  return 'opportunistic';
}

function calculatePriority(params: {
  winRate: number;
  expectedLoot: number;
  targetGold: number;
  riskLevel: string;
  behavior: PlayerState['behavior'];
  motivation: TargetMotivation;
  goal: StrategicGoal;
  powerRatio: number;
  targetMemory?: { attacks: number; wins: number; lastLoot: number };
}): number {
  let priority = 0;

  priority += params.winRate * 55;
  priority += Math.log10(params.expectedLoot + 1) * 14;

  if (params.targetGold > 100000) priority += 20;
  if (params.targetGold > 500000) priority += 30;
  if (params.targetGold > 1000000) priority += 50;
  if (params.targetGold > 2500000) priority += 25;

  if (params.riskLevel === 'low') priority += 20;
  else if (params.riskLevel === 'medium') priority += 10;
  else if (params.riskLevel === 'high') priority -= 8;
  else if (params.riskLevel === 'unknown') priority -= 4;

  if (params.motivation === 'retaliation') priority += 55;
  if (params.motivation === 'repeat-farm') {
    priority += 35 + Math.log10((params.targetMemory?.lastLoot ?? 0) + 1) * 8;
  }
  if (params.motivation === 'dominance') {
    priority += params.powerRatio >= 0.7 ? 35 : 8;
  }
  if (params.motivation === 'loot')
    priority += params.behavior.wealthPreference * 35;
  if (params.motivation === 'xp') {
    priority += params.behavior.aggression * 35 + 20;
  }
  if (params.motivation === 'opportunistic') priority -= 20;

  if (params.goal === 'defense')
    priority *= 0.45 + params.behavior.riskTolerance;
  else if (params.goal === 'wealth') {
    priority *= 0.7 + params.behavior.wealthPreference;
  } else {
    priority *= 0.4 + params.behavior.aggression;
  }
  return priority;
}

function shouldScoutTarget(params: {
  attacker: PlayerState;
  hasIntel: boolean;
  estimatedWinRate: number;
  targetGold: number;
  riskLevel: TargetEvaluation['riskLevel'];
  motivation: TargetMotivation;
  priority: number;
  minimumGoldTarget: number;
}): boolean {
  if (params.hasIntel) return false;
  if (params.attacker.units.spy <= 0) return false;
  if (params.priority < 35) return false;
  if (params.motivation === 'opportunistic') return false;
  if (params.motivation === 'retaliation') return true;
  if (params.motivation === 'dominance') return params.estimatedWinRate >= 0.2;
  if (params.motivation === 'repeat-farm') return true;
  if (params.motivation === 'loot') {
    return params.targetGold >= params.minimumGoldTarget;
  }
  if (params.motivation === 'xp') {
    return (
      params.priority >= 45 && params.attacker.behavior.spyPreference >= 0.35
    );
  }
  return params.riskLevel === 'unknown' && params.estimatedWinRate >= 0.25;
}

/** Select attack strategy. */
export function selectAttackStrategy(
  evaluation: TargetEvaluation,
  turnStrategy: TurnStrategy,
): {
  shouldAttack: boolean;
  turns: number;
} {
  const { estimatedWinRate, riskLevel, intelAvailable, motivation, priority } =
    evaluation;
  const hasPersonalMotive =
    motivation === 'retaliation' || motivation === 'repeat-farm';

  if (
    !intelAvailable &&
    turnStrategy === 'conservative' &&
    !hasPersonalMotive
  ) {
    return { shouldAttack: false, turns: 0 };
  }

  if (turnStrategy === 'conservative') {
    if (estimatedWinRate >= 0.72) {
      return { shouldAttack: true, turns: intelAvailable ? 10 : 8 };
    }
    if (estimatedWinRate >= 0.48) {
      return { shouldAttack: true, turns: intelAvailable ? 8 : 5 };
    }
    if (estimatedWinRate >= 0.35 && riskLevel !== 'high') {
      return { shouldAttack: true, turns: 6 };
    }
    if (hasPersonalMotive && estimatedWinRate >= 0.3 && priority >= 55) {
      return { shouldAttack: true, turns: 7 };
    }
    return { shouldAttack: false, turns: 0 };
  }

  if (turnStrategy === 'balanced') {
    if (estimatedWinRate >= 0.55) {
      return { shouldAttack: true, turns: intelAvailable ? 10 : 8 };
    }
    if (estimatedWinRate >= 0.4) {
      return { shouldAttack: true, turns: intelAvailable ? 8 : 5 };
    }
    if (hasPersonalMotive && estimatedWinRate >= 0.3) {
      return { shouldAttack: true, turns: 7 };
    }
    return { shouldAttack: false, turns: 0 };
  }

  if (turnStrategy === 'aggressive') {
    if (estimatedWinRate >= 0.55) {
      return { shouldAttack: true, turns: 10 };
    }
    if (estimatedWinRate >= 0.4) {
      return { shouldAttack: true, turns: 9 };
    }
    if (estimatedWinRate >= 0.25) {
      return { shouldAttack: true, turns: 10 };
    }
    return { shouldAttack: false, turns: 0 };
  }

  return { shouldAttack: false, turns: 0 };
}

/** Should send intel. */
export function shouldSendIntel(
  attacker: PlayerState,
  target: TargetEvaluation,
  intelCache: Map<string, IntelResult>,
  random: () => number = Math.random,
): boolean {
  if (attacker.behavior.spyPreference < 0.2) return false;

  const existingIntel = intelCache.get(target.playerId);
  if (existingIntel?.success) return false;
  if (!target.shouldScout) return false;

  const spyLimits = getSpyMissionLimits(attacker.spyLevel);
  if (attacker.dailyLimits.intelUsed >= spyLimits.maxPerDay) return false;

  if (target.gold < 25000 && target.motivation !== 'retaliation') return false;

  const motiveBoost =
    target.motivation === 'retaliation' || target.motivation === 'repeat-farm'
      ? 0.25
      : 0;
  return attacker.behavior.spyPreference * 0.65 + motiveBoost > random();
}

function getSpyMissionLimits(spyLevel: number): {
  maxPerDay: number;
  maxPerUser: number;
  maxPerMission: number;
} {
  if (spyLevel <= 3) {
    return { maxPerDay: 1, maxPerUser: 1, maxPerMission: 3 };
  }
  if (spyLevel <= 7) {
    return { maxPerDay: spyLevel, maxPerUser: 1, maxPerMission: 5 };
  }
  if (spyLevel <= 15) {
    return { maxPerDay: spyLevel + 2, maxPerUser: 2, maxPerMission: 7 };
  }
  return {
    maxPerDay: Math.min(spyLevel + 4, 20),
    maxPerUser: 4,
    maxPerMission: 10,
  };
}
