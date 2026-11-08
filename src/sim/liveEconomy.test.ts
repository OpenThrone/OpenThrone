import { describe, expect, it } from 'bun:test';

import { armyDesertionGuaranteedRemaining } from '../constants/KingdomMorale';
import { runSingleBattle } from './engine';
import {
  allocateBonusPoints,
  applyBattleMorale,
  applyDailyMorale,
  applyDefection,
  BONUS_POINT_CAP,
  buyBattleUpgrades,
  discountedPrice,
  equipArmy,
  spendOnArmy,
  trainCitizens,
  uncoveredUnits,
} from './liveEconomy';
import {
  applyLiveRulesToPlayer,
  nextStructureCost,
  refreshStructureEffects,
} from './liveRules';
import { generatePopulation } from './population';
import { createSimPlayer } from './presets';
import { createRng } from './random';
import type { PlayerState } from './types';

function armyOf(player: PlayerState): number {
  const keys: Array<keyof PlayerState['units']> = [
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
  ];
  return keys.reduce((sum, key) => sum + player.units[key], 0);
}

function livePlayer(level = 12, seed = 3): PlayerState {
  const [player] = generatePopulation(1, [level, level], seed);
  applyLiveRulesToPlayer(player, 'regular', createRng(seed).next);
  return player;
}

describe('allocateBonusPoints', () => {
  it('spends one point per level, capped per category', () => {
    const player = livePlayer(12);
    allocateBonusPoints(player);
    const points = Object.values(player.bonusPoints!);
    expect(points.reduce((sum, value) => sum + value, 0)).toBe(12);
    player.level = 400;
    allocateBonusPoints(player);
    for (const value of Object.values(player.bonusPoints!)) {
      expect(value).toBeLessThanOrEqual(BONUS_POINT_CAP);
    }
  });

  it('puts an aggressive player into offense first', () => {
    const player = livePlayer(20);
    player.behavior.playStyle = 'aggressive';
    allocateBonusPoints(player);
    expect(player.bonusPoints!.OFFENSE).toBeGreaterThan(
      player.bonusPoints!.DEFENSE,
    );
    expect(player.bonuses.attack).toBeGreaterThan(0);
  });
});

describe('trainCitizens', () => {
  it('trains the best tier the fort unlocks and spends citizens', () => {
    const player = livePlayer(20);
    player.fortLevel = 7;
    player.units.citizen = 100;
    player.behavior.aggression = 0.8;
    const berserkers = player.units.berserker;
    trainCitizens(player, 100_000_000);
    expect(player.units.citizen).toBe(0);
    expect(player.units.berserker).toBeGreaterThan(berserkers);
  });

  it('never trains a locked tier', () => {
    const player = livePlayer(10);
    player.fortLevel = 3;
    player.units.citizen = 100;
    const knights = player.units.knight;
    trainCitizens(player, 100_000_000);
    expect(player.units.knight).toBe(knights);
  });
});

describe('equipArmy', () => {
  it('arms every unit it can afford, within the armory level', () => {
    const player = livePlayer(12);
    player.inventory = [];
    player.gold = 1_000_000_000;
    equipArmy(player, 1_000_000_000);
    expect(
      uncoveredUnits(player, 'OFFENSE', 'WEAPON').reduce((a, b) => a + b, 0),
    ).toBe(0);
    // Armory level 1 only sells level-1 items.
    expect(player.inventory!.every((item) => item.level === 1)).toBe(true);
  });

  it('counts items as covering units of their level or higher', () => {
    const player = livePlayer(12);
    player.units.soldier = 10;
    player.units.knight = 5;
    player.units.berserker = 0;
    player.inventory = [
      { usage: 'OFFENSE', type: 'WEAPON', level: 2, quantity: 3 },
      { usage: 'OFFENSE', type: 'WEAPON', level: 1, quantity: 4 },
    ];
    // Level-2 weapons go to 3 knights; level-1 weapons to the other 2 knights, then soldiers.
    expect(uncoveredUnits(player, 'OFFENSE', 'WEAPON')).toEqual([8, 0, 0]);
  });
});

describe('spendOnArmy', () => {
  it('saves for the next structure when it is within reach', () => {
    const player = livePlayer(20);
    player.behavior.wealthPreference = 0;
    const cost = nextStructureCost(player);
    expect(cost).toBeGreaterThan(0);
    // buyNextStructure needs twice the price in wealth, so that is kept back.
    player.gold = cost * 2;
    player.goldInBank = 0;
    player.units.citizen = 1000;
    player.units.worker = 10_000;
    spendOnArmy(player, 48);
    expect(player.gold + player.goldInBank).toBe(cost * 2);
  });
});

