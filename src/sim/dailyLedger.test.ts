import { describe, expect, it } from 'bun:test';

import { V5_COMBAT_CONSTANTS } from '../utils/balance/v5Combat';
import {
  assassinationDailyCaps,
  battleDailyBudget,
  recordAssassinationOnLedger,
  recordBattleOnLedger,
  resetDefenderDailyLedger,
} from './dailyLedger';
import { createEraPlayer } from './eraPopulation';
import {
  checkSpyEligibility,
  playerStateToSpyLimits,
  recordSpyMissionTick,
  trackerPerTargetCount,
  trackerWithRollingHistory,
} from './spyBehavior';
import type { PlayerState } from './types';

function makeDefender(overrides: Partial<PlayerState> = {}): PlayerState {
  const base = createEraPlayer({ id: 'defender' });
  return {
    ...base,
    houseLevel: 0,
    race: 'HUMAN',
    gold: 50_000,
    units: { ...base.units, citizen: 500, worker: 100, soldier: 40 },
    ...overrides,
  };
}

const DAY_TICKS = 48;

describe('defender daily ledger', () => {
  it('starts with the full casualty budget and shrinks as battles land', () => {
    const defender = makeDefender();
    const fresh = battleDailyBudget(defender);
    expect(fresh.defenderDailyCasualtyRemaining).toBeGreaterThan(0);

    recordBattleOnLedger(defender, {
      defenderCasualties: { soldier: 10 },
      loot: 0,
      winner: 'defender',
    });
    const after = battleDailyBudget(defender);
    expect(after.defenderDailyCasualtyRemaining).toBe(
      fresh.defenderDailyCasualtyRemaining - 10,
    );
  });

  it('only counts gold taken by winning attacks against the gold ceiling', () => {
    const defender = makeDefender({ gold: 10_000 });
    const fresh = battleDailyBudget(defender);
    expect(fresh.defenderDailyGoldRemaining).toBe(5_000);

    recordBattleOnLedger(defender, {
      defenderCasualties: {},
      loot: 2_000,
      winner: 'defender',
    });
    expect(battleDailyBudget(defender).defenderDailyGoldRemaining).toBe(5_000);

    // A real pillage also lowers gold on hand, so the start-of-day anchor holds.
    defender.gold = 8_000;
    recordBattleOnLedger(defender, {
      defenderCasualties: {},
      loot: 2_000,
      winner: 'attacker',
    });
    expect(battleDailyBudget(defender).defenderDailyGoldRemaining).toBe(3_000);
  });

  it('leaves unprotected treasuries without a daily gold ceiling', () => {
    const defender = makeDefender({ gold: 10_000, level: 20 });
    expect(battleDailyBudget(defender).defenderDailyGoldRemaining).toBe(10_000);

    defender.gold = 4_000;
    recordBattleOnLedger(defender, {
      defenderCasualties: {},
      loot: 6_000,
      winner: 'attacker',
    });
    // Everything still on hand stays raidable, however much was taken today.
    expect(battleDailyBudget(defender).defenderDailyGoldRemaining).toBe(4_000);
  });

  it('shares assassination kills with the battle budget and the per-type share', () => {
    const defender = makeDefender();
    const before = assassinationDailyCaps(defender, 'OFFENSE' as never);
    recordAssassinationOnLedger(defender, 'OFFENSE' as never, 4);

    const after = assassinationDailyCaps(defender, 'OFFENSE' as never);
    expect(after.defenderDailyCasualtyRemaining).toBe(
      (before.defenderDailyCasualtyRemaining ?? 0) - 4,
    );
    expect(after.targetTypeDailyRemaining).toBe(
      (before.targetTypeDailyRemaining ?? 0) - 4,
    );
  });

  it('resets at the OT day boundary', () => {
    const defender = makeDefender();
    const fresh = battleDailyBudget(defender);
    recordBattleOnLedger(defender, {
      defenderCasualties: { soldier: 25 },
      loot: 0,
      winner: 'defender',
    });
    resetDefenderDailyLedger(defender);
    expect(battleDailyBudget(defender)).toEqual(fresh);
  });
});

describe('rolling spy mission history', () => {
  it('counts per-target missions only inside the 24h window', () => {
    const attacker = createEraPlayer({ id: 'attacker' });
    const earlier = 10;
    const later = earlier + DAY_TICKS - 1;
    recordSpyMissionTick(attacker, 'intel', 'defender', earlier, DAY_TICKS);
    recordSpyMissionTick(attacker, 'intel', 'defender', later, DAY_TICKS);

    const stillInWindow = trackerWithRollingHistory(attacker, later, DAY_TICKS);
    expect(trackerPerTargetCount(stillInWindow, 'defender', 'intel')).toBe(2);

    const rolledOff = trackerWithRollingHistory(
      attacker,
      earlier + DAY_TICKS,
      DAY_TICKS,
    );
    expect(trackerPerTargetCount(rolledOff, 'defender', 'intel')).toBe(1);
  });

  it('keeps intel and assassination counts separate per target', () => {
    const attacker = createEraPlayer({ id: 'attacker' });
    recordSpyMissionTick(attacker, 'intel', 'defender', 5, DAY_TICKS);
    const tracker = trackerWithRollingHistory(attacker, 5, DAY_TICKS);
    expect(trackerPerTargetCount(tracker, 'defender', 'intel')).toBe(1);
    expect(trackerPerTargetCount(tracker, 'defender', 'assassination')).toBe(0);
  });

  it('blocks a sixth intel mission at one defender inside the window', () => {
    const attacker = createEraPlayer({ id: 'attacker' });
    const defender = makeDefender();
    attacker.units = { ...attacker.units, spy: 20 };
    attacker.attackTurns = 50;
    attacker.stamina = 100;
    const limits = playerStateToSpyLimits(attacker);
    const cap = V5_COMBAT_CONSTANTS.INTEL_MAX_PER_TARGET_PER_DAY;
    for (let i = 0; i < cap; i++) {
      recordSpyMissionTick(attacker, 'intel', defender.id, i, DAY_TICKS);
    }
    const tracker = trackerWithRollingHistory(attacker, cap, DAY_TICKS);
    const result = checkSpyEligibility({
      attacker,
      defender,
      kind: 'intel',
      spies: 1,
      turns: 1,
      attackLevelRange: 5,
      tracker,
      limits,
    });
    expect(result).toMatchObject({
      eligible: false,
      reason: 'PER_TARGET_LIMIT',
    });
  });
});
