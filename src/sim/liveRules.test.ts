import { describe, expect, it } from 'bun:test';

import { makeDailyDecisions } from './behaviors';
import { simulateDay } from './daycycle';
import { calculateTurnIncome, gainXp } from './economy';
import {
  activeEvent,
  applyLiveRulesToPlayer,
  areAllied,
  assignActivityTypes,
  bankBeforeLogoff,
  buyNextStructure,
  demoteLockedUnits,
  formAlliances,
  healWounded,
  isProtectedLive,
  makeFreshPlayer,
  maxFortLevelForPlayerLevel,
  planSessionTicks,
} from './liveRules';
import { generatePopulation } from './population';
import { createRng } from './random';
import type { PlayerState, SimulationState } from './types';

function makePlayer(level = 12): PlayerState {
  const [player] = generatePopulation(1, [level, level], 3);
  return player;
}

describe('assignActivityTypes', () => {
  it('splits the population by the mix', () => {
    const types = assignActivityTypes(
      10,
      { casual: 50, regular: 30, active: 20, grinder: 0 },
      createRng(1).next,
    );
    expect(types.filter((type) => type === 'casual')).toHaveLength(5);
    expect(types.filter((type) => type === 'regular')).toHaveLength(3);
    expect(types.filter((type) => type === 'active')).toHaveLength(2);
    expect(types.filter((type) => type === 'grinder')).toHaveLength(0);
  });
});

describe('planSessionTicks', () => {
  it('logs casual players in once or twice and grinders every tick', () => {
    const random = createRng(2).next;
    for (let day = 0; day < 20; day++) {
      const casual = planSessionTicks('casual', 48, random).size;
      expect(casual).toBeGreaterThanOrEqual(1);
      expect(casual).toBeLessThanOrEqual(2);
    }
    expect(planSessionTicks('grinder', 48, random).size).toBe(48);
  });
});

describe('structures', () => {
  it('limits the fort to the live level requirement', () => {
    expect(maxFortLevelForPlayerLevel(4)).toBe(1);
    expect(maxFortLevelForPlayerLevel(15)).toBe(4);
  });

  it('caps a generated player to what its level allows', () => {
    const player = makePlayer(15);
    applyLiveRulesToPlayer(player, 'regular', createRng(4).next);
    expect(player.fortLevel).toBeLessThanOrEqual(4);
    expect(player.economyLevel).toBeLessThanOrEqual(2);
  });

  it('charges the live fort price and never builds past the requirement', () => {
    const player = makePlayer(10);
    applyLiveRulesToPlayer(player, 'regular', createRng(5).next);
    player.fortLevel = 2;
    player.gold = 10_000_000;
    player.goldInBank = 0;
    expect(buyNextStructure(player)).toBe(250_000);
    expect(player.fortLevel).toBe(3);
    expect(player.gold).toBe(9_750_000);
    // Level 10 allows fort 3; the next purchase is not another fort.
    buyNextStructure(player);
    expect(player.fortLevel).toBe(3);
  });

  it('grants nothing on level-up under live rules', () => {
    const player = makePlayer(10);
    applyLiveRulesToPlayer(player, 'regular', createRng(6).next);
    const before = { fort: player.fortLevel, economy: player.economyLevel };
    const levelled = gainXp(player, 10_000_000, false, true);
    expect(levelled.level).toBeGreaterThan(player.level);
    expect(levelled.fortLevel).toBe(before.fort);
    expect(levelled.economyLevel).toBe(before.economy);
  });
});

describe('units', () => {
  it('turns locked tiers into tier 1 units of the same value', () => {
    const units = { knight: 3, soldier: 0 };
    demoteLockedUnits(units, 3);
    expect(units.knight).toBe(0);
    expect(units.soldier).toBe(20);
  });

  it('heals the daily share of wounded units', () => {
    const player = makePlayer();
    const guards = player.units.guard;
    player.wounded = { guard: 100 };
    healWounded(player);
    expect(player.units.guard).toBe(guards + 35);
    expect(player.wounded.guard).toBe(65);
  });

  it('heals at least one unit a day so small pools empty', () => {
    const player = makePlayer();
    player.wounded = { guard: 2 };
    healWounded(player);
    healWounded(player);
    expect(player.wounded.guard).toBe(0);
  });
});

describe('isProtectedLive', () => {
  it('protects new low-level accounts for 14 days only', () => {
    const player = makePlayer(5);
    makeFreshPlayer(player, 'casual', createRng(7).next, 0);
    expect(isProtectedLive(player, 3)).toBe(true);
    expect(isProtectedLive(player, 14)).toBe(false);
  });

  it('does not protect level 10 or veterans already past their window', () => {
    const veteran = makePlayer(5);
    applyLiveRulesToPlayer(veteran, 'casual', createRng(8).next);
    expect(isProtectedLive(veteran, 0)).toBe(false);
    const fresh = makePlayer(10);
    makeFreshPlayer(fresh, 'casual', createRng(9).next, 0);
    fresh.level = 10;
    expect(isProtectedLive(fresh, 1)).toBe(false);
  });
});

