import { Fortifications } from '../constants';
import { PlayerConfig, SimPlayer, UnitCounts } from './types';

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

const DEFAULT_ITEMS = {
  meleeAtk: 0,
  meleeDef: 0,
  rangedAtk: 0,
  rangedDef: 0,
};

const DEFAULT_BONUSES = {
  attack: 0,
  defense: 0,
};

const DEFAULT_UPGRADES = {
  offense: 0,
  defense: 0,
};

export function createSimPlayer(config: PlayerConfig): SimPlayer {
  const fortLevel =
    config.fortLevel ?? Math.max(1, Math.floor(config.level / 3));
  const fortification =
    Fortifications.find((f) => f.level === fortLevel) ?? Fortifications[0];

  const defaultUnits: UnitCounts = {
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

  return {
    id: config.id ?? `player_${Math.random().toString(36).slice(2, 9)}`,
    displayName: config.displayName ?? `Player ${config.level}`,
    level: config.level,
    xp: config.xp,
    houseLevel: config.houseLevel,
    race: config.race,
    playerClass: config.playerClass,
    gold: config.gold,
    units: { ...defaultUnits, ...config.units },
    items: { ...DEFAULT_ITEMS, ...config.items },
    upgrades: { ...DEFAULT_UPGRADES, ...config.upgrades },
    fortLevel,
    fortHp: config.fortHp ?? fortification.hitpoints,
    stamina: config.stamina,
    defensePressureToday: config.defensePressureToday,
    bonuses: { ...DEFAULT_BONUSES, ...config.bonuses },
  };
}

export function computeArmyCost(player: SimPlayer): number {
  let cost = 0;
  const { units } = player;

  cost += units.soldier * UNIT_COSTS.soldier;
  cost += units.knight * UNIT_COSTS.knight;
  cost += units.berserker * UNIT_COSTS.berserker;
  cost += units.guard * UNIT_COSTS.guard;
  cost += units.archer * UNIT_COSTS.archer;
  cost += units.royalGuard * UNIT_COSTS.royalGuard;
  cost += units.spy * UNIT_COSTS.spy;
  cost += units.infiltrator * UNIT_COSTS.infiltrator;
  cost += units.assassin * UNIT_COSTS.assassin;
  cost += units.sentry * UNIT_COSTS.sentry;
  cost += units.sentinel * UNIT_COSTS.sentinel;
  cost += units.inquisitor * UNIT_COSTS.inquisitor;
  cost += units.worker * UNIT_COSTS.worker;

  return cost;
}

export function getTotalOffense(units: UnitCounts): number {
  return units.soldier + units.knight * 2 + units.berserker * 3;
}

export function getTotalDefense(units: UnitCounts): number {
  return units.guard + units.archer * 2 + units.royalGuard * 3;
}

export function getTotalUnits(units: UnitCounts): number {
  return (
    units.soldier +
    units.knight +
    units.berserker +
    units.guard +
    units.archer +
    units.royalGuard +
    units.spy +
    units.infiltrator +
    units.assassin +
    units.sentry +
    units.sentinel +
    units.inquisitor +
    units.citizen +
    units.worker
  );
}

export function getUnitCountForLevel(
  level: number,
  unitType: keyof UnitCounts,
): number {
  const baseUnits: Record<number, Partial<UnitCounts>> = {
    1: { soldier: 10 },
    2: { soldier: 15, knight: 2 },
    3: { soldier: 20, knight: 5, berserker: 1 },
    4: { soldier: 25, knight: 8, berserker: 2 },
    5: { soldier: 30, knight: 10, berserker: 3 },
    6: { soldier: 35, knight: 12, berserker: 5 },
    7: { soldier: 40, knight: 15, berserker: 7 },
    8: { soldier: 45, knight: 18, berserker: 10 },
    9: { soldier: 50, knight: 20, berserker: 12 },
    10: { soldier: 60, knight: 25, berserker: 15 },
    11: { soldier: 70, knight: 30, berserker: 18 },
    12: { soldier: 80, knight: 35, berserker: 20 },
    13: { soldier: 90, knight: 40, berserker: 25 },
    14: { soldier: 100, knight: 45, berserker: 30 },
    15: { soldier: 120, knight: 50, berserker: 35 },
    16: { soldier: 140, knight: 60, berserker: 40 },
    17: { soldier: 160, knight: 70, berserker: 45 },
    18: { soldier: 180, knight: 80, berserker: 50 },
    19: { soldier: 200, knight: 90, berserker: 60 },
    20: { soldier: 250, knight: 100, berserker: 70 },
  };

  const levelData = baseUnits[level] ?? baseUnits[20];
  return (levelData as Record<keyof UnitCounts, number>)[unitType] ?? 0;
}

export function getDefenseUnitsForLevel(level: number): Partial<UnitCounts> {
  const baseDefense: Record<number, Partial<UnitCounts>> = {
    1: { guard: 10 },
    2: { guard: 15, archer: 2 },
    3: { guard: 20, archer: 5, royalGuard: 1 },
    4: { guard: 25, archer: 8, royalGuard: 2 },
    5: { guard: 30, archer: 10, royalGuard: 3 },
    6: { guard: 35, archer: 12, royalGuard: 5 },
    7: { guard: 40, archer: 15, royalGuard: 7 },
    8: { guard: 45, archer: 18, royalGuard: 10 },
    9: { guard: 50, archer: 20, royalGuard: 12 },
    10: { guard: 60, archer: 25, royalGuard: 15 },
    11: { guard: 70, archer: 30, royalGuard: 18 },
    12: { guard: 80, archer: 35, royalGuard: 20 },
    13: { guard: 90, archer: 40, royalGuard: 25 },
    14: { guard: 100, archer: 45, royalGuard: 30 },
    15: { guard: 120, archer: 50, royalGuard: 35 },
    16: { guard: 140, archer: 60, royalGuard: 40 },
    17: { guard: 160, archer: 70, royalGuard: 45 },
    18: { guard: 180, archer: 80, royalGuard: 50 },
    19: { guard: 200, archer: 90, royalGuard: 60 },
    20: { guard: 250, archer: 100, royalGuard: 70 },
  };

  return baseDefense[level] ?? baseDefense[20];
}

export function getGoldForLevel(level: number): number {
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

export function createBalancedPlayer(
  level: number,
  role: 'offense' | 'defense' | 'balanced' = 'balanced',
): SimPlayer {
  const gold = getGoldForLevel(level);
  const offenseUnits: Partial<UnitCounts> = {};
  const defenseUnits: Partial<UnitCounts> = {};

  if (role === 'offense' || role === 'balanced') {
    const off = getUnitCountForLevel(level, 'soldier');
    offenseUnits.soldier = off;
    offenseUnits.knight = getUnitCountForLevel(level, 'knight');
    offenseUnits.berserker = getUnitCountForLevel(level, 'berserker');
  }

  if (role === 'defense' || role === 'balanced') {
    const def = getDefenseUnitsForLevel(level);
    defenseUnits.guard = def.guard ?? 0;
    defenseUnits.archer = def.archer ?? 0;
    defenseUnits.royalGuard = def.royalGuard ?? 0;
  }

  const units = { ...offenseUnits, ...defenseUnits } as UnitCounts;

  return createSimPlayer({
    level,
    gold,
    units,
  });
}

export const PRESETS = {
  equalLevel5: createBalancedPlayer(5, 'balanced'),
  equalLevel10: createBalancedPlayer(10, 'balanced'),
  equalLevel15: createBalancedPlayer(15, 'balanced'),
  equalLevel20: createBalancedPlayer(20, 'balanced'),

  strongOffense10: createBalancedPlayer(10, 'offense'),
  strongDefense10: createBalancedPlayer(10, 'defense'),

  strongOffense15: createBalancedPlayer(15, 'offense'),
  strongDefense15: createBalancedPlayer(15, 'defense'),

  level5Vs10: {
    attacker: createBalancedPlayer(5, 'offense'),
    defender: createBalancedPlayer(10, 'defense'),
  },

  level10Vs15: {
    attacker: createBalancedPlayer(10, 'offense'),
    defender: createBalancedPlayer(15, 'defense'),
  },

  level10Vs5: {
    attacker: createBalancedPlayer(10, 'offense'),
    defender: createBalancedPlayer(5, 'defense'),
  },

  damagedFort: (baseLevel: number) => {
    const player = createBalancedPlayer(baseLevel, 'balanced');
    player.fortHp = Math.floor(player.fortHp * 0.3);
    return player;
  },

  fullFort: (baseLevel: number) => {
    return createBalancedPlayer(baseLevel, 'balanced');
  },
};

export { UNIT_COSTS };
