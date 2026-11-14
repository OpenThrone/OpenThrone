/**
 * Live-game rules for the admin balance simulator.
 *
 * The legacy day cycle grants structures on level-up, fights without bonuses
 * and lets every player act on every tick. When `SimulationConfig.live` is set
 * the day cycle uses these helpers instead, so players log in on a schedule,
 * pay the live prices for structures, unlock unit tiers with their fort, heal
 * wounded units and lose battle protection the way live players do.
 */
import { Fortifications } from '../constants';
import { Bonuses } from '../constants/Bonuses';
import { KINGDOM_MORALE_DEFAULT } from '../constants/KingdomMorale';
import {
  ArmoryUpgrades,
  EconomyUpgrades,
  HouseUpgrades,
  OffensiveUpgrades,
  SentryUpgrades,
  SpyUpgrades,
} from '../constants/Structure_Upgrades';
import { UnitTypes } from '../constants/Units';
import {
  calculateBonusPointMultiplier,
  V5_COMBAT_CONSTANTS,
} from '../utils/balance/v5Combat';
import { DEPOSIT_CAP_PERCENT } from '../utils/bankLimits';
import {
  DEFAULT_PROTECTION_DURATION_DAYS,
  getProtectionPopulationThreshold,
  PROTECTION_LEVEL_LIMIT,
} from '../utils/battleProtection';
import { calculateTurnIncome } from './economy';
import type {
  ActivityMix,
  ActivityType,
  BonusPointCategory,
  PlayerState,
  SimGameEvent,
  UnitCounts,
} from './types';

/** How often each kind of player logs in, and how much of the daily recruit clicking they do. */
export const ACTIVITY_PROFILES: Record<
  ActivityType,
  { sessionsPerDay: [number, number] | 'every-tick'; recruitClickShare: number }
> = {
  casual: { sessionsPerDay: [1, 2], recruitClickShare: 0.3 },
  regular: { sessionsPerDay: [3, 5], recruitClickShare: 0.8 },
  active: { sessionsPerDay: [8, 12], recruitClickShare: 1 },
  grinder: { sessionsPerDay: 'every-tick', recruitClickShare: 1 },
};

export const ACTIVITY_TYPES: ActivityType[] = [
  'casual',
  'regular',
  'active',
  'grinder',
];

export const DEFAULT_ACTIVITY_MIX: ActivityMix = {
  casual: 40,
  regular: 35,
  active: 20,
  grinder: 5,
};

/** The event running on sim `day` (1-based), if any. */
export function activeEvent(
  event: SimGameEvent | undefined,
  day: number,
): SimGameEvent | undefined {
  if (!event) return undefined;
  return day >= event.startDay && day < event.startDay + event.days
    ? event
    : undefined;
}

/**
 * Puts `share` percent of the players into alliances of `size` members.
 * Returns the number of alliances formed.
 */
export function formAlliances(
  players: PlayerState[],
  share: number,
  size: number,
  random: () => number,
): number {
  const order = [...players];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const members = Math.floor((order.length * Math.min(100, share)) / 100);
  const groupSize = Math.max(2, Math.floor(size));
  let alliances = 0;
  for (let start = 0; start + 1 < members; start += groupSize) {
    const group = order.slice(start, Math.min(members, start + groupSize));
    if (group.length < 2) break;
    alliances += 1;
    for (const player of group) player.allianceId = `alliance_${alliances}`;
  }
  return alliances;
}

/** True when both players belong to the same alliance. */
export function areAllied(a: PlayerState, b: PlayerState): boolean {
  return a.allianceId !== undefined && a.allianceId === b.allianceId;
}

/** Rounds of decisions a player makes in one login before logging off. */
export const MAX_ROUNDS_PER_SESSION = 8;

const RACES = ['HUMAN', 'ELF', 'UNDEAD', 'GOBLIN'] as const;
const CLASSES = ['FIGHTER', 'CLERIC', 'THIEF', 'ASSASSIN'] as const;

/** A fresh era account, as created by UserDefaults.service. */
const FRESH_PLAYER = { gold: 25000, citizens: 50, attackTurns: 50 };

