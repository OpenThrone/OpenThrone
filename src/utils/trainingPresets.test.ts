import { describe, expect, it } from 'bun:test';

import {
  buildPresetOrder,
  TRAINING_PRESET_IDS,
  TRAINING_PRESETS,
} from './trainingPresets';

const UNITS = [
  { id: 'WORKER_1', type: 'WORKER', cost: 2000 },
  { id: 'OFFENSE_1', type: 'OFFENSE', cost: 1500 },
  { id: 'DEFENSE_1', type: 'DEFENSE', cost: 1500 },
] as const;

const spent = (order: Record<string, number>) =>
  UNITS.reduce((sum, unit) => sum + (order[unit.id] ?? 0) * unit.cost, 0);

describe('trainingPresets', () => {
  it('shares of every preset sum to one', () => {
    for (const id of TRAINING_PRESET_IDS) {
      const total = Object.values(TRAINING_PRESETS[id]).reduce(
        (sum, share) => sum + share,
        0,
      );
      expect(total).toBeCloseTo(1);
    }
  });

  it('never orders more than the citizens or gold available', () => {
    for (const id of TRAINING_PRESET_IDS) {
      const order = buildPresetOrder(id, {
        citizens: 40,
        gold: 25_000,
        units: UNITS,
      });
      const units = Object.values(order).reduce((sum, qty) => sum + qty, 0);
      expect(units).toBeLessThanOrEqual(40);
      expect(spent(order)).toBeLessThanOrEqual(25_000);
    }
  });

  it('is limited by citizens when gold is plentiful', () => {
    const order = buildPresetOrder('steady', {
      citizens: 20,
      gold: 10_000_000,
      units: UNITS,
    });
    expect(order).toEqual({ WORKER_1: 10, DEFENSE_1: 10 });
  });

  it('is limited by gold when citizens are plentiful', () => {
    const order = buildPresetOrder('steady', {
      citizens: 1000,
      gold: 17_500,
      units: UNITS,
    });
    expect(spent(order)).toBeLessThanOrEqual(17_500);
    expect(order.WORKER_1).toBe(order.DEFENSE_1);
    expect(order.WORKER_1).toBeGreaterThan(0);
  });

  it('skips roles without an available unit and offense for steady', () => {
    const order = buildPresetOrder('balanced', {
      citizens: 100,
      gold: 1_000_000,
      units: [UNITS[0]],
    });
    expect(Object.keys(order)).toEqual(['WORKER_1']);
    expect(
      buildPresetOrder('steady', {
        citizens: 100,
        gold: 1_000_000,
        units: UNITS,
      }).OFFENSE_1,
    ).toBeUndefined();
  });

  it('returns nothing with no citizens or no gold', () => {
    expect(
      buildPresetOrder('raider', { citizens: 0, gold: 5000, units: UNITS }),
    ).toEqual({});
    expect(
      buildPresetOrder('raider', { citizens: 50, gold: 0, units: UNITS }),
    ).toEqual({});
  });
});
