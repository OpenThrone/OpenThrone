import { describe, expect, it } from 'bun:test';

import { FARMER_VARIANTS, PERSONAS } from '../scenarioTypes';
import type {
  PersonaDecision,
  PersonaObservation,
  PersonaPublicTargetIntel,
  PersonaSelfObservation,
  PersonaTacticalState,
} from './types';

describe('persona policy type contracts', () => {
  it('the six personas are the only stable identities', () => {
    expect(PERSONAS).toEqual([
      'farmer',
      'attacker',
      'defender',
      'spy',
      'sentry',
      'balanced',
    ]);
  });

  it('farmer variants are exactly greedy/cautious/adaptive', () => {
    expect(FARMER_VARIANTS).toEqual(['greedy', 'cautious', 'adaptive']);
  });

  it('PersonaPublicTargetIntel has no field that can carry exact opponent gold/units/hp', () => {
    const target: PersonaPublicTargetIntel = {
      targetId: 'x',
      level: 1,
      withinAttackRange: true,
      powerBand: 'even',
      fortStatusBand: 'secure',
      goldBand: 'rich',
      observedLoot: 0,
      intelFreshness: 'none',
      recentlyAttackedByMe: false,
      attackedMeRecently: false,
    };
    const keys = Object.keys(target);
    expect(keys).not.toContain('gold');
    expect(keys).not.toContain('units');
    expect(keys).not.toContain('fortHp');
    expect(keys).not.toContain('fortMaxHp');
    expect(keys).not.toContain('power');
  });

  it('PersonaDecision never names a specific target id (selection deferred to Todo 9)', () => {
    const decision: PersonaDecision = {
      stance: 'farmer-greedy-harvest',
      recruitment: { worker: 5 },
      upgradeEconomy: false,
      upgradeDefense: false,
      upgradeSpy: false,
      upgradeSentry: false,
      repairFort: false,
      bankGold: 0,
      attackTurnsToSpend: 0,
      preferredTargetBand: 'any',
      intelMissionsToPlan: 0,
      rationale: [],
    };
    const json = JSON.stringify(decision);
    expect(json).not.toContain('targetId');
    expect(json).not.toContain('target');
  });

  it('PersonaTacticalState carries identity plus only the adaptive alert level', () => {
    const tactical: PersonaTacticalState = {
      persona: 'farmer',
      farmerVariant: 'adaptive',
      alertLevel: 0,
    };
    expect(tactical.persona).toBe('farmer');
    expect(tactical.farmerVariant).toBe('adaptive');
    expect(typeof tactical.alertLevel).toBe('number');
  });

  it('observation composes self + targets without a hidden-state channel', () => {
    const observation: PersonaObservation = {
      self: {} as PersonaSelfObservation,
      targets: [],
    };
    expect(Array.isArray(observation.targets)).toBe(true);
    expect(Object.keys(observation)).toEqual(['self', 'targets']);
  });
});