/** Players who exist when the simulation starts are past their protection window. */
const INITIAL_PLAYER_JOIN_DAY = -DEFAULT_PROTECTION_DURATION_DAYS - 1;

type UnitKey = keyof UnitCounts;

const UNIT_TIERS: Array<{
  key: UnitKey;
  type: string;
  level: number;
  tier1: UnitKey;
}> = [
  { key: 'knight', type: 'OFFENSE', level: 2, tier1: 'soldier' },
  { key: 'berserker', type: 'OFFENSE', level: 3, tier1: 'soldier' },
  { key: 'archer', type: 'DEFENSE', level: 2, tier1: 'guard' },
  { key: 'royalGuard', type: 'DEFENSE', level: 3, tier1: 'guard' },
  { key: 'infiltrator', type: 'SPY', level: 2, tier1: 'spy' },
  { key: 'assassin', type: 'SPY', level: 3, tier1: 'spy' },
  { key: 'sentinel', type: 'SENTRY', level: 2, tier1: 'sentry' },
  { key: 'inquisitor', type: 'SENTRY', level: 3, tier1: 'sentry' },
];

function unitDefinition(type: string, level: number) {
  return UnitTypes.find((unit) => unit.type === type && unit.level === level);
}

function unitCost(type: string, level: number): number {
  return unitDefinition(type, level)?.cost ?? 0;
}

const TIER1_TYPE: Partial<Record<UnitKey, string>> = {
  soldier: 'OFFENSE',
  guard: 'DEFENSE',
  spy: 'SPY',
  sentry: 'SENTRY',
};

/** Splits `count` players by the mix percentages, largest remainder first. */
export function assignActivityTypes(
  count: number,
  mix: ActivityMix,
  random: () => number,
): ActivityType[] {
  const total = ACTIVITY_TYPES.reduce(
    (sum, type) => sum + Math.max(0, mix[type] ?? 0),
    0,
  );
  const weights = ACTIVITY_TYPES.map((type) =>
    total > 0 ? Math.max(0, mix[type] ?? 0) / total : 1 / 4,
  );
  const exact = weights.map((weight) => weight * count);
  const counts = exact.map(Math.floor);
  let remaining = count - counts.reduce((sum, value) => sum + value, 0);
  const order = exact
    .map((value, index) => ({ index, rest: value - Math.floor(value) }))
    .sort((a, b) => b.rest - a.rest);
  for (const { index } of order) {
    if (remaining <= 0) break;
    counts[index] += 1;
    remaining -= 1;
  }
  const types = ACTIVITY_TYPES.flatMap((type, index) =>
    Array.from({ length: counts[index] }, () => type),
  );
  // Shuffle so activity is independent of level and play style.
  for (let i = types.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [types[i], types[j]] = [types[j], types[i]];
  }
  return types;
}

/** Ticks of the day on which a player is logged in. */
export function planSessionTicks(
  activity: ActivityType,
  ticksPerDay: number,
  random: () => number,
): Set<number> {
  const profile = ACTIVITY_PROFILES[activity];
  if (profile.sessionsPerDay === 'every-tick') {
    return new Set(Array.from({ length: ticksPerDay }, (_, tick) => tick));
  }
  const [min, max] = profile.sessionsPerDay;
  const sessions = Math.min(
    ticksPerDay,
    min + Math.floor(random() * (max - min + 1)),
  );
  const ticks = new Set<number>();
  while (ticks.size < sessions) {
    ticks.add(Math.floor(random() * ticksPerDay));
  }
  return ticks;
}

/** Highest fort a player of this level may build. */
export function maxFortLevelForPlayerLevel(level: number): number {
  return Fortifications.filter((fort) => fort.levelRequirement <= level).reduce(
    (best, fort) => Math.max(best, fort.level),
    1,
  );
}

function fortByLevel(level: number) {
  return (
    Fortifications.find((fort) => fort.level === level) ?? Fortifications[0]
  );
}

/** House levels are 1-based in the sim; HouseUpgrades is keyed by a 0-based index. */
export function houseIndex(player: Pick<PlayerState, 'houseLevel'>): number {
  return Math.max(0, player.houseLevel - 1);
}

