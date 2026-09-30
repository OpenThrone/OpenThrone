import { describe, expect, it } from 'bun:test';

import { PERSONAS } from '../scenarioTypes';
import {
  getAllocationBand,
  interpolateBand,
  PERSONA_ALLOCATION_BANDS,
  recruitmentShareTotal,
  validateAllocationBands,
} from './bands';
import type { PersonaAllocationBand } from './types';

describe('persona allocation bands', () => {
  it('provides an explicit stable band for each of the six personas', () => {
    for (const persona of PERSONAS) {
      expect(PERSONA_ALLOCATION_BANDS[persona].persona).toBe(persona);
    }
    expect(PERSONAS).toHaveLength(6);
  });

  it('every band recruitment shares sum to exactly 1', () => {
    for (const persona of PERSONAS) {
      expect(recruitmentShareTotal(persona)).toBeCloseTo(1, 10);
    }
  });

  it('validateAllocationBands passes for the shipped bands', () => {
    expect(() => validateAllocationBands()).not.toThrow();
  });

  it('differentiates personas by offense emphasis (identity differentiation)', () => {
    const shares = PERSONAS.map(
      (p) => PERSONA_ALLOCATION_BANDS[p].offenseShare,
    );
    expect(new Set(shares).size).toBeGreaterThan(1);
    expect(PERSONA_ALLOCATION_BANDS.attacker.offenseShare).toBeGreaterThan(
      PERSONA_ALLOCATION_BANDS.defender.offenseShare,
    );
  });

  it('attacker emphasizes offense, defender emphasizes defense, farmer emphasizes workers, spy/sentry emphasize their domain', () => {
    const attacker = getAllocationBand('attacker');
    const defender = getAllocationBand('defender');
    const farmer = getAllocationBand('farmer');
    const spy = getAllocationBand('spy');
    const sentry = getAllocationBand('sentry');
    expect(attacker.offenseShare).toBeGreaterThan(defender.offenseShare);
    expect(defender.defenseShare).toBeGreaterThan(attacker.defenseShare);
    expect(farmer.workerShare).toBeGreaterThan(attacker.workerShare);
    expect(spy.spyShare).toBeGreaterThan(defender.spyShare);
    expect(sentry.sentryShare).toBeGreaterThan(attacker.sentryShare);
  });

  it('bands are stable across repeated reads (identity never mutates)', () => {
    const first = getAllocationBand('balanced');
    const second = getAllocationBand('balanced');
    expect(second).toEqual(first);
    expect(PERSONA_ALLOCATION_BANDS.balanced).toEqual(first);
  });

  it('interpolateBand never mutates inputs and clamps t to [0,1]', () => {
    const greedy = getAllocationBand('farmer');
    const cautious: PersonaAllocationBand = {
      ...greedy,
      workerShare: 0.1,
      defenseShare: 0.4,
      sentryShare: 0.4,
    };
    const greedySnapshot = { ...greedy };
    const cautiousSnapshot = { ...cautious };

    const at0 = interpolateBand(greedy, cautious, 0);
    const at1 = interpolateBand(greedy, cautious, 1);
    const overClamped = interpolateBand(greedy, cautious, 5);
    const underClamped = interpolateBand(greedy, cautious, -1);

    expect(at0.workerShare).toBeCloseTo(greedy.workerShare, 10);
    expect(at1.workerShare).toBeCloseTo(cautious.workerShare, 10);
    expect(overClamped).toEqual(at1);
    expect(underClamped).toEqual(at0);
    expect(greedy).toEqual(greedySnapshot);
    expect(cautious).toEqual(cautiousSnapshot);
  });
});
