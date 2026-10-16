import { Fortifications, SpyUpgrades } from '@/constants';
import type {
  ItemType,
  ItemUsage,
  PlayerItem,
  PlayerUnit,
  UnitType,
} from '@/types/typings';
import { requireRandom } from '@/utils/random';
import {
  CITIZEN_WORKERS_TARGET,
  type SpyMissionUser,
} from '@/utils/spy/results';
import {
  simulateAssassination,
  simulateInfiltration,
  simulateIntel,
} from '@/utils/spyFunctions';

import {
  getBattleConstants,
  setBattleConstants,
  simulateBattle,
} from '../utils/attackFunctions';
import { assertGoldQuantity } from './invariants';
import { computeArmyCost, createSimPlayer } from './presets';
import { createDefaultRandom, createValidatedRandom } from './random';
import {
  applyDefenderDailyCap,
  getRuleset,
  isProtectedByLowLevelRule,
} from './rulesets';
import type {
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

export const UNIT_MAPPING: readonly {
  key: keyof UnitCounts;
  type: UnitType;
  level: number;
}[] = [
  { key: 'soldier', type: 'OFFENSE', level: 1 },
  { key: 'knight', type: 'OFFENSE', level: 2 },
  { key: 'berserker', type: 'OFFENSE', level: 3 },
  { key: 'guard', type: 'DEFENSE', level: 1 },
  { key: 'archer', type: 'DEFENSE', level: 2 },
  { key: 'royalGuard', type: 'DEFENSE', level: 3 },
  { key: 'spy', type: 'SPY', level: 1 },
  { key: 'infiltrator', type: 'SPY', level: 2 },
  { key: 'assassin', type: 'SPY', level: 3 },
  { key: 'sentry', type: 'SENTRY', level: 1 },
  { key: 'sentinel', type: 'SENTRY', level: 2 },
  { key: 'inquisitor', type: 'SENTRY', level: 3 },
  { key: 'citizen', type: 'CITIZEN', level: 1 },
  { key: 'worker', type: 'WORKER', level: 1 },
];

function createRoster(units: UnitCounts): PlayerUnit[] {
  return UNIT_MAPPING.filter(({ key }) => units[key] > 0).map(
    ({ key, type, level }, index) => ({
      id: index,
      userId: 0,
      type,
      level,
      quantity: units[key],
      isMercenary: false,
    }),
  );
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

function simPlayerToBattleUser(player: SimPlayer) {
  assertGoldQuantity(player.gold, 'gold', { day: 0, playerId: player.id });
  return {
    id: player.id,
    displayName: player.displayName,
    level: player.level,
    experience: player.xp ?? 0,
    class: player.playerClass ?? 'FIGHTER',
    houseLevel: player.houseLevel ?? 1,
    stamina: player.stamina ?? 100,
    defensePressureToday: player.defensePressureToday ?? 0,
    race: player.race ?? 'HUMAN',
    fortLevel: player.fortLevel,
    fortHitpoints: player.fortHp,
    gold: BigInt(player.gold),
    units: createRoster(player.units),
    mercenaries: [],
    items: createBattleItems(player),
    structure_upgrades: [],
    battle_upgrades: [
      { type: 'OFFENSE', level: player.upgrades.offense, quantity: 1 },
      { type: 'DEFENSE', level: player.upgrades.defense, quantity: 1 },
    ],
    attackBonus: player.bonuses.attack,
    defenseBonus: player.bonuses.defense,
  };
}

function battleResultToMetrics(
  result: any,
  attacker: SimPlayer,
  defender: SimPlayer,
  armyCost: number,
): BattleMetrics {
  const casualtySummary = result.casualtySummary ?? {};
  const attackerCas = [
    ...(casualtySummary.attacker ?? []),
    ...(casualtySummary.wounded?.attacker ?? []),
  ];
  const defenderCas = [
    ...(casualtySummary.defender ?? []),
    ...(casualtySummary.wounded?.defender ?? []),
  ];

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

  for (const [rows, totals] of [
    [attackerCas, attackerCasualties],
    [defenderCas, defenderCasualties],
  ] as const) {
    for (const casualty of rows) {
      const mapping = UNIT_MAPPING.find(
        (entry) =>
          entry.type === casualty.type && entry.level === casualty.level,
      );
      if (mapping) totals[mapping.key] += casualty.quantity ?? 0;
    }
  }
  const attackerUnitsRemaining = { ...attacker.units };
  const defenderUnitsRemaining = { ...defender.units };
  for (const { key } of UNIT_MAPPING) {
    attackerUnitsRemaining[key] = Math.max(
      0,
      attacker.units[key] - attackerCasualties[key],
    );
    defenderUnitsRemaining[key] = Math.max(
      0,
      defender.units[key] - defenderCasualties[key],
    );
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
    attackerUnitsRemaining,
    defenderUnitsRemaining,
  };
}

/**
 * Process-global lock that forbids overlapping same-process battle
 * overrides. When true, a `runSingleBattle` call has installed overrides
 * via `setBattleConstants` and not yet restored them; any concurrent
 * `runSingleBattle` invocation would observe corrupted constants.
 *
 * Matrix concurrency MUST use child-process isolation (one Bun process
 * per scenario) so this lock never needs to be cross-process aware.
 */
let battleOverrideActive = false;

/** Run single battle. */
export async function runSingleBattle(
  attacker: SimPlayer,
  defender: SimPlayer,
  config?: BattleConfig,
): Promise<BattleMetrics> {
  const attackerUser = simPlayerToBattleUser(attacker);
  const defenderUser = simPlayerToBattleUser(defender);

  const ruleset = config?.rulesetId ? getRuleset(config.rulesetId) : undefined;
  const maxTurns = config?.maxTurns ?? 10;
  const isDefenderProtected = resolveDefenderProtection(
    config,
    defender,
    ruleset,
  );
  const random = createValidatedRandom(config?.random ?? createDefaultRandom());
  const originalConstants = getBattleConstants();
  const overrides = battleConfigToOverrides(config);
  const hasOverrides = Object.keys(overrides).length > 0;

  if (hasOverrides && battleOverrideActive) {
    throw new Error(
      'runSingleBattle cannot install battle-constant overrides while another override is active in this process. ' +
        'Run scenarios in isolated child processes for matrix concurrency.',
    );
  }

  if (hasOverrides) {
    battleOverrideActive = true;
    setBattleConstants(overrides as any);
  }

  let result: Awaited<ReturnType<typeof simulateBattle>>;
  try {
    result = await simulateBattle(
      attackerUser,
      defenderUser,
      defender.fortHp,
      maxTurns,
      false,
      isDefenderProtected,
      {
        random,
        defenderDailyCasualtyRemaining: config?.defenderDailyCasualtyRemaining,
        defenderDailyGoldRemaining:
          config?.defenderDailyGoldRemaining === undefined
            ? undefined
            : BigInt(
                Math.max(0, Math.floor(config.defenderDailyGoldRemaining)),
              ),
      },
    );
  } finally {
    if (hasOverrides) {
      setBattleConstants(originalConstants as any);
      battleOverrideActive = false;
    }
  }

  const armyCost = computeArmyCost(attacker);
  const metrics = battleResultToMetrics(result, attacker, defender, armyCost);
  return applyCandidateDailyCapIfConfigured(metrics, defender, config, ruleset);
}

function resolveDefenderProtection(
  config: BattleConfig | undefined,
  defender: SimPlayer,
  ruleset: ReturnType<typeof getRuleset> | undefined,
): boolean {
  if (config?.isDefenderProtected !== undefined) {
    return config.isDefenderProtected;
  }
  if (ruleset) {
    return isProtectedByLowLevelRule(ruleset, defender.level);
  }
  return defender.level <= 9;
}

/**
 * When the active ruleset has a defender-wide daily casualty cap and the
 * caller has supplied a daily usage tracker, clip the post-battle
 * defender casualties to respect the remaining daily allowance.
 *
 * The function reads but does NOT mutate `dailyCasualtyCapUsage`; the
 * scenario runner is responsible for accumulating the returned
 * casualties into its own usage state. Reduction is applied
 * proportionally across lost unit types so no single unit absorbs the
 * entire clip.
 */
function applyCandidateDailyCapIfConfigured(
  metrics: BattleMetrics,
  defender: SimPlayer,
  config: BattleConfig | undefined,
  ruleset: ReturnType<typeof getRuleset> | undefined,
): BattleMetrics {
  if (!ruleset || ruleset.dailyPopulationCap == null) return metrics;
  if (!config?.dailyCasualtyCapUsage) return metrics;

  const pendingTotal = sumDefenderCasualties(metrics.defenderCasualties);
  if (pendingTotal <= 0) return metrics;

  const { allowed } = applyDefenderDailyCap({
    manifest: ruleset,
    usage: config.dailyCasualtyCapUsage,
    pendingCasualties: pendingTotal,
  });

  if (allowed >= pendingTotal) return metrics;
  const scale = pendingTotal > 0 ? allowed / pendingTotal : 0;
  const scaled: UnitCounts = { ...metrics.defenderCasualties };
  const defenderUnitsRemaining: UnitCounts = { ...defender.units };
  (Object.keys(scaled) as (keyof UnitCounts)[]).forEach((key) => {
    scaled[key] = Math.floor(scaled[key] * scale);
    defenderUnitsRemaining[key] = Math.max(
      0,
      defender.units[key] - scaled[key],
    );
  });
  return { ...metrics, defenderCasualties: scaled, defenderUnitsRemaining };
}

function sumDefenderCasualties(casualties: UnitCounts): number {
  let total = 0;
  (Object.keys(casualties) as (keyof UnitCounts)[]).forEach((key) => {
    total += casualties[key];
  });
  return total;
}

/** Run simulation. */
export async function runSimulation(
  attackerConfig: SimPlayer,
  defenderConfig: SimPlayer,
  iterations: number = 1000,
  config?: BattleConfig,
): Promise<SimulationResults> {
  const results: BattleMetrics[] = [];
  const ownedRandom = config?.random ?? createDefaultRandom();
  const battleConfig: BattleConfig | undefined =
    config?.random != null ? config : { ...config, random: ownedRandom };

  for (let i = 0; i < iterations; i++) {
    const attacker = createSimPlayer({ ...attackerConfig, id: `att_${i}` });
    const defender = createSimPlayer({ ...defenderConfig, id: `def_${i}` });

    const result = await runSingleBattle(attacker, defender, battleConfig);
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

/** PlayerState has stockpile counters but no spy gear/mercenary inventory.
 * Preserve its represented combat gear and explicit bonuses; never invent a loadout.
 */
function playerStateToSpyUser(player: PlayerState): SpyMissionUser {
  const user = simPlayerToBattleUser(player);
  const upgrade = SpyUpgrades.find((entry) => entry.level === player.spyLevel);
  return {
    ...user,
    goldInBank: BigInt(player.goldInBank),
    structure_upgrades: [
      { type: 'SPY', level: player.spyLevel },
      { type: 'SENTRY', level: player.sentryLevel },
    ],
    spyBonus: player.bonuses.spy,
    sentryBonus: player.bonuses.sentry,
    spyPressureToday: player.spyPressureToday,
    spyLimits: {
      infil: { perMission: upgrade?.maxInfiltratorsPerMission ?? 0 },
      assass: { perMission: upgrade?.maxAssassinsPerMission ?? 0 },
    },
  };
}

function rosterDeltas(
  before: UnitCounts,
  after: SpyMissionUser,
): Partial<UnitCounts> {
  const remaining: UnitCounts = { ...before };
  for (const { key } of UNIT_MAPPING) remaining[key] = 0;
  for (const roster of [after.units, after.mercenaries ?? []]) {
    for (const unit of roster) {
      const mapping = UNIT_MAPPING.find(
        (entry) => entry.type === unit.type && entry.level === unit.level,
      );
      if (mapping) remaining[mapping.key] += unit.quantity;
    }
  }
  const deltas: Partial<UnitCounts> = {};
  for (const { key } of UNIT_MAPPING) {
    if (remaining[key] !== before[key])
      deltas[key] = remaining[key] - before[key];
  }
  return deltas;
}

/** Pure wrappers return only observed intel and exact mutations for callers to apply once. */
export async function simulateSpyIntel(
  attacker: PlayerState,
  defender: PlayerState,
  spyCount: number,
  random: () => number,
  turns = 1,
): Promise<IntelResult> {
  const attackerUser = playerStateToSpyUser(attacker);
  const defenderUser = playerStateToSpyUser(defender);
  const result = simulateIntel(attackerUser, defenderUser, spyCount, {
    random: createValidatedRandom(requireRandom(random)),
    turns,
    spyPressureToday: defender.spyPressureToday,
  });
  const gathered = result.intelligenceGathered;
  let defenderInfo: IntelPayload | undefined;
  if (result.success && gathered) {
    defenderInfo = {};
    if (gathered.units !== null) {
      defenderInfo.units = {};
      for (const unit of gathered.units) {
        const mapping = UNIT_MAPPING.find(
          (entry) => entry.type === unit.type && entry.level === unit.level,
        );
        if (mapping)
          defenderInfo.units[mapping.key] =
            (defenderInfo.units[mapping.key] ?? 0) + unit.quantity;
      }
      if (result.intelPercentage === 100) {
        for (const { key } of UNIT_MAPPING) defenderInfo.units[key] ??= 0;
      }
    }
    if (gathered.fortLevel !== null) {
      defenderInfo.fortLevel = gathered.fortLevel;
      defenderInfo.fortMaxHp = Fortifications.find(
        (fort) => fort.level === gathered.fortLevel,
      )?.hitpoints;
    }
    if (gathered.fortHitpoints !== null)
      defenderInfo.fortHp = gathered.fortHitpoints;
    if (gathered.defenseBonus !== null)
      defenderInfo.defenseBonus = gathered.defenseBonus;
    if (gathered.spyLevel !== null) defenderInfo.spyLevel = gathered.spyLevel;
    if (gathered.sentryLevel !== null)
      defenderInfo.sentryLevel = gathered.sentryLevel;
    if (gathered.gold !== null) defenderInfo.gold = Number(gathered.gold);
  }
  return {
    success: result.success,
    day: 0,
    defenderInfo,
    spyCasualties: result.spiesLost,
    spiesSent: result.spiesSent,
    attackerCasualtyDeltas: rosterDeltas(attacker.units, attackerUser),
    defenderCasualtyDeltas: rosterDeltas(defender.units, defenderUser),
  };
}

/** Shared daily assassination caps, mirroring SpyService's locked lookups. */
export interface AssassinationDailyCaps {
  defenderDailyCasualtyRemaining?: number;
  targetTypeDailyRemaining?: number;
}

export async function simulateSpyAssassination(
  attacker: PlayerState,
  defender: PlayerState,
  spyCount: number,
  targetUnit: UnitType | typeof CITIZEN_WORKERS_TARGET | undefined,
  random: () => number,
  turns = 3,
  caps: AssassinationDailyCaps = {},
): Promise<SpyResult> {
  const attackerUser = playerStateToSpyUser(attacker);
  const defenderUser = playerStateToSpyUser(defender);
  const result = simulateAssassination(
    attackerUser,
    defenderUser,
    spyCount,
    targetUnit ?? CITIZEN_WORKERS_TARGET,
    {
      random: createValidatedRandom(requireRandom(random)),
      turns,
      spyPressureToday: defender.spyPressureToday,
      defenderDailyCasualtyRemaining: caps.defenderDailyCasualtyRemaining,
      targetTypeDailyRemaining: caps.targetTypeDailyRemaining,
    },
  );
  return {
    mission: 'assassination',
    success: result.success,
    turns: result.turns,
    targetCasualties: result.unitsKilled,
    spyCasualties: result.spiesLost,
    spiesSent: result.spiesSent,
    attackerCasualtyDeltas: rosterDeltas(attacker.units, attackerUser),
    defenderCasualtyDeltas: rosterDeltas(defender.units, defenderUser),
  };
}

export async function simulateSpyInfiltration(
  attacker: PlayerState,
  defender: PlayerState,
  spyCount: number,
  random: () => number,
  turns = 2,
): Promise<SpyResult> {
  const attackerUser = playerStateToSpyUser(attacker);
  const defenderUser = playerStateToSpyUser(defender);
  const result = simulateInfiltration(attackerUser, defenderUser, spyCount, {
    random: createValidatedRandom(requireRandom(random)),
    turns,
    spyPressureToday: defender.spyPressureToday,
  });
  return {
    mission: 'infiltration',
    success: result.success,
    turns: result.turns,
    fortDamage: result.fortDmg,
    spyCasualties: result.spiesLost,
    spiesSent: result.spiesSent,
    attackerCasualtyDeltas: rosterDeltas(attacker.units, attackerUser),
    defenderCasualtyDeltas: rosterDeltas(defender.units, defenderUser),
  };
}
