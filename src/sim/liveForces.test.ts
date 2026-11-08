import { describe, expect, it } from 'bun:test';

import { recordBattleOnLedger, resetDefenderDailyLedger } from './dailyLedger';
import { runSingleBattle } from './engine';
import { applyDailyMorale } from './liveEconomy';
import {
  applyMercenaryLosses,
  captureFromBattle,
  desertMercenaries,
  hireMercenaries,
  mercenaryRoster,
  mercenaryTier,
  mercenaryUnitPrice,
  processCaptives,
  startMercenaryDay,
} from './liveForces';
import { applyLiveRulesToPlayer } from './liveRules';
import { generatePopulation } from './population';
import { createSimPlayer } from './presets';
import { createRng } from './random';
import type { PlayerState } from './types';

function veteran(seed = 3): PlayerState {
  const [player] = generatePopulation(1, [70, 70], seed);
  applyLiveRulesToPlayer(player, 'regular', createRng(seed).next);
  player.fortLevel = 14;
  player.economyLevel = 7;
  player.kingdomMorale = 100;
  player.behavior.aggression = 0.8;
  return player;
}

describe('mercenaries', () => {
  it('prices a hire as mobilization plus the daily rate', () => {
    // A Soldier costs 1,500: mobilization 1,875; kit adds to the daily rate.
    expect(mercenaryUnitPrice('OFFENSE', 1, 1)).toBeGreaterThan(1875);
    expect(mercenaryUnitPrice('OFFENSE', 1, 3)).toBeGreaterThan(
      mercenaryUnitPrice('OFFENSE', 1, 1),
    );
  });

  it('needs the Tavern and unlocks higher tiers with the economy', () => {
    const player = veteran();
    player.economyLevel = 4;
    expect(mercenaryTier(player, 'OFFENSE')).toBe(0);
    player.economyLevel = 5;
    expect(mercenaryTier(player, 'OFFENSE')).toBe(1);
    player.economyLevel = 7;
    expect(mercenaryTier(player, 'OFFENSE')).toBe(3);
  });

  it('stays within 100 per role and half of the own army', () => {
    const player = veteran();
    player.units.soldier = 60;
    for (const key of ['knight', 'berserker', 'guard', 'archer'] as const) {
      player.units[key] = 0;
    }
    player.units.royalGuard = 0;
    player.gold = 1_000_000_000;
    hireMercenaries(player, 1_000_000_000, 0);
    const own =
      player.units.soldier +
      player.units.spy +
      player.units.infiltrator +
      player.units.assassin +
      player.units.sentry +
      player.units.sentinel +
      player.units.inquisitor;
    const hired = player.mercenaries!.reduce((sum, c) => sum + c.quantity, 0);
    expect(hired).toBeLessThanOrEqual(Math.min(100, Math.floor(own / 2)));
    expect(hired).toBeGreaterThan(0);
  });

  it('refuses to hire below morale 20', () => {
    const player = veteran();
    player.kingdomMorale = 10;
    expect(hireMercenaries(player, 1_000_000_000, 0)).toBe(0);
  });

  it('ends contracts at expiry and loses 10% a day below morale 20', () => {
    const player = veteran();
    player.mercenaries = [
      { id: 1, type: 'OFFENSE', level: 1, quantity: 50, expiresOnDay: 5 },
      { id: 2, type: 'DEFENSE', level: 1, quantity: 50, expiresOnDay: 2 },
    ];
    player.kingdomMorale = 10;
    startMercenaryDay(player, 2);
    desertMercenaries(player);
    expect(player.mercenaries).toHaveLength(1);
    expect(player.mercenaries[0].quantity).toBe(45);
  });

  it('fight as mercenary rows and lose from the contract, not the army', async () => {
    const player = veteran();
    player.mercenaries = [
      { id: 7, type: 'OFFENSE', level: 1, quantity: 100, expiresOnDay: 9 },
    ];
    const roster = mercenaryRoster(player);
    expect(roster[0]).toMatchObject({
      isMercenary: true,
      forceContractId: 7,
      forceKind: 'MERCENARY',
    });
    const attacker = createSimPlayer({
      id: 'a',
      level: 70,
      gold: 0,
      fortLevel: 14,
      // Own units fight before mercenaries, so field mercenaries alone.
      units: {},
      live: {
        inventory: [],
        structureUpgrades: [],
        battleUpgrades: [],
        mercenaries: roster,
      },
    });
    const defender = createSimPlayer({
      id: 'd',
      level: 70,
      gold: 1_000_000,
      fortLevel: 14,
      units: { guard: 400 },
      live: {
        inventory: [],
        structureUpgrades: [],
        battleUpgrades: [],
        mercenaries: [],
      },
    });
    const result = await runSingleBattle(attacker, defender, {
      random: createRng(2).next,
      isDefenderProtected: false,
    });
    const lost = result.attackerMercenaryLosses?.[7] ?? 0;
    expect(lost).toBeGreaterThan(0);
    // Mercenary losses never count against the player's own units.
    expect(result.attackerCasualties.soldier).toBe(0);
    expect(result.attackerWounded?.soldier ?? 0).toBe(0);
    applyMercenaryLosses(player, result.attackerMercenaryLosses, undefined);
    expect(player.mercenaries[0].quantity).toBe(100 - lost);
  });
});

