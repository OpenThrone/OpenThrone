import type { ItemType, ItemUsage, PlayerItem } from '@/types/typings';

import {
  getBattleConstants,
  setBattleConstants,
  simulateBattle,
} from '../utils/attackFunctions';
import {
  computeArmyCost,
  createSimPlayer,
  getTotalDefense,
  getTotalOffense,
} from './presets';
import {
  BalanceParameters,
  BattleConfig,
  BattleMetrics,
  IntelPayload,
  IntelResult,
  PlayerState,
  SimPlayer,
  SimulationResults,
  SpyResult,
  UnitCounts,
} from './types';

function battleConfigToOverrides(
  config?: BattleConfig,
): Record<string, number> {
  return {
    ...(config?.attackerMultiplier !== undefined
      ? { ATTACKER_DAMAGE_MULTIPLIER: config.attackerMultiplier }
      : {}),
    ...(config?.defenderCounterMultiplier !== undefined
      ? { DEFENDER_COUNTER_DAMAGE_MULTIPLIER: config.defenderCounterMultiplier }
      : {}),
    ...(config?.maxPillageShare !== undefined
      ? { MAX_PILLAGE_SHARE_PER_ATTACK: config.maxPillageShare }
      : {}),
    ...(config?.damageVarianceMin !== undefined
      ? { DAMAGE_VARIANCE_MIN: config.damageVarianceMin }
      : {}),
    ...(config?.damageVarianceMax !== undefined
      ? { DAMAGE_VARIANCE_MAX: config.damageVarianceMax }
      : {}),
  };
}

/** Create battle config from balance. */
export function createBattleConfigFromBalance(
  balance?: Partial<BalanceParameters>,
): BattleConfig | undefined {
  if (!balance) return undefined;

  return {
    attackerMultiplier: balance.attackerDamageMultiplier,
    defenderCounterMultiplier: balance.defenderCounterDamageMultiplier,
    maxPillageShare: balance.maxPillageSharePerAttack,
    damageVarianceMin: balance.damageVarianceMin,
    damageVarianceMax: balance.damageVarianceMax,
  };
}

function createBattleItems(player: SimPlayer): PlayerItem[] {
  const itemConfigs: Array<{
    usage: ItemUsage;
    type: ItemType;
    quantity: number;
  }> = [
    { usage: 'OFFENSE', type: 'WEAPON', quantity: player.items.meleeAtk },
    { usage: 'OFFENSE', type: 'ARMOR', quantity: player.items.rangedAtk },
    { usage: 'DEFENSE', type: 'WEAPON', quantity: player.items.meleeDef },
    { usage: 'DEFENSE', type: 'ARMOR', quantity: player.items.rangedDef },
  ];

  return itemConfigs
    .filter((item) => item.quantity > 0)
    .map((item, index) => ({
      id: index + 1,
      userId: 0,
      usage: item.usage,
      type: item.type,
      level: 1,
      quantity: item.quantity,
    }));
}

