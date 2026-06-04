import { Fortifications } from '../constants';
import {
  EconomyUpgrades,
  HouseUpgrades,
} from '../constants/Structure_Upgrades';
import { DAILY_CITIZEN_GRANT, UNIT_COSTS } from './population';
import { getLevelFromSimXp } from './progression';
import { PlayerState, UnitCounts } from './types';

export function calculateDailyIncome(player: PlayerState): number {
  const economy =
    EconomyUpgrades.find((e) => e.level === player.economyLevel) ??
    EconomyUpgrades[0];

  const workerCount = player.units.worker;
  const baseGoldPerWorker = economy.goldPerWorker;
  const { depositsPerDay } = economy;

  return baseGoldPerWorker * workerCount * depositsPerDay;
}

export function calculateTurnIncome(player: PlayerState): number {
  const economy =
    EconomyUpgrades.find((e) => e.level === player.economyLevel) ??
    EconomyUpgrades[0];
  const fort =
    Fortifications.find((f) => f.level === player.fortLevel) ??
    Fortifications[0];

  const workerIncome = economy.goldPerWorker * player.units.worker;
  const fortIncome = fort?.goldPerTurn ?? 0;
  return Math.ceil(workerIncome + fortIncome);
}

export function calculateRecruitBonus(player: PlayerState): number {
  return Math.max(1, Math.floor(player.recruitBonus || DAILY_CITIZEN_GRANT));
}

export function calculateMaximumBankDeposits(player: PlayerState): number {
  const economy =
    EconomyUpgrades.find((e) => e.level === player.economyLevel) ??
    EconomyUpgrades[0];
  return economy?.depositsPerDay ?? player.maximumBankDeposits ?? 3;
}

export function calculateUnitCost(type: keyof UnitCounts): number {
  return UNIT_COSTS[type] ?? 0;
}

export function calculateTotalUnitCost(units: Partial<UnitCounts>): number {
  let total = 0;
  if (units.soldier) total += units.soldier * UNIT_COSTS.soldier;
  if (units.knight) total += units.knight * UNIT_COSTS.knight;
  if (units.berserker) total += units.berserker * UNIT_COSTS.berserker;
  if (units.guard) total += units.guard * UNIT_COSTS.guard;
  if (units.archer) total += units.archer * UNIT_COSTS.archer;
  if (units.royalGuard) total += units.royalGuard * UNIT_COSTS.royalGuard;
  if (units.spy) total += units.spy * UNIT_COSTS.spy;
  if (units.infiltrator) total += units.infiltrator * UNIT_COSTS.infiltrator;
  if (units.assassin) total += units.assassin * UNIT_COSTS.assassin;
  if (units.sentry) total += units.sentry * UNIT_COSTS.sentry;
  if (units.sentinel) total += units.sentinel * UNIT_COSTS.sentinel;
  if (units.inquisitor) total += units.inquisitor * UNIT_COSTS.inquisitor;
  if (units.worker) total += units.worker * UNIT_COSTS.worker;
  return total;
}

export function calculateUpgradeCost(
  currentLevel: number,
  upgradeType: 'offense' | 'defense' | 'spy' | 'sentry' | 'economy',
): number {
  const baseCosts: Record<string, number[]> = {
    offense: [
      0, 100000, 250000, 500000, 1000000, 2000000, 3000000, 4000000, 5000000,
    ],
    defense: [
      0, 100000, 250000, 500000, 1000000, 2000000, 3000000, 4000000, 5000000,
    ],
    spy: [0, 50000, 100000, 200000, 400000, 800000, 1600000, 3200000],
    sentry: [0, 50000, 100000, 200000, 400000, 800000, 1600000, 3200000],
    economy: [0, 500000, 2000000, 5000000, 15000000, 37500000, 100000000],
  };

  const costs = baseCosts[upgradeType] ?? [];
  return costs[currentLevel + 1] ?? costs[costs.length - 1] ?? 1000000;
}

