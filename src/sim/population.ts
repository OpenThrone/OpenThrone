import { Fortifications } from '../constants';
import {
  EconomyUpgrades,
  HouseUpgrades,
} from '../constants/Structure_Upgrades';
import { getXpFloorForLevel } from './progression';
import {
  BehaviorParams,
  PlayerState,
  PlayStyle,
  TurnStrategy,
  UnitCounts,
} from './types';

const UNIT_COSTS: Record<keyof UnitCounts, number> = {
  soldier: 1500,
  knight: 10000,
  berserker: 25000,
  guard: 1500,
  archer: 10000,
  royalGuard: 25000,
  spy: 1500,
  infiltrator: 10000,
  assassin: 25000,
  sentry: 1500,
  sentinel: 10000,
  inquisitor: 25000,
  citizen: 0,
  worker: 2000,
};

export const DAILY_CITIZEN_GRANT = 250;

const DEFAULT_UNITS: UnitCounts = {
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

function getFortificationByLevel(level: number) {
  return Fortifications.find((f) => f.level === level) ?? Fortifications[0];
}

function getEconomyByLevel(level: number) {
  return EconomyUpgrades.find((e) => e.level === level) ?? EconomyUpgrades[0];
}

function seededRandom(seed: number): () => number {
  let state = Math.abs(Math.floor(seed)) || 1;
  return () => {
    state = (state * 48271) % 2147483647;
    return state / 2147483647;
  };
}

function generateBehaviorForStyle(
  style: PlayStyle,
  random: () => number,
): BehaviorParams {
  const base: Record<PlayStyle, Partial<BehaviorParams>> = {
    aggressive: {
      aggression: 0.8,
      riskTolerance: 0.7,
      activityLevel: 0.9,
      wealthPreference: 0.3,
      spyPreference: 0.4,
      turnStrategy: 'aggressive' as TurnStrategy,
      primaryGoal: 'dominance',
    },
    defensive: {
      aggression: 0.2,
      riskTolerance: 0.3,
      activityLevel: 0.8,
      wealthPreference: 0.7,
      spyPreference: 0.6,
      turnStrategy: 'conservative' as TurnStrategy,
      primaryGoal: 'defense',
    },
    balanced: {
      aggression: 0.5,
      riskTolerance: 0.5,
      activityLevel: 0.7,
      wealthPreference: 0.5,
      spyPreference: 0.5,
      turnStrategy: 'balanced' as TurnStrategy,
      primaryGoal: 'growth',
    },
    economist: {
      aggression: 0.3,
      riskTolerance: 0.4,
      activityLevel: 0.6,
      wealthPreference: 0.9,
      spyPreference: 0.3,
      turnStrategy: 'balanced' as TurnStrategy,
      primaryGoal: 'wealth',
    },
    'spy-focused': {
      aggression: 0.4,
      riskTolerance: 0.5,
      activityLevel: 0.7,
      wealthPreference: 0.4,
      spyPreference: 0.9,
      turnStrategy: 'conservative' as TurnStrategy,
      primaryGoal: 'wealth',
    },
  };

  const b = base[style];
  return {
    aggression: b.aggression! + (random() - 0.5) * 0.2,
    riskTolerance: b.riskTolerance! + (random() - 0.5) * 0.2,
    activityLevel: b.activityLevel! + (random() - 0.5) * 0.2,
    wealthPreference: b.wealthPreference! + (random() - 0.5) * 0.2,
    spyPreference: b.spyPreference! + (random() - 0.5) * 0.2,
    turnStrategy: b.turnStrategy!,
    playStyle: style,
    primaryGoal: b.primaryGoal!,
  };
}

function getUnitsForLevel(level: number): UnitCounts {
  const baseOffense = Math.floor(10 + level * 5);
  const baseDefense = Math.floor(10 + level * 5);
  const baseSpy = Math.floor(4 + level * 1.6);
  const baseSentry = Math.floor(4 + level * 1.8);

  return {
    soldier: Math.floor(baseOffense * 0.6),
    knight: Math.floor(baseOffense * 0.25),
    berserker: Math.floor(baseOffense * 0.15),
    guard: Math.floor(baseDefense * 0.6),
    archer: Math.floor(baseDefense * 0.25),
    royalGuard: Math.floor(baseDefense * 0.15),
    spy: Math.floor(baseSpy * 0.7),
    infiltrator: level >= 8 ? Math.floor(baseSpy * 0.2) : 0,
    assassin: level >= 12 ? Math.floor(baseSpy * 0.1) : 0,
    sentry: Math.floor(baseSentry * 0.7),
    sentinel: level >= 8 ? Math.floor(baseSentry * 0.2) : 0,
    inquisitor: level >= 12 ? Math.floor(baseSentry * 0.1) : 0,
    citizen: 0,
    worker: Math.floor(level * 2),
  };
}

function getSpyLevelForPlayerLevel(playerLevel: number): number {
  return Math.min(22, Math.max(1, Math.floor(playerLevel / 3)));
}

function getSentryLevelForPlayerLevel(playerLevel: number): number {
  return Math.min(22, Math.max(1, Math.floor(playerLevel / 3)));
}

function getEconomyLevelForPlayerLevel(playerLevel: number): number {
  return Math.min(7, Math.max(1, Math.floor(playerLevel / 3)));
}

function getHouseLevelForPlayerLevel(playerLevel: number): number {
  return Math.min(7, Math.max(1, Math.floor(playerLevel / 4)));
}

function getRecruitBonusForHouseLevel(houseLevel: number): number {
  const house =
    HouseUpgrades[(houseLevel - 1) as keyof typeof HouseUpgrades] ??
    HouseUpgrades[0];
  return house?.citizensDaily ?? 1;
}

function getMaximumBankDepositsForEconomyLevel(economyLevel: number): number {
  const economy =
    EconomyUpgrades.find((upgrade) => upgrade.level === economyLevel) ??
    EconomyUpgrades[0];
  return economy?.depositsPerDay ?? 3;
}

function getGoldForLevel(level: number): number {
  const goldByLevel: Record<number, number> = {
    1: 10000,
    2: 25000,
    3: 50000,
    4: 75000,
    5: 100000,
    6: 150000,
    7: 200000,
    8: 300000,
    9: 400000,
    10: 500000,
    11: 650000,
    12: 800000,
    13: 1000000,
    14: 1200000,
    15: 1500000,
    16: 1800000,
    17: 2100000,
    18: 2500000,
    19: 3000000,
    20: 4000000,
  };
  return goldByLevel[level] ?? goldByLevel[20];
}

/** Generate population. */
export function generatePopulation(
  size: number,
  levelRange: [number, number],
  seed?: number,
): PlayerState[] {
  const random = seededRandom(seed ?? Date.now());
  const [minLevel, maxLevel] = levelRange;
  const players: PlayerState[] = [];

  const styles: PlayStyle[] = [
    'aggressive',
    'defensive',
    'balanced',
    'economist',
    'spy-focused',
  ];

  for (let i = 0; i < size; i++) {
    const level = Math.floor(random() * (maxLevel - minLevel + 1)) + minLevel;
    const style = styles[Math.floor(random() * styles.length)];
    const behavior = generateBehaviorForStyle(style, random);
    const fortLevel = Math.max(1, Math.floor(level / 3));
    const houseLevel = getHouseLevelForPlayerLevel(level);
    const economyLevel = getEconomyLevelForPlayerLevel(level);
    const fortification = getFortificationByLevel(fortLevel);
    const units = getUnitsForLevel(level);

    const totalOffense = units.soldier + units.knight * 2 + units.berserker * 3;
    const totalDefense = units.guard + units.archer * 2 + units.royalGuard * 3;

    const player: PlayerState = {
      id: `player_${i}`,
      displayName: `Player ${i}`,
      level,
      xp: getXpFloorForLevel(level),
      houseLevel,
      race: 'HUMAN',
      playerClass: 'FIGHTER',
      gold: Math.floor(getGoldForLevel(level) * (0.8 + random() * 0.4)),
      goldInBank: Math.floor(getGoldForLevel(level) * (0.5 + random() * 0.5)),
      attackTurns: 50,
      stamina: 100,
      maxStamina: 100,
      defensePressureToday: 0,
      spyPressureToday: 0,
      units,
      items: {
        meleeAtk: 0,
        meleeDef: 0,
        rangedAtk: 0,
        rangedDef: 0,
      },
      upgrades: {
        offense: Math.floor(level / 3),
        defense: Math.floor(level / 3),
      },
      fortLevel,
      fortHp: fortification.hitpoints,
      fortMaxHp: fortification.hitpoints,
      spyLevel: getSpyLevelForPlayerLevel(level),
      sentryLevel: getSentryLevelForPlayerLevel(level),
      economyLevel,
      bonuses: {
        attack: 0,
        defense: 0,
        spy: 0,
        sentry: 0,
      },
      recruitBonus: getRecruitBonusForHouseLevel(houseLevel),
      maximumBankDeposits: getMaximumBankDepositsForEconomyLevel(economyLevel),
      dailyLimits: {
        attacksUsed: 0,
        intelUsed: 0,
        assassinationUsed: 0,
        infiltrationUsed: 0,
      },
      behavior,
      intelCache: new Map(),
      attackHistory: new Map(),
      incomingAttackHistory: new Map(),
      targetMemory: new Map(),
      bankDepositHistory: [],
      status: 'active',
    };

    players.push(player);
  }

  return players;
}

/** Create player state. */
export function createPlayerState(
  level: number,
  playStyle: PlayStyle = 'balanced',
  seed?: number,
): PlayerState {
  const random = seededRandom(seed ?? Date.now());
  const behavior = generateBehaviorForStyle(playStyle, random);
  const fortLevel = Math.max(1, Math.floor(level / 3));
  const houseLevel = getHouseLevelForPlayerLevel(level);
  const economyLevel = getEconomyLevelForPlayerLevel(level);
  const fortification = getFortificationByLevel(fortLevel);
  const units = getUnitsForLevel(level);

  return {
    id: `player_${Math.random().toString(36).slice(2, 9)}`,
    displayName: `Player ${level}`,
    level,
    xp: getXpFloorForLevel(level),
    houseLevel,
    race: 'HUMAN',
    playerClass: 'FIGHTER',
    gold: getGoldForLevel(level),
    goldInBank: getGoldForLevel(level),
    attackTurns: 50,
    stamina: 100,
    maxStamina: 100,
    defensePressureToday: 0,
    spyPressureToday: 0,
    units,
    items: {
      meleeAtk: 0,
      meleeDef: 0,
      rangedAtk: 0,
      rangedDef: 0,
    },
    upgrades: {
      offense: Math.floor(level / 3),
      defense: Math.floor(level / 3),
    },
    fortLevel,
    fortHp: fortification.hitpoints,
    fortMaxHp: fortification.hitpoints,
    spyLevel: getSpyLevelForPlayerLevel(level),
    sentryLevel: getSentryLevelForPlayerLevel(level),
    economyLevel,
    bonuses: {
      attack: 0,
      defense: 0,
      spy: 0,
      sentry: 0,
    },
    recruitBonus: getRecruitBonusForHouseLevel(houseLevel),
    maximumBankDeposits: getMaximumBankDepositsForEconomyLevel(economyLevel),
    dailyLimits: {
      attacksUsed: 0,
      intelUsed: 0,
      assassinationUsed: 0,
      infiltrationUsed: 0,
    },
    behavior,
    intelCache: new Map(),
    attackHistory: new Map(),
    incomingAttackHistory: new Map(),
    targetMemory: new Map(),
    bankDepositHistory: [],
    status: 'active',
  };
}

/** Returns spy mission limits for callers that need normalized game data. */
export function getSpyMissionLimits(spyLevel: number): {
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

function getAssassinationLimits(spyLevel: number): {
  maxPerDay: number;
  maxPerUser: number;
  maxPerMission: number;
} {
  if (spyLevel < 16) {
    return { maxPerDay: 0, maxPerUser: 0, maxPerMission: 0 };
  }
  if (spyLevel === 16) {
    return { maxPerDay: 10, maxPerUser: 1, maxPerMission: 10 };
  }
  if (spyLevel <= 20) {
    return { maxPerDay: 20, maxPerUser: 2, maxPerMission: 40 };
  }
  return { maxPerDay: 40, maxPerUser: 4, maxPerMission: 70 };
}

function getInfiltrationLimits(spyLevel: number): {
  maxPerDay: number;
  maxPerUser: number;
  maxPerMission: number;
} {
  if (spyLevel < 7) {
    return { maxPerDay: 0, maxPerUser: 0, maxPerMission: 0 };
  }
  if (spyLevel <= 10) {
    return {
      maxPerDay: Math.max(1, spyLevel - 6),
      maxPerUser: 1,
      maxPerMission: 4,
    };
  }
  if (spyLevel <= 15) {
    return { maxPerDay: spyLevel - 5, maxPerUser: 2, maxPerMission: 7 };
  }
  return {
    maxPerDay: Math.min(spyLevel, 16),
    maxPerUser: 5,
    maxPerMission: 7,
  };
}

export { UNIT_COSTS };