function simPlayerToBattleUser(player: SimPlayer, isAttacker: boolean): any {
  const units: any[] = [];

  if (player.units.soldier > 0) {
    units.push({
      type: 'OFFENSE',
      level: 1,
      quantity: player.units.soldier,
      name: 'Soldier',
    });
  }
  if (player.units.knight > 0) {
    units.push({
      type: 'OFFENSE',
      level: 2,
      quantity: player.units.knight,
      name: 'Knight',
    });
  }
  if (player.units.berserker > 0) {
    units.push({
      type: 'OFFENSE',
      level: 3,
      quantity: player.units.berserker,
      name: 'Berserker',
    });
  }
  if (player.units.guard > 0) {
    units.push({
      type: 'DEFENSE',
      level: 1,
      quantity: player.units.guard,
      name: 'Guard',
    });
  }
  if (player.units.archer > 0) {
    units.push({
      type: 'DEFENSE',
      level: 2,
      quantity: player.units.archer,
      name: 'Archer',
    });
  }
  if (player.units.royalGuard > 0) {
    units.push({
      type: 'DEFENSE',
      level: 3,
      quantity: player.units.royalGuard,
      name: 'Royal Guard',
    });
  }
  if (player.units.citizen > 0) {
    units.push({
      type: 'CITIZEN',
      level: 1,
      quantity: player.units.citizen,
      name: 'Citizen',
    });
  }
  if (player.units.worker > 0) {
    units.push({
      type: 'WORKER',
      level: 1,
      quantity: player.units.worker,
      name: 'Worker',
    });
  }

  const items = createBattleItems(player);

  return {
    id: player.id as any as number,
    displayName: player.displayName,
    level: player.level,
    experience: player.xp ?? 0,
    race: player.race ?? 'HUMAN',
    class: player.playerClass ?? 'FIGHTER',
    houseLevel: player.houseLevel ?? 1,
    fortLevel: player.fortLevel,
    fortHitpoints: player.fortHp,
    stamina: player.stamina ?? 100,
    defensePressureToday: player.defensePressureToday ?? 0,
    gold: BigInt(player.gold),
    units,
    items,
    structure_upgrades: [],
    battle_upgrades: [
      { type: 'OFFENSE', level: player.upgrades.offense, quantity: 1 },
      { type: 'DEFENSE', level: player.upgrades.defense, quantity: 1 },
    ],
    attackBonus: player.bonuses.attack,
    defenseBonus: player.bonuses.defense,
    bonus_points: [],
    playerBonuses: [],
  };
}

function battleResultToMetrics(
  result: any,
  attacker: SimPlayer,
  defender: SimPlayer,
  armyCost: number,
): BattleMetrics {
  const casualtySummary = result.casualtySummary ?? {};
  const attackerCas = casualtySummary.attacker ?? [];
  const defenderCas = casualtySummary.defender ?? [];

  let attackerLost = 0;
  let defenderLost = 0;
  const attackerCasualties: UnitCounts = {
    soldier: 0,
    knight: 0,
    berserker: 0,
    guard: 0,
    archer: 0,
    royalGuard: 0,
    spy: 0,
    infiltrator: 0,
    assassin: 0,
    sentry: 0,
    sentinel: 0,
    inquisitor: 0,
    citizen: 0,
    worker: 0,
  };
  const defenderCasualties: UnitCounts = {
    soldier: 0,
    knight: 0,
    berserker: 0,
    guard: 0,
    archer: 0,
    royalGuard: 0,
    spy: 0,
    infiltrator: 0,
    assassin: 0,
    sentry: 0,
    sentinel: 0,
    inquisitor: 0,
    citizen: 0,
    worker: 0,
  };

  for (const c of attackerCas) {
    const qty = c.quantity ?? 0;
    attackerLost += qty;
    if (c.type === 'OFFENSE' && c.level === 1) attackerCasualties.soldier = qty;
    else if (c.type === 'OFFENSE' && c.level === 2)
      attackerCasualties.knight = qty;
    else if (c.type === 'OFFENSE' && c.level === 3)
      attackerCasualties.berserker = qty;
    else if (c.type === 'CITIZEN') attackerCasualties.citizen = qty;
    else if (c.type === 'WORKER') attackerCasualties.worker = qty;
  }

  for (const c of defenderCas) {
    const qty = c.quantity ?? 0;
    defenderLost += qty;
    if (c.type === 'OFFENSE' && c.level === 1) defenderCasualties.soldier = qty;
    else if (c.type === 'OFFENSE' && c.level === 2)
      defenderCasualties.knight = qty;
    else if (c.type === 'OFFENSE' && c.level === 3)
      defenderCasualties.berserker = qty;
    else if (c.type === 'DEFENSE' && c.level === 1)
      defenderCasualties.guard = qty;
    else if (c.type === 'DEFENSE' && c.level === 2)
      defenderCasualties.archer = qty;
    else if (c.type === 'DEFENSE' && c.level === 3)
      defenderCasualties.royalGuard = qty;
    else if (c.type === 'CITIZEN') defenderCasualties.citizen = qty;
    else if (c.type === 'WORKER') defenderCasualties.worker = qty;
  }

  const initialFortHp = defender.fortHp;
  const finalFortHp =
    result.finalFortHP ?? result.fortHitpoints ?? initialFortHp;
  const fortDamage = initialFortHp - finalFortHp;

  const loot = Number(result.pillagedGold ?? result.loot ?? 0);
  const attackerRoi = armyCost > 0 ? loot / armyCost : 0;
  const xp = result.experienceGained ?? {};

  let winner: 'attacker' | 'defender' | 'draw' = 'draw';
  if (result.result === 'WIN') winner = 'attacker';
  else if (result.result === 'LOSS') winner = 'defender';

  return {
    winner,
    turns: result.turnsTaken ?? 10,
    attackerCasualties,
    defenderCasualties,
    fortDamage,
    loot,
    attackerRoi,
    attackerXp: Math.max(0, Number(xp.attacker ?? 0)),
    defenderXp: Math.max(0, Number(xp.defender ?? 0)),
    attackerUnitsRemaining: attacker.units,
    defenderUnitsRemaining: defender.units,
  };
}

