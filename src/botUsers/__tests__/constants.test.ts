import { describe, expect, it } from 'bun:test';

import {
  DEFAULT_CLASS_DISTRIBUTION,
  DEFAULT_PERSONA_DISTRIBUTION,
  DEFAULT_RACE_DISTRIBUTION,
  PERSONA_TRAINING_PREFERENCE,
} from '../constants';
import type { BotPersona } from '../types';

describe('PERSONA_TRAINING_PREFERENCE', () => {
  it('maps every persona to a valid TRAIN_* action', () => {
    const validActions = ['TRAIN_WORKER', 'TRAIN_OFFENSE', 'TRAIN_DEFENSE'];
    for (const persona of Object.keys(
      PERSONA_TRAINING_PREFERENCE,
    ) as BotPersona[]) {
      expect(validActions).toContain(PERSONA_TRAINING_PREFERENCE[persona]);
    }
  });

  it('maps farmer personas to TRAIN_WORKER', () => {
    expect(PERSONA_TRAINING_PREFERENCE.FARMER_GREEDY).toBe('TRAIN_WORKER');
    expect(PERSONA_TRAINING_PREFERENCE.FARMER_CAUTIOUS).toBe('TRAIN_WORKER');
    expect(PERSONA_TRAINING_PREFERENCE.FARMER_ADAPTIVE).toBe('TRAIN_WORKER');
  });

  it('maps AGGRESSIVE to TRAIN_OFFENSE and DEFENSIVE to TRAIN_DEFENSE', () => {
    expect(PERSONA_TRAINING_PREFERENCE.AGGRESSIVE).toBe('TRAIN_OFFENSE');
    expect(PERSONA_TRAINING_PREFERENCE.DEFENSIVE).toBe('TRAIN_DEFENSE');
  });
});

describe('DEFAULT_DISTRIBUTIONS', () => {
  const sum = (obj: Record<string, number>) =>
    Object.values(obj).reduce((acc, n) => acc + n, 0);

  it('race distribution sums to 1.0', () => {
    expect(sum(DEFAULT_RACE_DISTRIBUTION)).toBeCloseTo(1, 5);
  });

  it('class distribution sums to 1.0', () => {
    expect(sum(DEFAULT_CLASS_DISTRIBUTION)).toBeCloseTo(1, 5);
  });

  it('persona distribution sums to 1.0', () => {
    expect(sum(DEFAULT_PERSONA_DISTRIBUTION)).toBeCloseTo(1, 5);
  });

  it('all four races are present', () => {
    expect(Object.keys(DEFAULT_RACE_DISTRIBUTION).sort()).toEqual([
      'ELF',
      'GOBLIN',
      'HUMAN',
      'UNDEAD',
    ]);
  });

  it('all four classes are present', () => {
    expect(Object.keys(DEFAULT_CLASS_DISTRIBUTION).sort()).toEqual([
      'ASSASSIN',
      'CLERIC',
      'FIGHTER',
      'THIEF',
    ]);
  });
});