describe('wounded mercenaries', () => {
  it('sit out of battle and return to duty as they heal', () => {
    const player = veteran();
    player.mercenaries = [
      { id: 1, type: 'OFFENSE', level: 1, quantity: 100, expiresOnDay: 9 },
    ];
    applyMercenaryLosses(player, { 1: 10 }, { 1: 20 });
    expect(player.mercenaries[0].quantity).toBe(90);
    expect(mercenaryRoster(player)[0].quantity).toBe(70);
    startMercenaryDay(player, 1);
    // 35% of 20 heal.
    expect(mercenaryRoster(player)[0].quantity).toBe(77);
  });
});

describe('mercenary morale', () => {
  it('deserts only after the combined daily morale change', () => {
    const player = veteran();
    player.mercenaries = [
      { id: 1, type: 'OFFENSE', level: 1, quantity: 100, expiresOnDay: 9 },
    ];
    player.gold = 1000;
    player.kingdomMorale = 19;
    applyDailyMorale(player, startMercenaryDay(player, 1));
    desertMercenaries(player);
    // 19 + 5 = 24: no desertion.
    expect(player.mercenaries[0].quantity).toBe(100);

    player.gold = 0;
    player.goldInBank = 0;
    player.kingdomMorale = 18;
    applyDailyMorale(player, startMercenaryDay(player, 2));
    desertMercenaries(player);
    // 18 + 5 - 3 = 20: still no desertion.
    expect(player.mercenaries[0].quantity).toBe(100);
    player.kingdomMorale = 16;
    applyDailyMorale(player, startMercenaryDay(player, 3));
    desertMercenaries(player);
    // 16 + 5 - 3 = 18: 10% desert.
    expect(player.mercenaries[0].quantity).toBe(90);
  });

  it('count toward the defender daily casualty ledger', () => {
    const player = veteran();
    resetDefenderDailyLedger(player);
    recordBattleOnLedger(player, {
      defenderCasualties: { guard: 5 },
      defenderMercenaryLosses: { 1: 7 },
      loot: 0,
      winner: 'attacker',
    });
    expect(player.defenderLedger!.casualtiesToday).toBe(12);
  });
});

describe('captives', () => {
  it('takes 10% of killed combat units only on a breaching win from fort 13+', () => {
    const attacker = veteran(4);
    const defender = veteran(5);
    attacker.captives = [];
    const base = {
      attacker,
      defender,
      attackerWon: true,
      fortBreached: true,
      defenderProtected: false,
      killed: { guard: 100, archer: 50, citizen: 500 },
      day: 1,
    };
    expect(captureFromBattle({ ...base, fortBreached: false })).toBe(0);
    expect(captureFromBattle({ ...base, attackerWon: false })).toBe(0);
    expect(captureFromBattle({ ...base, defenderProtected: true })).toBe(0);
    attacker.fortLevel = 12;
    expect(captureFromBattle(base)).toBe(0);
    attacker.fortLevel = 13;
    // Citizens are never captured: 10% of 150.
    expect(captureFromBattle(base)).toBe(15);
  });

  it('is ransomed by a rich source, converted after 72h, or escapes after 7 days', () => {
    const captor = veteran(6);
    const source = veteran(7);
    const players = new Map([
      [captor.id, captor],
      [source.id, source],
    ]);
    source.gold = 1_000_000_000;
    const guards = source.units.guard;
    captor.captives = [
      { sourceId: source.id, key: 'guard', quantity: 10, capturedDay: 0 },
    ];
    processCaptives(captor, players, 1);
    expect(source.units.guard).toBe(guards + 10);
    expect(captor.captives).toHaveLength(0);

    source.gold = 0;
    source.goldInBank = 0;
    captor.gold = 1_000_000_000;
    const captorGuards = captor.units.guard;
    captor.captives = [
      { sourceId: source.id, key: 'guard', quantity: 10, capturedDay: 0 },
    ];
    processCaptives(captor, players, 2);
    expect(captor.captives).toHaveLength(1);
    processCaptives(captor, players, 3);
    expect(captor.units.guard).toBe(captorGuards + 10);

    captor.gold = 0;
    captor.goldInBank = 0;
    const citizens = source.units.citizen;
    captor.captives = [
      { sourceId: source.id, key: 'guard', quantity: 10, capturedDay: 0 },
    ];
    processCaptives(captor, players, 7);
    expect(source.units.citizen).toBe(citizens + 10);
  });
});