/** Run single battle. */
export async function runSingleBattle(
  attacker: SimPlayer,
  defender: SimPlayer,
  config?: BattleConfig,
): Promise<BattleMetrics> {
  const attackerUser = simPlayerToBattleUser(attacker, true);
  const defenderUser = simPlayerToBattleUser(defender, false);

  const maxTurns = config?.maxTurns ?? 10;
  const isDefenderProtected =
    config?.isDefenderProtected ?? defender.level <= 9;
  const random = config?.random ?? Math.random;
  const originalConstants = getBattleConstants();
  const overrides = battleConfigToOverrides(config);

  if (Object.keys(overrides).length > 0) {
    setBattleConstants(overrides as any);
  }

  const result = await simulateBattle(
    attackerUser,
    defenderUser,
    defender.fortHp,
    maxTurns,
    false,
    isDefenderProtected,
    { random },
  );

  if (Object.keys(overrides).length > 0) {
    setBattleConstants(originalConstants as any);
  }

  const armyCost = computeArmyCost(attacker);
  return battleResultToMetrics(result, attacker, defender, armyCost);
}

/** Run simulation. */
export async function runSimulation(
  attackerConfig: SimPlayer,
  defenderConfig: SimPlayer,
  iterations: number = 1000,
  config?: BattleConfig,
): Promise<SimulationResults> {
  const results: BattleMetrics[] = [];

  for (let i = 0; i < iterations; i++) {
    const attacker = createSimPlayer({ ...attackerConfig, id: `att_${i}` });
    const defender = createSimPlayer({ ...defenderConfig, id: `def_${i}` });

    const result = await runSingleBattle(attacker, defender, config);
    results.push(result);
  }

  return aggregateMetrics(results);
}