function houseByIndex(index: number) {
  return HouseUpgrades[index as keyof typeof HouseUpgrades];
}

function maxHouseLevelForFort(fortLevel: number): number {
  return Object.values(HouseUpgrades)
    .filter((house) => house.fortLevel <= fortLevel)
    .reduce((best, house) => Math.max(best, house.level), 1);
}

function maxEconomyLevelForFort(fortLevel: number): number {
  return EconomyUpgrades.filter(
    (upgrade) => upgrade.fortLevel <= fortLevel,
  ).reduce((best, upgrade) => Math.max(best, upgrade.level), 1);
}

function maxClandestineLevelForFort(
  upgrades: Array<{ fortLevelRequirement: number }>,
  fortLevel: number,
): number {
  let best = 1;
  upgrades.forEach((upgrade, index) => {
    if (upgrade.fortLevelRequirement <= fortLevel) best = index + 1;
  });
  return best;
}

/** Bonus percent a player's points give in one category (live diminishing returns). */
export function bonusPointPercent(
  player: Pick<PlayerState, 'bonusPoints'>,
  category: BonusPointCategory,
): number {
  const points = player.bonusPoints?.[category] ?? 0;
  return (calculateBonusPointMultiplier(points) - 1) * 100;
}

/** Sets the derived fort, house, economy and bonus values after a change. */
export function refreshStructureEffects(player: PlayerState): void {
  const fort = fortByLevel(player.fortLevel);
  player.fortMaxHp = fort.hitpoints;
  player.fortHp = Math.min(player.fortHp, fort.hitpoints);
  player.recruitBonus = houseByIndex(houseIndex(player))?.citizensDaily ?? 1;
  const economy =
    EconomyUpgrades.find((upgrade) => upgrade.level === player.economyLevel) ??
    EconomyUpgrades[0];
  player.maximumBankDeposits = economy.depositsPerDay;
  const bonuses = liveCombatBonuses(player);
  player.bonuses.attack = bonuses.attack;
  player.bonuses.defense = bonuses.defense;
  // As UserStatsService.getSpyBonus/getSentryBonus: training structure plus intel.
  player.bonuses.spy =
    (SpyUpgrades.find((upgrade) => upgrade.level === player.spyLevel)
      ?.offenseBonusPercentage ?? 0) + bonuses.intel;
  player.bonuses.sentry =
    (SentryUpgrades[player.sentryLevel - 1]?.defenseBonusPercentage ?? 0) +
    bonuses.intel;
}

function raceClassBonus(player: PlayerState, type: string): number {
  return Bonuses.filter(
    (bonus) =>
      (bonus.race === player.race || bonus.race === player.playerClass) &&
      bonus.bonusType === type,
  ).reduce((total, bonus) => total + (bonus.bonusAmount || 0), 0);
}

/**
 * The attack, defense and intel bonuses the live game gives a player
 * (UserStatsService): race and class, bonus points, the offensive structure
 * for attack and the fort for defense.
 */
export function liveCombatBonuses(player: PlayerState): {
  attack: number;
  defense: number;
  intel: number;
} {
  const offenseStructure =
    OffensiveUpgrades.find(
      (upgrade) => upgrade.level === (player.offenseStructureLevel ?? 1),
    )?.offenseBonusPercentage ?? 0;
  return {
    attack:
      raceClassBonus(player, 'OFFENSE') +
      bonusPointPercent(player, 'OFFENSE') +
      offenseStructure,
    defense:
      raceClassBonus(player, 'DEFENSE') +
      bonusPointPercent(player, 'DEFENSE') +
      fortByLevel(player.fortLevel).defenseBonusPercentage,
    intel: raceClassBonus(player, 'INTEL') + bonusPointPercent(player, 'INTEL'),
  };
}

/** Income bonus percent from race, class and bonus points. */
export function liveIncomeBonus(player: PlayerState): number {
  return raceClassBonus(player, 'INCOME') + bonusPointPercent(player, 'INCOME');
}