describe('morale', () => {
  it('drops on a lost defense and spares protected defenders', () => {
    const player = livePlayer();
    applyBattleMorale(player, true, false);
    expect(player.kingdomMorale).toBe(97);
    applyBattleMorale(player, true, true);
    expect(player.kingdomMorale).toBe(97);
    applyBattleMorale(player, false, false);
    expect(player.kingdomMorale).toBe(99);
  });

  it('deserts 1% of the army a day below 20, never under 75% of the floor', () => {
    const player = livePlayer(20);
    player.units.soldier = 1000;
    player.kingdomMorale = 0;
    expect(applyDailyMorale(player).deserted).toBeGreaterThan(0);
    const floor = player.desertionFloor!;
    for (let day = 0; day < 200; day++) {
      player.kingdomMorale = 0;
      applyDailyMorale(player);
    }
    expect(armyOf(player)).toBe(armyDesertionGuaranteedRemaining(floor));
  });

  it('keeps the floor when morale recovers, so a second crash cannot bleed more', () => {
    const player = livePlayer(20);
    player.units.soldier = 1000;
    player.kingdomMorale = 0;
    applyDailyMorale(player);
    const floor = player.desertionFloor!;
    player.kingdomMorale = 90;
    applyDailyMorale(player);
    expect(player.desertionFloor).toBe(floor);
    for (let day = 0; day < 200; day++) {
      player.kingdomMorale = 0;
      applyDailyMorale(player);
    }
    expect(armyOf(player)).toBe(armyDesertionGuaranteedRemaining(floor));
  });

  it('takes whole-army desertion even when every stack is small', () => {
    const player = livePlayer(20);
    for (const key of Object.keys(player.units) as Array<
      keyof PlayerState['units']
    >) {
      player.units[key] = 0;
    }
    player.units.soldier = 50;
    player.units.guard = 50;
    player.kingdomMorale = 0;
    expect(applyDailyMorale(player).deserted).toBe(1);
  });

  it('splits defectors per stack, so one deserter from each of two stacks defects none', () => {
    const player = livePlayer(20);
    for (const key of Object.keys(player.units) as Array<
      keyof PlayerState['units']
    >) {
      player.units[key] = 0;
    }
    player.units.soldier = 100;
    player.units.guard = 100;
    player.kingdomMorale = 0;
    expect(applyDailyMorale(player)).toEqual({ deserted: 2, defectors: 0 });
  });

  it('sends defectors as citizens, within one daily cap per recipient', () => {
    const recipient = livePlayer(20, 5);
    for (const key of Object.keys(recipient.units) as Array<
      keyof PlayerState['units']
    >) {
      recipient.units[key] = 0;
    }
    recipient.units.soldier = 1000;
    const first = applyDefection(recipient, 20, 0);
    expect(first).toBe(10);
    expect(recipient.units.citizen).toBe(10);
    expect(recipient.units.soldier).toBe(1000);
    expect(applyDefection(recipient, 20, first)).toBe(0);
  });
});

describe('intel bonuses', () => {
  it('adds the spy and sentry training structures to intel points', () => {
    const player = livePlayer(20);
    player.spyLevel = 3;
    player.sentryLevel = 3;
    refreshStructureEffects(player);
    expect(player.bonuses.spy).toBeGreaterThan(0);
    expect(player.bonuses.sentry).toBeGreaterThan(0);
  });
});

describe('equipment in battle', () => {
  it('reaches the battle code and makes an armed army stronger', async () => {
    const units = { soldier: 200, guard: 200 };
    const attacker = (armed: boolean) =>
      createSimPlayer({
        id: armed ? 'armed' : 'bare',
        level: 12,
        gold: 0,
        fortLevel: 3,
        units,
        live: {
          inventory: armed
            ? [{ usage: 'OFFENSE', type: 'WEAPON', level: 1, quantity: 200 }]
            : [],
          structureUpgrades: [{ type: 'ARMORY', level: 1 }],
          battleUpgrades: [],
        },
      });
    const defender = createSimPlayer({
      id: 'defender',
      level: 12,
      gold: 1_000_000,
      fortLevel: 3,
      units: { guard: 300 },
      live: { inventory: [], structureUpgrades: [], battleUpgrades: [] },
    });
    const bare = await runSingleBattle(attacker(false), defender, {
      random: createRng(1).next,
      isDefenderProtected: false,
    });
    const armed = await runSingleBattle(attacker(true), defender, {
      random: createRng(1).next,
      isDefenderProtected: false,
    });
    const killed = (metrics: typeof bare) =>
      Object.values(metrics.defenderCasualties).reduce((a, b) => a + b, 0);
    expect(killed(armed)).toBeGreaterThan(killed(bare));
  });
});

describe('battle upgrades', () => {
  it('needs offensive structure level 6 and covers level 2+ units', () => {
    const player = livePlayer(30);
    player.units.knight = 20;
    player.units.archer = 10;
    player.battleUpgrades = [];
    player.offenseStructureLevel = 5;
    expect(buyBattleUpgrades(player, 1_000_000_000)).toBe(0);
    player.offenseStructureLevel = 6;
    buyBattleUpgrades(player, 1_000_000_000);
    const steeds = player.battleUpgrades.find(
      (upgrade) => upgrade.type === 'OFFENSE' && upgrade.level === 1,
    );
    const towers = player.battleUpgrades.find(
      (upgrade) => upgrade.type === 'DEFENSE' && upgrade.level === 1,
    );
    expect(steeds?.quantity).toBe(20 + player.units.berserker);
    // A Guard Tower covers 5 units.
    expect(towers?.quantity).toBe(
      Math.ceil((10 + player.units.royalGuard) / 5),
    );
    // The 5M War Elephant is not worth it for these armies.
    expect(player.battleUpgrades.some((upgrade) => upgrade.level === 2)).toBe(
      false,
    );
  });
});

describe('spy and sentry gear', () => {
  it('buys items for spies and sentries too', () => {
    const player = livePlayer(12);
    player.units.spy = 20;
    player.units.sentry = 20;
    player.inventory = [];
    player.gold = 1_000_000_000;
    equipArmy(player, 1_000_000_000);
    expect(player.inventory!.some((item) => item.usage === 'SPY')).toBe(true);
    expect(player.inventory!.some((item) => item.usage === 'SENTRY')).toBe(
      true,
    );
  });
});

describe('event discounts', () => {
  it('applies after the price bonus, as the live services do', () => {
    const player = livePlayer(12);
    player.bonusPoints = {
      OFFENSE: 0,
      DEFENSE: 0,
      INCOME: 0,
      INTEL: 0,
      PRICES: 0,
    };
    expect(discountedPrice(player, 10_000, 20)).toBe(8_000);
    expect(discountedPrice(player, 10_000)).toBe(10_000);
  });
});