function aggregateMetrics(results: BattleMetrics[]): SimulationResults {
  if (results.length === 0) {
    return {
      gamesPlayed: 0,
      attackerWinRate: 0,
      defenderWinRate: 0,
      drawRate: 0,
      avgAttackerCasualtiesPercent: 0,
      avgDefenderCasualtiesPercent: 0,
      avgFortDamage: 0,
      avgFortDamagePercent: 0,
      avgLoot: 0,
      avgAttackerRoi: 0,
      avgTurns: 0,
    };
  }

  let attackerWins = 0;
  let defenderWins = 0;
  let draws = 0;
  let totalAttackerCasualties = 0;
  let totalDefenderCasualties = 0;
  let totalFortDamage = 0;
  let totalFortDamagePercent = 0;
  let totalLoot = 0;
  let totalAttackerRoi = 0;
  let totalTurns = 0;

  for (const result of results) {
    if (result.winner === 'attacker') attackerWins++;
    else if (result.winner === 'defender') defenderWins++;
    else draws++;

    const attackerCasualties =
      result.attackerCasualties.soldier +
      result.attackerCasualties.knight +
      result.attackerCasualties.berserker +
      result.attackerCasualties.citizen +
      result.attackerCasualties.worker;

    const defenderCasualties =
      result.defenderCasualties.soldier +
      result.defenderCasualties.knight +
      result.defenderCasualties.berserker +
      result.defenderCasualties.guard +
      result.defenderCasualties.archer +
      result.defenderCasualties.royalGuard +
      result.defenderCasualties.citizen +
      result.defenderCasualties.worker;

    totalAttackerCasualties += attackerCasualties;
    totalDefenderCasualties += defenderCasualties;
    totalFortDamage += result.fortDamage;
    totalFortDamagePercent += result.fortDamage / 100;
    totalLoot += result.loot;
    totalAttackerRoi += result.attackerRoi;
    totalTurns += result.turns;
  }

  const n = results.length;

  return {
    gamesPlayed: n,
    attackerWinRate: attackerWins / n,
    defenderWinRate: defenderWins / n,
    drawRate: draws / n,
    avgAttackerCasualtiesPercent: totalAttackerCasualties / n,
    avgDefenderCasualtiesPercent: totalDefenderCasualties / n,
    avgFortDamage: totalFortDamage / n,
    avgFortDamagePercent: totalFortDamagePercent / n,
    avgLoot: totalLoot / n,
    avgAttackerRoi: totalAttackerRoi / n,
    avgTurns: totalTurns / n,
  };
}

/** Print results. */
export function printResults(results: SimulationResults): void {
  console.log('\n=== Battle Simulation Results ===');
  console.log(`Games Played: ${results.gamesPlayed}`);
  console.log(`\nWin Rates:`);
  console.log(`  Attacker: ${(results.attackerWinRate * 100).toFixed(1)}%`);
  console.log(`  Defender: ${(results.defenderWinRate * 100).toFixed(1)}%`);
  console.log(`  Draw:     ${(results.drawRate * 100).toFixed(1)}%`);
  console.log(`\nCasualties (average per battle):`);
  console.log(
    `  Attacker: ${results.avgAttackerCasualtiesPercent.toFixed(2)} units`,
  );
  console.log(
    `  Defender: ${results.avgDefenderCasualtiesPercent.toFixed(2)} units`,
  );
  console.log(`\nFort Damage:`);
  console.log(`  Average: ${results.avgFortDamage.toFixed(1)} HP`);
  console.log(`  Percent: ${results.avgFortDamagePercent.toFixed(1)}%`);
  console.log(`\nLoot:`);
  console.log(`  Average: ${results.avgLoot.toFixed(0)} gold`);
  console.log(`  ROI:     ${(results.avgAttackerRoi * 100).toFixed(2)}%`);
  console.log(`\nBattle Duration:`);
  console.log(`  Average Turns: ${results.avgTurns.toFixed(1)}`);
  console.log('=================================\n');
}

function computeEffectivePower(player: SimPlayer): number {
  const offense = getTotalOffense(player.units);
  const defense = getTotalDefense(player.units);

  const offenseMultiplier = 1 + player.bonuses.attack / 100;
  const defenseMultiplier = 1 + player.bonuses.defense / 100;

  const offensePower = offense * offenseMultiplier;
  const defensePower = defense * defenseMultiplier;

  return Math.sqrt(offensePower * defensePower);
}

function getPowerRatio(attacker: SimPlayer, defender: SimPlayer): number {
  const attackerPower = computeEffectivePower(attacker);
  const defenderPower = computeEffectivePower(defender);
  return attackerPower / Math.max(1, defenderPower);
}

// ============================================================
// Spy Simulation Functions
// ============================================================