/** Moves units of tiers the fort has not unlocked into tier 1 at the same gold value. */
export function demoteLockedUnits(
  units: Partial<UnitCounts>,
  fortLevel: number,
): void {
  for (const tier of UNIT_TIERS) {
    const count = units[tier.key] ?? 0;
    if (count <= 0) continue;
    const required = unitDefinition(tier.type, tier.level)?.fortLevel ?? 1;
    if (fortLevel >= required) continue;
    const tier1Cost = unitCost(TIER1_TYPE[tier.tier1] ?? tier.type, 1) || 1;
    const value = count * unitCost(tier.type, tier.level);
    units[tier.key] = 0;
    units[tier.tier1] =
      (units[tier.tier1] ?? 0) + Math.floor(value / tier1Cost);
  }
}

/** Live repair price for the missing fort hitpoints. */
export function liveRepairCost(player: PlayerState): number {
  const missing = Math.max(0, player.fortMaxHp - player.fortHp);
  return Math.ceil(missing * fortByLevel(player.fortLevel).costPerRepairPoint);
}

/** Citizens a player gains in a day: house growth plus their own and received recruit clicks. */
export function liveDailyCitizens(player: PlayerState): number {
  const share =
    ACTIVITY_PROFILES[player.activity ?? 'regular'].recruitClickShare;
  return (
    player.recruitBonus +
    Math.round(V5_COMBAT_CONSTANTS.BASE_DAILY_SELF_CLICKS * share) +
    V5_COMBAT_CONSTANTS.BASE_DAILY_RECEIVED_CLICKS
  );
}

function totalPopulation(player: PlayerState): number {
  return Object.values(player.units).reduce((sum, count) => sum + count, 0);
}

/**
 * The live protection rule: protected until the first of level 10, the
 * population threshold, or 14 days after joining.
 */
export function isProtectedLive(player: PlayerState, day: number): boolean {
  if (player.level >= PROTECTION_LEVEL_LIMIT) return false;
  const joined = player.joinedOnDay ?? INITIAL_PLAYER_JOIN_DAY;
  if (day - joined >= DEFAULT_PROTECTION_DURATION_DAYS) return false;
  const threshold = getProtectionPopulationThreshold({
    houseLevel: houseIndex(player),
    recruitDailyCap:
      V5_COMBAT_CONSTANTS.BASE_DAILY_SELF_CLICKS +
      V5_COMBAT_CONSTANTS.BASE_DAILY_RECEIVED_CLICKS,
    durationDays: DEFAULT_PROTECTION_DURATION_DAYS,
    startingPopulation: FRESH_PLAYER.citizens,
  });
  return totalPopulation(player) < threshold;
}

/** Pays from gold on hand first, then withdraws the rest from the bank. */
export function pay(player: PlayerState, cost: number): void {
  const fromHand = Math.min(player.gold, cost);
  player.gold -= fromHand;
  player.goldInBank -= cost - fromHand;
}

interface StructurePurchase {
  cost: number;
  apply: () => void;
}

/**
 * Structures the player may build next, in the order a live player tends to
 * buy them: fort, housing, economy, offense, armory, then spy or sentry
 * training. Each needs the live fort (or, for the fort, player) level.
 */
