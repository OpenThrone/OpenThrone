import { describe, expect, it } from 'bun:test';

import {
  calculateProgressionPacing,
  getLevelFromSimXp,
  getXpFloorForLevel,
  getXpRemainingToLevel100,
} from './progression';

describe('progression helpers', () => {
  it('maps live XP floors to simulator levels', () => {
    expect(getXpFloorForLevel(1)).toBe(0);
    expect(getLevelFromSimXp(getXpFloorForLevel(2) - 1)).toBe(1);
    expect(getLevelFromSimXp(getXpFloorForLevel(2))).toBe(2);
    expect(getLevelFromSimXp(getXpFloorForLevel(100))).toBe(100);
  });

  it('projects level 100 pacing from the fastest tracked player', () => {
    const result = calculateProgressionPacing([
      {
        id: 'slow',
        displayName: 'Slow Defender',
        started: { day: 0 },
        final: { day: 30, xp: 30000 },
        deltas: { xp: 30000 },
      },
      {
        id: 'attacker',
        displayName: 'Attack + Loot',
        started: { day: 0 },
        final: { day: 30, xp: 90000 },
        deltas: { xp: 90000 },
      },
    ]);

    expect(result.pacingPlayerId).toBe('attacker');
    expect(result.avgXpPerDay).toBe(3000);
    expect(result.projectedDaysToLevel100).toBe(
      getXpRemainingToLevel100(90000) / 3000,
    );
  });

  it('returns empty pacing when no tracked player gains XP', () => {
    const result = calculateProgressionPacing([
      {
        id: 'idle',
        displayName: 'Idle Player',
        started: { day: 0 },
        final: { day: 30, xp: 0 },
        deltas: { xp: 0 },
      },
    ]);

    expect(result.avgXpPerDay).toBe(0);
    expect(result.projectedDaysToLevel100).toBeNull();
  });
});