function playerStateToSpyUser(player: PlayerState): any {
  const units: any[] = [];

  if (player.units.soldier > 0) {
    units.push({
      type: 'OFFENSE',
      level: 1,
      quantity: player.units.soldier,
      name: 'Soldier',
    });
  }
  if (player.units.knight > 0) {
    units.push({
      type: 'OFFENSE',
      level: 2,
      quantity: player.units.knight,
      name: 'Knight',
    });
  }
  if (player.units.berserker > 0) {
    units.push({
      type: 'OFFENSE',
      level: 3,
      quantity: player.units.berserker,
      name: 'Berserker',
    });
  }
  if (player.units.guard > 0) {
    units.push({
      type: 'DEFENSE',
      level: 1,
      quantity: player.units.guard,
      name: 'Guard',
    });
  }
  if (player.units.archer > 0) {
    units.push({
      type: 'DEFENSE',
      level: 2,
      quantity: player.units.archer,
      name: 'Archer',
    });
  }
  if (player.units.royalGuard > 0) {
    units.push({
      type: 'DEFENSE',
      level: 3,
      quantity: player.units.royalGuard,
      name: 'Royal Guard',
    });
  }
  if (player.units.spy > 0) {
    units.push({
      type: 'SPY',
      level: 1,
      quantity: player.units.spy,
      name: 'Spy',
    });
  }
  if (player.units.infiltrator > 0) {
    units.push({
      type: 'SPY',
      level: 2,
      quantity: player.units.infiltrator,
      name: 'Infiltrator',
    });
  }
  if (player.units.assassin > 0) {
    units.push({
      type: 'SPY',
      level: 3,
      quantity: player.units.assassin,
      name: 'Assassin',
    });
  }
  if (player.units.sentry > 0) {
    units.push({
      type: 'SENTRY',
      level: 1,
      quantity: player.units.sentry,
      name: 'Sentry',
    });
  }
  if (player.units.sentinel > 0) {
    units.push({
      type: 'SENTRY',
      level: 2,
      quantity: player.units.sentinel,
      name: 'Sentinel',
    });
  }
  if (player.units.inquisitor > 0) {
    units.push({
      type: 'SENTRY',
      level: 3,
      quantity: player.units.inquisitor,
      name: 'Inquisitor',
    });
  }

  const spyCount =
    player.units.spy * 3 +
    player.units.infiltrator * 5 +
    player.units.assassin * 270;
  const sentryCount =
    player.units.sentry * 5 +
    player.units.sentinel * 20 +
    player.units.inquisitor * 250;

  return {
    id: player.id.split('_')[1] ? parseInt(player.id.split('_')[1]) || 1 : 1,
    displayName: player.displayName,
    level: player.level,
    fortLevel: player.fortLevel,
    fortHitpoints: player.fortHp,
    gold: BigInt(player.gold),
    units,
    items: [],
    structure_upgrades: [],
    battle_upgrades: [
      { type: 'OFFENSE', level: player.upgrades.offense, quantity: 1 },
      { type: 'DEFENSE', level: player.upgrades.defense, quantity: 1 },
      { type: 'SPY', level: player.spyLevel, quantity: 1 },
      { type: 'SENTRY', level: player.sentryLevel, quantity: 1 },
    ],
    attackBonus: player.bonuses.attack,
    defenseBonus: player.bonuses.defense,
    spyBonus: player.bonuses.spy,
    sentryBonus: player.bonuses.sentry,
    bonus_points: [],
    playerBonuses: [],
    spy: spyCount,
    sentry: sentryCount,
    unitTotals: {
      spies:
        player.units.spy + player.units.infiltrator + player.units.assassin,
      infiltrators: player.units.infiltrator,
      assassins: player.units.assassin,
      sentries:
        player.units.sentry + player.units.sentinel + player.units.inquisitor,
      citizens: player.units.citizen,
      workers: player.units.worker,
    },
    spyLimits: {
      all: { perMission: 10, perUser: 10 },
      intel: { perMission: 10, perUser: 10 },
      infil: { perMission: 7, perUser: 5 },
      assass: { perMission: 70, perUser: 4 },
    },
    getLevelForUnit: (type: string) => {
      if (type === 'SPY') return player.spyLevel;
      if (type === 'SENTRY') return player.sentryLevel;
      return player.fortLevel;
    },
  };
}

