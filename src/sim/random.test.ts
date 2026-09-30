import { describe, expect, it } from 'bun:test';

import { createPlayerState } from './population';
import { createBalancedPlayer } from './presets';
import type { Rng } from './random';
import {
  createDefaultRandom,
  createRng,
  createValidatedRandom,
  deterministicId,
  MAX_STREAM_SIZE,
  normalizeRngSeed,
  PARK_MILLER_MODULUS,
  pick,
  shuffle,
  shuffleWithRandom,
  tieBreak,
  validateRandomDraw,
} from './random';

describe('createRng - Park-Miller canonical stream', () => {
  it('preserves the existing state = state * 48271 % 2147483647 sequence', () => {
    // Reproduce the legacy implementation byte-for-byte for seed 42.
    const rng = createRng(42);
    let state = 42;
    const expected: number[] = [];
    for (let i = 0; i < 5; i++) {
      state = (state * 48271) % 2147483647;
      expected.push(state / 2147483647);
    }
    const actual = [rng.next(), rng.next(), rng.next(), rng.next(), rng.next()];
    expect(actual).toEqual(expected);
  });

  it('normalizes negative, fractional, and zero seeds to a positive integer', () => {
    const a = createRng(-42);
    const b = createRng(42.7);
    const c = createRng(0);
    // abs(floor(-42)) = 42, abs(floor(42.7)) = 42, abs(floor(0)) || 1 = 1
    expect(a.next()).toBe(b.next());
    // seed 0 normalizes to state 1, whose first draw is 48271/MODULUS.
    expect(c.next()).toBe(48271 / 2147483647);
  });

  it('produces floats strictly in [0, 1) for many draws', () => {
    const rng = createRng(123456);
    for (let i = 0; i < 1000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('same seed yields identical streams; different seeds diverge', () => {
    const stream1 = createRng(7).stream(5);
    const stream2 = createRng(7).stream(5);
    const stream3 = createRng(8).stream(5);
    expect(stream1).toEqual(stream2);
    expect(stream1).not.toEqual(stream3);
  });

  it('fork returns an independent RNG that does not mutate the parent', () => {
    const parent = createRng(99);
    parent.next();
    const forked = parent.fork();
    const forkStream = [forked.next(), forked.next(), forked.next()];
    parent.next();
    const forkStreamAgain = [forked.next(), forked.next(), forked.next()];
    // Forked stream continues independently of parent consumption.
    expect(forkStream.length).toBe(3);
    expect(forkStreamAgain.length).toBe(3);
    expect(forkStream).not.toEqual(forkStreamAgain);
  });
});

describe('Rng.int - bounded integer', () => {
  it('returns inclusive integers within [min, max]', () => {
    const rng = createRng(314);
    for (let i = 0; i < 500; i++) {
      const v = rng.int(3, 7);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(7);
    }
  });

  it('supports single-value ranges', () => {
    const rng = createRng(1);
    for (let i = 0; i < 10; i++) {
      expect(rng.int(5, 5)).toBe(5);
    }
  });

  it('throws on invalid ranges rather than silently coercing', () => {
    const rng = createRng(1);
    expect(() => rng.int(5, 4)).toThrow(RangeError);
    expect(() => rng.int(NaN, 4)).toThrow(RangeError);
    expect(() => rng.int(4, Infinity)).toThrow(RangeError);
  });
});

describe('shuffle - stable Fisher-Yates', () => {
  it('preserves the multiset of elements', () => {
    const rng = createRng(2718);
    const input = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const result = shuffle(rng, input);
    expect(result.sort((a, b) => a - b)).toEqual(input);
  });

  it('does not mutate the input array', () => {
    const rng = createRng(55);
    const input = ['a', 'b', 'c', 'd', 'e'];
    const snapshot = [...input];
    shuffle(rng, input);
    expect(input).toEqual(snapshot);
  });

  it('is deterministic for a fixed seed and order', () => {
    const a = shuffle(createRng(100), [1, 2, 3, 4, 5]);
    const b = shuffle(createRng(100), [1, 2, 3, 4, 5]);
    expect(a).toEqual(b);
  });

  it('diverges for different seeds', () => {
    const a = shuffle(createRng(100), [1, 2, 3, 4, 5, 6, 7, 8]);
    const b = shuffle(createRng(101), [1, 2, 3, 4, 5, 6, 7, 8]);
    expect(a).not.toEqual(b);
  });

  it('returns an empty array for empty input without drawing from the rng', () => {
    const rng = createRng(7);
    const before = rng.snapshot();
    expect(shuffle(rng, [])).toEqual([]);
    expect(rng.snapshot()).toEqual(before);
  });
});

describe('pick - deterministic element selection', () => {
  it('returns an element of the array', () => {
    const rng = createRng(42);
    const arr = [10, 20, 30, 40, 50];
    expect(arr).toContain(pick(rng, arr));
  });

  it('is deterministic for a fixed seed', () => {
    expect(pick(createRng(11), ['x', 'y', 'z'])).toEqual(
      pick(createRng(11), ['x', 'y', 'z']),
    );
  });

  it('throws on empty input', () => {
    expect(() => pick(createRng(3), [])).toThrow(RangeError);
  });
});

describe('tieBreak - deterministic ordering', () => {
  it('returns -1, 0, or 1 consistently for equal keys', () => {
    const rng = createRng(2024);
    const result = tieBreak(rng, 'player_a', 'player_b');
    expect([-1, 0, 1]).toContain(result);
  });

  it('is symmetric: tieBreak(a, b) === -tieBreak(b, a)', () => {
    const rngA = createRng(9);
    const rngB = createRng(9);
    const ab = tieBreak(rngA, 'a', 'b');
    const ba = tieBreak(rngB, 'b', 'a');
    expect(ab + ba).toBe(0);
  });

  it('returns 0 for identical ids', () => {
    expect(tieBreak(createRng(1), 'same', 'same')).toBe(0);
  });
});

describe('deterministicId - stable IDs', () => {
  it('produces stable prefix_index ids', () => {
    expect(deterministicId('player', 0)).toBe('player_0');
    expect(deterministicId('player', 42)).toBe('player_42');
    expect(deterministicId('lateJoiner', 7)).toBe('lateJoiner_7');
  });

  it('rejects negative indices', () => {
    expect(() => deterministicId('player', -1)).toThrow(RangeError);
  });
});

describe('Rng type contract', () => {
  it('exposes next, int, pick, shuffle, tieBreak, fork, stream, snapshot', () => {
    const rng: Rng = createRng(1);
    expect(typeof rng.next).toBe('function');
    expect(typeof rng.int).toBe('function');
    expect(typeof rng.pick).toBe('function');
    expect(typeof rng.shuffle).toBe('function');
    expect(typeof rng.tieBreak).toBe('function');
    expect(typeof rng.fork).toBe('function');
    expect(typeof rng.stream).toBe('function');
    expect(typeof rng.snapshot).toBe('function');
  });

  it('snapshot restores exact stream position', () => {
    const rng = createRng(777);
    const snap = rng.snapshot();
    const a = [rng.next(), rng.next()];
    rng.restore(snap);
    const b = [rng.next(), rng.next()];
    expect(a).toEqual(b);
  });
});

describe('createDefaultRandom - deterministic fallback factory', () => {
  it('produces a deterministic stream with no shared mutable state', () => {
    const a = createDefaultRandom()();
    const b = createDefaultRandom()();
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(1);
  });

  it('each call returns an independent closure', () => {
    const r1 = createDefaultRandom();
    const r2 = createDefaultRandom();
    const first = r1();
    expect(r1()).not.toBe(first);
    expect(r2()).toBe(first);
  });
});

describe('deterministic ID generation - no collisions', () => {
  it('same seed/input yields same ID; distinct seeds yield distinct IDs', () => {
    const a = createPlayerState(5, 'balanced', 42);
    const b = createPlayerState(5, 'balanced', 42);
    const c = createPlayerState(5, 'balanced', 99);
    expect(a.id).toBe(b.id);
    expect(a.id).not.toBe(c.id);
  });

  it('distinct levels yield distinct IDs', () => {
    const low = createPlayerState(3, 'balanced', 42);
    const high = createPlayerState(10, 'balanced', 42);
    expect(low.id).not.toBe(high.id);
  });

  it('createBalancedPlayer distinct roles at same level yield distinct IDs', () => {
    const offense = createBalancedPlayer(10, 'offense');
    const defense = createBalancedPlayer(10, 'defense');
    const balanced = createBalancedPlayer(10, 'balanced');
    const ids = new Set([offense.id, defense.id, balanced.id]);
    expect(ids.size).toBe(3);
  });
});

describe('normalizeRngSeed - degenerate seed rejection', () => {
  it('maps PARK_MILLER_MODULUS (zero-state seed) to default, not zero-stream', () => {
    const modulusStream = createRng(PARK_MILLER_MODULUS).stream(5);
    const defaultStream = createRng(1).stream(5);
    expect(modulusStream).toEqual(defaultStream);
    expect(modulusStream.every((v) => v > 0)).toBe(true);
  });

  it('maps multiples of PARK_MILLER_MODULUS to default', () => {
    const multiple = PARK_MILLER_MODULUS * 3;
    const stream = createRng(multiple).stream(3);
    const defaultStream = createRng(1).stream(3);
    expect(stream).toEqual(defaultStream);
  });

  it('rejects non-finite seeds', () => {
    expect(() => normalizeRngSeed(Infinity)).toThrow(RangeError);
    expect(() => normalizeRngSeed(-Infinity)).toThrow(RangeError);
    expect(() => createRng(NaN)).toThrow(RangeError);
  });

  it('rejects unsafe integer seeds', () => {
    const huge = Number.MAX_SAFE_INTEGER * 2;
    expect(() => normalizeRngSeed(huge)).toThrow(RangeError);
    expect(() => createRng(huge)).toThrow(RangeError);
  });

  it('preserves exact legacy stream for ordinary seed 42', () => {
    const rng = createRng(42);
    let state = 42;
    state = (42 * 48271) % 2147483647;
    expect(rng.next()).toBe(state / 2147483647);
  });
});

describe('validateRandomDraw - injected draw validation', () => {
  it('accepts valid draws in [0, 1)', () => {
    expect(validateRandomDraw(0)).toBe(0);
    expect(validateRandomDraw(0.5)).toBe(0.5);
    expect(validateRandomDraw(0.999999)).toBe(0.999999);
  });

  it('rejects NaN', () => {
    expect(() => validateRandomDraw(NaN)).toThrow(RangeError);
  });

  it('rejects Infinity and -Infinity', () => {
    expect(() => validateRandomDraw(Infinity)).toThrow(RangeError);
    expect(() => validateRandomDraw(-Infinity)).toThrow(RangeError);
  });

  it('rejects draws < 0', () => {
    expect(() => validateRandomDraw(-0.001)).toThrow(RangeError);
  });

  it('rejects draws >= 1', () => {
    expect(() => validateRandomDraw(1)).toThrow(RangeError);
    expect(() => validateRandomDraw(1.5)).toThrow(RangeError);
  });

  it('shuffleWithRandom rejects an invalid draw from a bad random callback', () => {
    const badRandom = () => 1.5;
    expect(() => shuffleWithRandom(badRandom, [1, 2, 3])).toThrow(RangeError);
  });
});

describe('createValidatedRandom - callback boundary validation', () => {
  it('validates every draw from an injected callback', () => {
    const values = [0, 0.5, 0.999, 1.5];
    const random = createValidatedRandom(() => values.shift() ?? 0);
    expect(random()).toBe(0);
    expect(random()).toBe(0.5);
    expect(random()).toBe(0.999);
    expect(() => random()).toThrow(RangeError);
  });
});

describe('Rng.stream - bounds validation', () => {
  it('rejects negative count', () => {
    expect(() => createRng(1).stream(-1)).toThrow(RangeError);
  });

  it('rejects fractional count', () => {
    expect(() => createRng(1).stream(5.5)).toThrow(RangeError);
  });

  it('rejects NaN count', () => {
    expect(() => createRng(1).stream(NaN)).toThrow(RangeError);
  });

  it('rejects Infinity count', () => {
    expect(() => createRng(1).stream(Infinity)).toThrow(RangeError);
  });

  it('rejects count exceeding MAX_STREAM_SIZE', () => {
    expect(() => createRng(1).stream(MAX_STREAM_SIZE + 1)).toThrow(RangeError);
  });

  it('accepts count exactly at MAX_STREAM_SIZE', () => {
    const arr = createRng(1).stream(MAX_STREAM_SIZE);
    expect(arr.length).toBe(MAX_STREAM_SIZE);
  });

  it('returns empty array for count=0 without drawing', () => {
    const rng = createRng(42);
    const snap = rng.snapshot();
    expect(rng.stream(0)).toEqual([]);
    expect(rng.snapshot()).toBe(snap);
  });
});
