import { describe, expect, it } from 'bun:test';

import {
  getDefenseAdvisory,
  projectDefenseAdvisoryFacts,
} from '@/utils/defenseAdvisory';

const stats = (overrides: Record<string, unknown> = {}) => ({
  fort_breached: true,
  defender_losses: JSON.stringify({
    units: [
      { type: 'CITIZEN', level: 1, quantity: 2 },
      { type: 'WORKER', level: 1, quantity: 3 },
      { type: 'OFFENSE', level: 1, quantity: 1 },
      { type: 'DEFENSE', level: 1, quantity: 5 },
    ],
  }),
  ...overrides,
});
const advisory = (value: unknown, defender = true) =>
  getDefenseAdvisory(
    { defense_advisory: projectDefenseAdvisoryFacts(value) },
    defender,
  );

describe('defense advisory facts', () => {
  it('summarizes recorded citizen, worker and offensive casualties', () => {
    expect(projectDefenseAdvisoryFacts(stats())).toEqual({
      fortBreached: true,
      civilianLosses: 5,
      offensiveLosses: 1,
    });
    expect(advisory(stats())).toBe('both');
  });
  it('does not advise on intact forts or defense-only losses', () => {
    expect(advisory(stats({ fort_breached: false }))).toBeNull();
    expect(
      advisory(
        stats({
          defender_losses: { units: [{ type: 'DEFENSE', quantity: 8 }] },
        }),
      ),
    ).toBeNull();
    expect(advisory(stats({ defender_losses: { units: [] } }))).toBeNull();
  });
  it('requires valid legacy endpoints and preserves unknown data', () => {
    for (const value of [
      {},
      { forthpAtStart: 10 },
      { forthpAtEnd: 0 },
      { forthpAtStart: '', forthpAtEnd: 0 },
      { forthpAtStart: 10, forthpAtEnd: 'invalid' },
    ]) {
      expect(projectDefenseAdvisoryFacts(value).fortBreached).toBeNull();
    }
    expect(
      projectDefenseAdvisoryFacts({ forthpAtStart: '10', forthpAtEnd: '0' })
        .fortBreached,
    ).toBe(true);
    expect(
      projectDefenseAdvisoryFacts({ forthpAtStart: 10, forthpAtEnd: 5 })
        .fortBreached,
    ).toBe(false);
    expect(advisory(stats({ fort_breached: undefined }))).toBeNull();
    expect(advisory(stats({ defender_losses: '{invalid' }))).toBeNull();
  });
  it('does not fabricate losses from invalid counts or a missing breakdown', () => {
    for (const quantity of [null, '', 'bad', -1, false]) {
      const value = stats({
        defender_losses: { units: [{ type: 'CITIZEN', quantity }] },
      });
      expect(projectDefenseAdvisoryFacts(value).civilianLosses).toBeNull();
      expect(advisory(value)).toBeNull();
    }
    expect(advisory(stats({ defender_losses: { total: 100 } }))).toBeNull();
  });
  it('uses only known casualty categories and does not advise another viewer', () => {
    expect(
      advisory(
        stats({
          defender_losses: { units: [{ type: 'WORKER', quantity: 2 }] },
        }),
      ),
    ).toBe('civilian');
    expect(
      advisory(
        stats({
          defender_losses: { units: [{ type: 'OFFENSE', quantity: 2 }] },
        }),
      ),
    ).toBe('offensive');
    expect(advisory(stats(), false)).toBeNull();
    expect(getDefenseAdvisory(stats(), true)).toBeNull();
  });
});
