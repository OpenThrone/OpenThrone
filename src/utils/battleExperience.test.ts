import { describe, expect, it } from 'bun:test';

import { levelXPArray } from '@/constants';
import { calculateBattleExperience } from '@/utils/attackFunctions';

/** Attacker XP for a full 10-turn win at full stamina against an equal level. */
const winXp = (level: number) =>
  calculateBattleExperience(true, 0, 10, false, 1, 100, level).attackerXP;

describe('battle XP per turn', () => {
  it('tapers gently from 360 to 200 a turn', () => {
    const base = winXp(1);
    expect(winXp(10)).toBe(base);
    expect(winXp(11) / base).toBeCloseTo(300 / 360, 2);
    expect(winXp(26) / base).toBeCloseTo(260 / 360, 2);
    expect(winXp(51) / base).toBeCloseTo(230 / 360, 2);
    expect(winXp(76) / base).toBeCloseTo(200 / 360, 2);
    expect(winXp(99) / base).toBeCloseTo(200 / 360, 2);
  });

  it('never pays more for a higher level', () => {
    for (let level = 2; level <= 100; level++) {
      expect(winXp(level)).toBeLessThanOrEqual(winXp(level - 1));
    }
  });

  it('puts level 100 within about two years of perfect play', () => {
    // 48 turns a day, every attack a 10-turn win: the ceiling no player beats.
    const xpFor = (level: number) =>
      levelXPArray.find((entry) => entry.level === level)!.xp;
    let turns = 0;
    for (let level = 1; level < 100; level++) {
      turns += (xpFor(level + 1) - xpFor(level)) / (winXp(level) / 10);
    }
    const days = turns / 48;
    expect(days).toBeGreaterThan(540);
    expect(days).toBeLessThan(760);
  });
});
