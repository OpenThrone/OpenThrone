import { describe, expect, test } from 'bun:test';

import {
  projectStamina,
  staminaCost,
  staminaGuideValues,
  type StaminaRules,
} from './stamina';

const rules: StaminaRules = {
  penaltyThreshold: 50,
  minOffensePercent: 80,
  enabled: true,
  recoveryEnabled: true,
  recoveryAmount: 5,
  recoveryIntervalMinutes: 10,
  baseCost: 2,
  perTurnCost: 0.5,
};
const start = new Date('2026-01-01T00:00:00Z');
const at = (minutes: number) => new Date(start.getTime() + minutes * 60_000);
const balance = (stamina: number) => ({
  stamina,
  maxStamina: 100,
  staminaUpdatedAt: start,
});

describe('stamina', () => {
  test('charges the base plus rounded-up per-turn cost', () => {
    expect(staminaCost(100, { ...rules, perTurnCost: 1.1 })).toBe(112);
    expect(staminaCost(1, rules)).toBe(3);
    expect(staminaCost(2, rules)).toBe(3);
    expect(staminaCost(3, rules)).toBe(4);
    expect(staminaCost(3, { ...rules, enabled: false })).toBe(0);
    expect(staminaCost(10, rules, 22)).toBe(4);
  });
  test('recovers whole intervals and preserves the remainder', () => {
    expect(projectStamina(balance(40), rules, at(25))).toEqual({
      stamina: 50,
      maxStamina: 100,
      staminaUpdatedAt: at(20),
    });
  });
  test('caps recovery and does not bank time while full', () => {
    expect(projectStamina(balance(99), rules, at(25))).toEqual({
      stamina: 100,
      maxStamina: 100,
      staminaUpdatedAt: at(25),
    });
    expect(
      projectStamina(balance(100), rules, at(25)).staminaUpdatedAt,
    ).toEqual(at(25));
  });
  test('pauses the clock when recovery or stamina is disabled', () => {
    for (const inactive of [
      { ...rules, enabled: false },
      { ...rules, recoveryEnabled: false },
    ]) {
      expect(projectStamina(balance(40), inactive, at(25))).toEqual({
        stamina: 40,
        maxStamina: 100,
        staminaUpdatedAt: at(25),
      });
    }
  });
  test('does not recover from future timestamps', () => {
    expect(
      projectStamina(
        { ...balance(40), staminaUpdatedAt: at(30) },
        rules,
        at(25),
      ),
    ).toEqual({
      stamina: 40,
      maxStamina: 100,
      staminaUpdatedAt: at(25),
    });
  });
});

describe('stamina guide values', () => {
  test('describe the live rules players read in the guides', () => {
    expect(staminaGuideValues(rules)).toEqual({
      max: 100,
      base: 2,
      perTurn: 0.5,
      turns: 10,
      example: 7,
      amount: 5,
      minutes: 10,
      fullTime: '3h\u00a020m',
      threshold: 50,
      floor: 80,
    });
  });

  test('follow admin changes to the rules', () => {
    const tuned = staminaGuideValues({
      ...rules,
      recoveryAmount: 10,
      recoveryIntervalMinutes: 5,
      baseCost: 4,
    });
    expect(tuned.fullTime).toBe('50m');
    expect(tuned.example).toBe(9);
  });
});