function structureCandidates(player: PlayerState): StructurePurchase[] {
  const candidates: StructurePurchase[] = [];
  const nextFort = Fortifications.find(
    (fort) => fort.level === player.fortLevel + 1,
  );
  if (nextFort && nextFort.levelRequirement <= player.level) {
    candidates.push({
      cost: nextFort.cost,
      apply: () => {
        const hpRatio =
          player.fortMaxHp > 0 ? player.fortHp / player.fortMaxHp : 1;
        player.fortLevel = nextFort.level;
        player.fortHp = Math.ceil(nextFort.hitpoints * hpRatio);
      },
    });
  }
  const nextHouse = houseByIndex(houseIndex(player) + 1);
  if (nextHouse && nextHouse.fortLevel <= player.fortLevel) {
    candidates.push({
      cost: nextHouse.cost,
      apply: () => {
        player.houseLevel = nextHouse.level;
      },
    });
  }
  const nextEconomy = EconomyUpgrades.find(
    (upgrade) => upgrade.level === player.economyLevel + 1,
  );
  if (nextEconomy && nextEconomy.fortLevel <= player.fortLevel) {
    candidates.push({
      cost: nextEconomy.cost,
      apply: () => {
        player.economyLevel = nextEconomy.level;
      },
    });
  }
  const nextOffense = OffensiveUpgrades.find(
    (upgrade) => upgrade.level === (player.offenseStructureLevel ?? 1) + 1,
  );
  if (nextOffense && nextOffense.fortLevelRequirement <= player.fortLevel) {
    candidates.push({
      cost: nextOffense.cost,
      apply: () => {
        player.offenseStructureLevel = nextOffense.level;
      },
    });
  }
  const nextArmory = ArmoryUpgrades.find(
    (upgrade) => upgrade.level === (player.armoryLevel ?? 1) + 1,
  );
  if (nextArmory && nextArmory.fortLevel <= player.fortLevel) {
    candidates.push({
      cost: nextArmory.cost,
      apply: () => {
        player.armoryLevel = nextArmory.level;
      },
    });
  }
  const prefersSpy = player.behavior.spyPreference >= 0.5;
  for (const kind of prefersSpy ? ['spy', 'sentry'] : ['sentry', 'spy']) {
    const upgrades = kind === 'spy' ? SpyUpgrades : SentryUpgrades;
    const next =
      upgrades[kind === 'spy' ? player.spyLevel : player.sentryLevel];
    if (next && next.fortLevelRequirement <= player.fortLevel) {
      candidates.push({
        cost: next.cost,
        apply: () => {
          if (kind === 'spy') player.spyLevel += 1;
          else player.sentryLevel += 1;
        },
      });
    }
  }
  return candidates.filter((candidate) => candidate.cost > 0);
}

/** Price of the first structure the player is allowed to build next, or 0. */
export function nextStructureCost(player: PlayerState): number {
  return structureCandidates(player)[0]?.cost ?? 0;
}

/**
 * Buys at most one structure per call: the first allowed one that costs no
 * more than half of the player's gold on hand and in the bank, so the army
 * keeps growing. Returns the gold spent.
 */
export function buyNextStructure(player: PlayerState): number {
  const wealth = player.gold + player.goldInBank;
  const purchase = structureCandidates(player).find(
    (candidate) => candidate.cost <= wealth * 0.5,
  );
  if (!purchase) return 0;
  pay(player, purchase.cost);
  purchase.apply();
  refreshStructureEffects(player);
  return purchase.cost;
}

/**
 * Banks gold before logging off, as many times as the rolling deposit limit
 * allows. Each deposit is capped at the live share of gold on hand; the bank
 * balance has no upper limit. Returns the gold deposited.
 */
export function bankBeforeLogoff(
  player: PlayerState,
  currentTick: number,
  ticksPerDay: number,
): number {
  // Spread the day's deposits: bank once a deposit's share of daily income is on hand.
  const threshold =
    (calculateTurnIncome(player) * ticksPerDay) /
    Math.max(1, player.maximumBankDeposits);
  let deposited = 0;
  while (
    player.bankDepositHistory.length < player.maximumBankDeposits &&
    player.gold >= threshold
  ) {
    const amount = Math.floor((player.gold * DEPOSIT_CAP_PERCENT) / 100);
    if (amount <= 0) break;
    player.gold -= amount;
    player.goldInBank += amount;
    player.bankDepositHistory.push(currentTick);
    deposited += amount;
  }
  return deposited;
}