describe('bankBeforeLogoff', () => {
  it('deposits at most 80% of gold on hand per deposit', () => {
    const player = makePlayer();
    applyLiveRulesToPlayer(player, 'casual', createRng(10).next);
    player.gold = 1_000_000;
    player.goldInBank = 0;
    player.bankDepositHistory = [];
    player.maximumBankDeposits = 1;
    expect(bankBeforeLogoff(player, 0, 48)).toBe(800_000);
    expect(player.gold).toBe(200_000);
  });

  it('stops depositing once gold on hand falls below the threshold', () => {
    const player = makePlayer();
    applyLiveRulesToPlayer(player, 'regular', createRng(13).next);
    player.bankDepositHistory = [];
    player.goldInBank = 0;
    const threshold =
      (calculateTurnIncome(player) * 48) / player.maximumBankDeposits;
    player.gold = Math.ceil(threshold);
    bankBeforeLogoff(player, 0, 48);
    expect(player.bankDepositHistory).toHaveLength(1);
  });

  it('is not limited by the bank balance', () => {
    const player = makePlayer();
    applyLiveRulesToPlayer(player, 'casual', createRng(10).next);
    player.economyLevel = 1; // the Farm
    player.gold = 1_000_000;
    player.goldInBank = 2_000_000_000;
    player.bankDepositHistory = [];
    player.maximumBankDeposits = 1;
    expect(bankBeforeLogoff(player, 0, 48)).toBe(800_000);
    expect(player.goldInBank).toBe(2_000_800_000);
  });

  it('keeps deposits for later when little gold is on hand', () => {
    const player = makePlayer();
    applyLiveRulesToPlayer(player, 'grinder', createRng(11).next);
    player.gold = 100;
    player.bankDepositHistory = [];
    expect(bankBeforeLogoff(player, 0, 48)).toBe(0);
    expect(player.bankDepositHistory).toHaveLength(0);
  });
});

describe('activeEvent', () => {
  it('runs from its start day for its length', () => {
    const event = {
      startDay: 3,
      days: 2,
      xpMultiplier: 2,
      goldMultiplier: 1,
      extraTurnsPerTick: 0,
      citizenMultiplier: 1,
      unitCostDiscountPercent: 0,
      armoryCostDiscountPercent: 0,
    };
    expect(activeEvent(event, 2)).toBeUndefined();
    expect(activeEvent(event, 3)).toBe(event);
    expect(activeEvent(event, 4)).toBe(event);
    expect(activeEvent(event, 5)).toBeUndefined();
  });
});

describe('grinders', () => {
  it('hold attacks until stamina recovers, since XP scales with it', () => {
    const player = makePlayer(12);
    applyLiveRulesToPlayer(player, 'grinder', createRng(14).next);
    player.attackTurns = 50;
    player.stamina = 50;
    const population = generatePopulation(20, [10, 14], 15);
    const decision = makeDailyDecisions(player, [player, ...population], {
      forceAct: true,
      random: createRng(16).next,
    });
    expect(decision.attacks).toHaveLength(0);
    player.stamina = 100;
    const rested = makeDailyDecisions(player, [player, ...population], {
      forceAct: true,
      random: createRng(16).next,
    });
    expect(rested.attacks.length).toBeGreaterThan(0);
  });
});

describe('turns generated', () => {
  it('counts event extra turns per player', async () => {
    const random = createRng(30).next;
    const [player] = generatePopulation(1, [12, 12], 30);
    applyLiveRulesToPlayer(player, 'casual', random);
    const state = {
      players: new Map([[player.id, player]]),
      day: 0,
      totalDays: 1,
      history: [],
      metrics: { breachedPlayersPerDay: [] },
      config: {
        live: true,
        random,
        logLevel: 'none',
        event: {
          startDay: 1,
          days: 1,
          xpMultiplier: 1,
          goldMultiplier: 1,
          extraTurnsPerTick: 1,
          citizenMultiplier: 1,
          unitCostDiscountPercent: 0,
          armoryCostDiscountPercent: 0,
        },
      },
    } as unknown as SimulationState;
    await simulateDay(state);
    expect(player.simStats!.turnsGenerated).toBe(96);
  });
});

describe('formAlliances', () => {
  it('groups the configured share of players into alliances of the given size', () => {
    const players = generatePopulation(20, [10, 14], 20);
    expect(formAlliances(players, 50, 5, createRng(21).next)).toBe(2);
    const members = players.filter((player) => player.allianceId);
    expect(members).toHaveLength(10);
    expect(areAllied(members[0], members[0])).toBe(true);
  });
});

describe('simulateDay with live rules', () => {
  it('never has alliance members attack each other', async () => {
    const attacksIn = async (allied: boolean) => {
      const random = createRng(22).next;
      const players = new Map<string, PlayerState>();
      const population = generatePopulation(12, [12, 12], 22);
      for (const player of population) {
        applyLiveRulesToPlayer(player, 'grinder', random);
        players.set(player.id, player);
      }
      if (allied) formAlliances(population, 100, 12, random);
      const state = {
        players,
        day: 0,
        totalDays: 1,
        history: [],
        metrics: { breachedPlayersPerDay: [] },
        config: { live: true, random, logLevel: 'none' },
      } as unknown as SimulationState;
      await simulateDay(state);
      return state.history[0].totalAttacks;
    };
    expect(await attacksIn(false)).toBeGreaterThan(0);
    expect(await attacksIn(true)).toBe(0);
  });

  it('lets players act only while logged in', async () => {
    const random = createRng(12).next;
    const players = new Map<string, PlayerState>();
    for (const player of generatePopulation(30, [10, 14], 12)) {
      applyLiveRulesToPlayer(player, 'casual', random);
      players.set(player.id, player);
    }
    const state = {
      players,
      day: 0,
      totalDays: 1,
      history: [],
      metrics: { breachedPlayersPerDay: [] },
      config: { live: true, random, logLevel: 'none' },
    } as unknown as SimulationState;
    await simulateDay(state);
    for (const player of players.values()) {
      expect(player.simStats!.sessions).toBeLessThanOrEqual(2);
      // Each login spends at most MAX_ROUNDS_PER_SESSION bursts of attacks.
      expect(player.simStats!.attacks).toBeLessThanOrEqual(
        player.simStats!.sessions * 8 * 4,
      );
    }
  });
});