export function calculateRepairCost(
  currentHp: number,
  maxHp: number,
  fortLevel: number,
): number {
  const fort = [
    { costPerHp: 5 },
    { costPerHp: 15 },
    { costPerHp: 35 },
    { costPerHp: 75 },
    { costPerHp: 150 },
    { costPerHp: 300 },
    { costPerHp: 600 },
  ];
  const repairData = fort[Math.min(fortLevel - 1, fort.length - 1)];
  const hpToRepair = maxHp - currentHp;
  return hpToRepair * repairData.costPerHp;
}

export function canAfford(player: PlayerState, cost: number): boolean {
  return player.gold >= cost;
}

export function trainUnits(
  player: PlayerState,
  targetUnits: Partial<UnitCounts>,
  maxBudget?: number,
): {
  actual: Partial<UnitCounts>;
  goldSpent: number;
} {
  const actual: Partial<UnitCounts> = {};
  let goldSpent = 0;

  const unitTypes: (keyof UnitCounts)[] = [
    'soldier',
    'knight',
    'berserker',
    'guard',
    'archer',
    'royalGuard',
    'spy',
    'infiltrator',
    'assassin',
    'sentry',
    'sentinel',
    'inquisitor',
    'worker',
  ];

  for (const type of unitTypes) {
    const targetQty = targetUnits[type] ?? 0;
    if (targetQty <= 0) continue;

    const unitCost = calculateUnitCost(type);
    let affordable = targetQty;

    if (maxBudget !== undefined) {
      const maxAffordableByBudget = Math.floor(maxBudget / unitCost);
      affordable = Math.min(affordable, maxAffordableByBudget);
    }

    const availableCitizens = player.units.citizen;
    const affordableByCitizens = Math.min(affordable, availableCitizens);

    if (affordableByCitizens > 0) {
      const cost = affordableByCitizens * unitCost;
      if (maxBudget !== undefined && goldSpent + cost > maxBudget) {
        const maxByRemaining = Math.floor((maxBudget - goldSpent) / unitCost);
        actual[type] = maxByRemaining;
        goldSpent += maxByRemaining * unitCost;
      } else {
        actual[type] = affordableByCitizens;
        goldSpent += cost;
      }
    }
  }

  return { actual, goldSpent };
}

export function recruitUnits(
  player: PlayerState,
  targetUnits: Partial<UnitCounts>,
): {
  success: boolean;
  recruited: Partial<UnitCounts>;
  goldSpent: number;
  citizensUsed: number;
  remainingGold: number;
  remainingCitizens: number;
} {
  const totalCost = calculateTotalUnitCost(targetUnits);
  const totalCitizens =
    (targetUnits.soldier ?? 0) +
    (targetUnits.knight ?? 0) +
    (targetUnits.berserker ?? 0) +
    (targetUnits.guard ?? 0) +
    (targetUnits.archer ?? 0) +
    (targetUnits.royalGuard ?? 0) +
    (targetUnits.spy ?? 0) +
    (targetUnits.infiltrator ?? 0) +
    (targetUnits.assassin ?? 0) +
    (targetUnits.sentry ?? 0) +
    (targetUnits.sentinel ?? 0) +
    (targetUnits.inquisitor ?? 0) +
    (targetUnits.worker ?? 0);

  if (totalCitizens > player.units.citizen) {
    return {
      success: false,
      recruited: {},
      goldSpent: 0,
      citizensUsed: 0,
      remainingGold: player.gold,
      remainingCitizens: player.units.citizen,
    };
  }

  if (totalCost > player.gold) {
    return {
      success: false,
      recruited: {},
      goldSpent: 0,
      citizensUsed: 0,
      remainingGold: player.gold,
      remainingCitizens: player.units.citizen,
    };
  }

  return {
    success: true,
    recruited: targetUnits,
    goldSpent: totalCost,
    citizensUsed: totalCitizens,
    remainingGold: player.gold - totalCost,
    remainingCitizens: player.units.citizen - totalCitizens,
  };
}