/** Simulate spy intel. */
export async function simulateSpyIntel(
  attacker: PlayerState,
  defender: PlayerState,
  spyCount: number = 5,
  random: () => number = Math.random,
  turns: number = 1,
): Promise<IntelResult> {
  const attackerUser = playerStateToSpyUser(attacker);
  const defenderUser = playerStateToSpyUser(defender);

  try {
    const result = await (
      await import('../utils/spyFunctions')
    ).simulateIntel(attackerUser as any, defenderUser as any, spyCount, {
      random,
      debug: false,
      turns,
      spyPressureToday: defender.spyPressureToday,
    });

    const intelPayload: IntelPayload | undefined = result.success
      ? {
          units: defender.units,
          fortLevel: defender.fortLevel,
          fortHp: defender.fortHp,
          fortMaxHp: defender.fortMaxHp,
          gold: defender.gold,
          defenseBonus: defender.bonuses.defense,
          spyLevel: defender.spyLevel,
          sentryLevel: defender.sentryLevel,
        }
      : undefined;

    return {
      success: result.success,
      day: 0,
      defenderInfo: intelPayload,
      spyCasualties: (result as any).spiesLost ?? 0,
      spiesSent: spyCount,
    };
  } catch (error) {
    return {
      success: false,
      day: 0,
      spyCasualties: spyCount,
      spiesSent: spyCount,
    };
  }
}

async function simulateSpyAssassination(
  attacker: PlayerState,
  defender: PlayerState,
  spyCount: number = 5,
  targetUnit?: string,
  random: () => number = Math.random,
  turns: number = 3,
): Promise<SpyResult> {
  const attackerUser = playerStateToSpyUser(attacker);
  const defenderUser = playerStateToSpyUser(defender);

  try {
    const result = await (
      await import('../utils/spyFunctions')
    ).simulateAssassination(
      attackerUser as any,
      defenderUser as any,
      spyCount,
      targetUnit as any,
      {
        random,
        turns,
        spyPressureToday: defender.spyPressureToday,
      },
    );

    return {
      mission: 'assassination',
      success: result.success,
      turns,
      targetCasualties: (result as any).unitsKilled ?? 0,
      spyCasualties: (result as any).spiesLost ?? 0,
      spiesSent: spyCount,
    };
  } catch (error) {
    return {
      mission: 'assassination',
      success: false,
      targetCasualties: 0,
      spyCasualties: spyCount,
      spiesSent: spyCount,
    };
  }
}

async function simulateSpyInfiltration(
  attacker: PlayerState,
  defender: PlayerState,
  spyCount: number = 5,
  random: () => number = Math.random,
  turns: number = 2,
): Promise<SpyResult> {
  const attackerUser = playerStateToSpyUser(attacker);
  const defenderUser = playerStateToSpyUser(defender);

  try {
    const result = await (
      await import('../utils/spyFunctions')
    ).simulateInfiltration(attackerUser as any, defenderUser as any, spyCount, {
      random,
      turns,
      spyPressureToday: defender.spyPressureToday,
    });

    return {
      mission: 'infiltration',
      success: result.success,
      turns,
      fortDamage: (result as any).fortDmg ?? (result as any).fortDamage ?? 0,
      spyCasualties: (result as any).spiesLost ?? 0,
      spiesSent: spyCount,
    };
  } catch (error) {
    return {
      mission: 'infiltration',
      success: false,
      fortDamage: 0,
      spyCasualties: spyCount,
      spiesSent: spyCount,
    };
  }
}
