import { describe, expect, test } from 'bun:test';

import {
  attackerStaminaMultiplier,
  attackerStaminaPercent,
  getArmyStaminaState,
  staminaDrainFactor,
} from '@/constants/ArmyStamina';
import { OffensiveUpgrades } from '@/constants/Structure_Upgrades';

describe('army stamina', () => {
  test('scales and clamps offense', () => {
    expect(attackerStaminaMultiplier(100)).toBe(1);
    expect(attackerStaminaMultiplier(50)).toBe(1);
    expect(attackerStaminaMultiplier(25)).toBeCloseTo(0.9);
    expect(attackerStaminaMultiplier(0)).toBe(0.8);
    expect(attackerStaminaMultiplier(-1)).toBe(0.8);
    expect(attackerStaminaMultiplier(101)).toBe(1);
    expect(attackerStaminaMultiplier(Number.NaN)).toBe(1);
    expect(attackerStaminaPercent(25)).toBe(10);
    expect(attackerStaminaMultiplier(25, 100, 0.6)).toBeCloseTo(0.7);
  });
  test('classifies condition bands', () => {
    expect(getArmyStaminaState(50)).toBe('rested');
    expect(getArmyStaminaState(49)).toBe('weary');
    expect(getArmyStaminaState(25)).toBe('weary');
    expect(getArmyStaminaState(24)).toBe('exhausted');
    expect(getArmyStaminaState(30, 80)).toBe('exhausted');
    expect(getArmyStaminaState(40, 80)).toBe('weary');
  });
  test('reduces drain as offense structures improve', () => {
    const top = Math.max(...OffensiveUpgrades.map((upgrade) => upgrade.level));
    expect(staminaDrainFactor(1)).toBe(1);
    expect(staminaDrainFactor(top)).toBe(0.5);
    expect(staminaDrainFactor(Math.floor(top / 2))).toBeLessThan(1);
    expect(staminaDrainFactor(Math.floor(top / 2))).toBeGreaterThan(0.5);
  });
});