export function applyDailyIncome(player: PlayerState): PlayerState {
  const income = calculateDailyIncome(player);
  return {
    ...player,
    gold: player.gold + income,
    goldInBank: player.goldInBank,
  };
}

export function applyDailyCitizenGrant(player: PlayerState): PlayerState {
  if (player.status !== 'active') return player;

  return {
    ...player,
    units: {
      ...player.units,
      citizen: player.units.citizen + calculateRecruitBonus(player),
    },
  };
}

export function applyLevelUp(player: PlayerState): PlayerState {
  const nextLevel = getLevelFromSimXp(player.xp);

  if (nextLevel > player.level) {
    const maxFortLevel = Math.max(...Fortifications.map((fort) => fort.level));
    const nextFortLevel = Math.min(
      maxFortLevel,
      Math.max(1, Math.floor(nextLevel / 3)),
    );
    const nextFort =
      Fortifications.find((fort) => fort.level === nextFortLevel) ??
      Fortifications[0];
    const previousMaxHp = Math.max(1, player.fortMaxHp);
    const fortHealthRatio = Math.max(
      0,
      Math.min(1, player.fortHp / previousMaxHp),
    );
    const nextHouse = Object.values(HouseUpgrades)
      .filter((house) => house.fortLevel <= nextFortLevel)
      .sort((a, b) => b.level - a.level)[0];

    return {
      ...player,
      level: nextLevel,
      fortLevel: nextFortLevel,
      houseLevel: nextHouse?.level ?? player.houseLevel,
      recruitBonus: nextHouse?.citizensDaily ?? player.recruitBonus,
      fortHp: Math.ceil(nextFort.hitpoints * fortHealthRatio),
      fortMaxHp: nextFort.hitpoints,
      spyLevel: Math.min(22, Math.max(1, Math.floor(nextLevel / 3))),
      sentryLevel: Math.min(22, Math.max(1, Math.floor(nextLevel / 3))),
      economyLevel: Math.min(7, Math.max(1, Math.floor(nextLevel / 3))),
    };
  }

  return player;
}

export function gainXp(
  player: PlayerState,
  xp: number,
  isWinner: boolean,
): PlayerState {
  const finalXp = isWinner ? xp * 1.5 : xp;
  let newPlayer = {
    ...player,
    xp: player.xp + finalXp,
  };

  newPlayer = applyLevelUp(newPlayer);

  return newPlayer;
}

export function getPlayerPower(player: PlayerState): number {
  const offense =
    player.units.soldier * 5 +
    player.units.knight * 15 +
    player.units.berserker * 40;
  const defense =
    player.units.guard * 3 +
    player.units.archer * 15 +
    player.units.royalGuard * 40;
  const spy =
    player.units.spy * 3 +
    player.units.infiltrator * 5 +
    player.units.assassin * 270;
  const sentry =
    player.units.sentry * 5 +
    player.units.sentinel * 20 +
    player.units.inquisitor * 250;

  const offenseMultiplier = 1 + player.bonuses.attack / 100;
  const defenseMultiplier = 1 + player.bonuses.defense / 100;
  const clandestinePower =
    spy * (1 + player.bonuses.spy / 100) +
    sentry * (1 + player.bonuses.sentry / 100);

  return (
    Math.sqrt(
      Math.max(1, offense * offenseMultiplier) *
        Math.max(1, defense * defenseMultiplier),
    ) +
    clandestinePower * 0.25
  );
}

export function getWealthGiniCoefficient(players: PlayerState[]): number {
  if (players.length === 0) return 0;

  const wealths = players
    .filter((p) => p.status === 'active')
    .map((p) => p.gold + p.goldInBank)
    .sort((a, b) => a - b);

  if (wealths.length === 0) return 0;

  const n = wealths.length;
  const mean = wealths.reduce((a, b) => a + b, 0) / n;

  if (mean === 0) return 0;

  let sumDiffs = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      sumDiffs += Math.abs(wealths[i] - wealths[j]);
    }
  }

  return sumDiffs / (2 * n * n * mean);
}