/** Brings a generated mid-era player in line with the live unlock rules. */
export function applyLiveRulesToPlayer(
  player: PlayerState,
  activity: ActivityType,
  random: () => number,
  joinedOnDay = INITIAL_PLAYER_JOIN_DAY,
): void {
  player.activity = activity;
  player.joinedOnDay = joinedOnDay;
  if (activity === 'grinder') {
    // The XP grinder: always attacking, whatever play style it rolled.
    player.behavior = {
      ...player.behavior,
      aggression: Math.max(player.behavior.aggression, 0.85),
      riskTolerance: Math.max(player.behavior.riskTolerance, 0.7),
      activityLevel: 1,
      turnStrategy: 'aggressive',
      primaryGoal: 'growth',
      // Attacks at 90+ stamina keep the XP stamina factor at 0.65 or more.
      staminaFloor: 90,
    };
  }
  player.race = RACES[Math.floor(random() * RACES.length)];
  player.playerClass = CLASSES[Math.floor(random() * CLASSES.length)];
  player.fortLevel = Math.min(
    player.fortLevel,
    maxFortLevelForPlayerLevel(player.level),
  );
  player.fortHp = fortByLevel(player.fortLevel).hitpoints;
  player.houseLevel = Math.min(
    player.houseLevel,
    maxHouseLevelForFort(player.fortLevel),
  );
  player.economyLevel = Math.min(
    player.economyLevel,
    maxEconomyLevelForFort(player.fortLevel),
  );
  player.spyLevel = Math.min(
    player.spyLevel,
    maxClandestineLevelForFort(SpyUpgrades, player.fortLevel),
  );
  player.sentryLevel = Math.min(
    player.sentryLevel,
    maxClandestineLevelForFort(SentryUpgrades, player.fortLevel),
  );
  demoteLockedUnits(player.units, player.fortLevel);
  player.inventory = [];
  player.armoryLevel = 1;
  player.offenseStructureLevel = 1;
  player.battleUpgrades = [];
  player.bonusPoints = {
    OFFENSE: 0,
    DEFENSE: 0,
    INCOME: 0,
    INTEL: 0,
    PRICES: 0,
  };
  player.kingdomMorale = KINGDOM_MORALE_DEFAULT;
  player.desertionFloor = undefined;
  player.wounded = {};
  player.simStats = createSimStats(player);
  refreshStructureEffects(player);
}

/** Turns a generated player into a brand-new era account joining on `day`. */
export function makeFreshPlayer(
  player: PlayerState,
  activity: ActivityType,
  random: () => number,
  day: number,
): void {
  player.level = 1;
  player.xp = 0;
  player.gold = FRESH_PLAYER.gold;
  player.goldInBank = 0;
  player.attackTurns = FRESH_PLAYER.attackTurns;
  player.fortLevel = 1;
  player.houseLevel = 1;
  player.economyLevel = 1;
  player.spyLevel = 1;
  player.sentryLevel = 1;
  player.upgrades = { offense: 0, defense: 0 };
  for (const key of Object.keys(player.units) as UnitKey[]) {
    player.units[key] = 0;
  }
  player.units.citizen = FRESH_PLAYER.citizens;
  applyLiveRulesToPlayer(player, activity, random, day);
}

/** Returns a fresh counter set, recording where the player started. */
export function createSimStats(
  player: Pick<PlayerState, 'xp' | 'level' | 'attackTurns'>,
): NonNullable<PlayerState['simStats']> {
  return {
    attacks: 0,
    attackWins: 0,
    defenses: 0,
    defenseWins: 0,
    turnsSpent: 0,
    lootGained: 0,
    lootLost: 0,
    sessions: 0,
    startXp: player.xp,
    startLevel: player.level,
    startTurns: player.attackTurns,
    deserted: 0,
    mercenariesHired: 0,
    captivesTaken: 0,
    turnsGenerated: 0,
  };
}

/** Moves the wounded share of battle losses into the wounded pool. */
export function recordWounded(
  player: PlayerState,
  wounded: Partial<UnitCounts> | undefined,
): void {
  if (!wounded) return;
  player.wounded = player.wounded ?? {};
  for (const [key, count] of Object.entries(wounded) as Array<
    [UnitKey, number]
  >) {
    if (count > 0) player.wounded[key] = (player.wounded[key] ?? 0) + count;
  }
}

/** Returns the daily share of wounded units to active duty. */
export function healWounded(player: PlayerState): void {
  if (!player.wounded) return;
  for (const [key, count] of Object.entries(player.wounded) as Array<
    [UnitKey, number]
  >) {
    if (count <= 0) continue;
    // As CronJob.service: at least one unit heals each day.
    const healed = Math.min(
      count,
      Math.max(
        1,
        Math.floor(count * V5_COMBAT_CONSTANTS.WOUNDED_HEAL_RATE_DAILY),
      ),
    );
    player.units[key] += healed;
    player.wounded[key] = count - healed;
  }
}
