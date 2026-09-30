/**
 * Canonical deterministic RNG for `src/sim`.
 *
 * Preserves the existing Park-Miller minimal LCG used by `population.ts`,
 * `daycycle.ts`, and `v5Combat.test.ts`:
 *
 *   state_{n+1} = (state_n * 48271) mod 2147483647
 *   u_{n+1}     = state_{n+1} / 2147483647
 *
 * The first draw advances the state once before returning, matching the
 * historical `seededRandom` closures byte-for-byte. All scenario-relevant
 * randomness (IDs, shuffles, tie-breakers, activity, behavior) MUST route
 * through this module so identical seeds reproduce identical streams.
 */

const PARK_MILLER_MULTIPLIER = 48271;
const PARK_MILLER_MODULUS = 2147483647;

export const DEFAULT_SIM_SEED = 1;
export const MAX_STREAM_SIZE = 1_000_000;

function normalizeSeed(seed: number): number {
  if (!Number.isFinite(seed)) {
    throw new RangeError(`RNG seed must be finite; received ${seed}`);
  }
  const floored = Math.abs(Math.floor(seed));
  if (!Number.isSafeInteger(floored)) {
    throw new RangeError(
      `RNG seed must normalize to a safe integer; received ${seed}`,
    );
  }
  const reduced = floored % PARK_MILLER_MODULUS;
  return reduced || DEFAULT_SIM_SEED;
}

export interface Rng {
  next(): number;
  int(minInclusive: number, maxInclusive: number): number;
  pick<T>(items: readonly T[]): T;
  shuffle<T>(items: readonly T[]): T[];
  tieBreak(leftId: string, rightId: string): -1 | 0 | 1;
  fork(): Rng;
  stream(count: number): number[];
  snapshot(): number;
  restore(state: number): void;
}

export function createRng(seed: number): Rng {
  let state = normalizeSeed(seed);

  const next = (): number => {
    state = (state * PARK_MILLER_MULTIPLIER) % PARK_MILLER_MODULUS;
    return state / PARK_MILLER_MODULUS;
  };

  const int = (minInclusive: number, maxInclusive: number): number => {
    if (
      !Number.isFinite(minInclusive) ||
      !Number.isInteger(minInclusive) ||
      !Number.isFinite(maxInclusive) ||
      !Number.isInteger(maxInclusive) ||
      minInclusive > maxInclusive
    ) {
      throw new RangeError(
        `Rng.int requires integer min <= max; received min=${minInclusive}, max=${maxInclusive}`,
      );
    }
    const span = maxInclusive - minInclusive;
    if (span === 0) return minInclusive;
    return minInclusive + Math.floor(next() * (span + 1));
  };

  const pick = <T>(items: readonly T[]): T => {
    if (items.length === 0) {
      throw new RangeError('Rng.pick requires a non-empty array');
    }
    return items[int(0, items.length - 1)];
  };

  const shuffle = <T>(items: readonly T[]): T[] => {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = int(0, i);
      const tmp = out[i];
      out[i] = out[j];
      out[j] = tmp;
    }
    return out;
  };

  const tieBreak = (leftId: string, rightId: string): -1 | 0 | 1 => {
    if (leftId === rightId) return 0;
    const draw = next();
    const first = leftId < rightId ? leftId : rightId;
    if (draw < 0.5) {
      return leftId === first ? -1 : 1;
    }
    return leftId === first ? 1 : -1;
  };

  const fork = (): Rng => {
    const forked = createRng(state);
    // Advance parent so forked and parent streams diverge on subsequent draws.
    next();
    return forked;
  };

  const stream = (count: number): number[] => {
    if (!Number.isFinite(count) || !Number.isInteger(count) || count < 0) {
      throw new RangeError(
        `Rng.stream requires a non-negative integer count; received ${count}`,
      );
    }
    if (!Number.isSafeInteger(count)) {
      throw new RangeError(
        `Rng.stream count exceeds safe integer range; received ${count}`,
      );
    }
    if (count > MAX_STREAM_SIZE) {
      throw new RangeError(
        `Rng.stream count ${count} exceeds maximum ${MAX_STREAM_SIZE}`,
      );
    }
    const out: number[] = [];
    for (let i = 0; i < count; i++) out.push(next());
    return out;
  };

  const snapshot = (): number => state;
  const restore = (nextState: number): void => {
    state = normalizeSeed(nextState);
  };

  return {
    next,
    int,
    pick,
    shuffle,
    tieBreak,
    fork,
    stream,
    snapshot,
    restore,
  };
}

export function shuffle<T>(rng: Rng, items: readonly T[]): T[] {
  return rng.shuffle(items);
}

/**
 * Unbiased Fisher-Yates shuffle driven by a legacy `() => number` random
 * source. Use this at boundaries that still receive `SimulationConfig.random`
 * rather than a full `Rng` instance, so the shuffle is no longer biased by
 * the previous `sort(() => random() - 0.5)` implementation.
 */
export function shuffleWithRandom<T>(
  random: () => number,
  items: readonly T[],
): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(validateRandomDraw(random()) * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

export function pick<T>(rng: Rng, items: readonly T[]): T {
  return rng.pick(items);
}

export function tieBreak(
  rng: Rng,
  leftId: string,
  rightId: string,
): -1 | 0 | 1 {
  return rng.tieBreak(leftId, rightId);
}

export function deterministicId(prefix: string, index: number): string {
  if (!Number.isInteger(index) || index < 0) {
    throw new RangeError(
      `deterministicId requires a non-negative integer index; received ${index}`,
    );
  }
  return `${prefix}_${index}`;
}

/**
 * Returns a fresh `() => number` stream seeded from `DEFAULT_SIM_SEED`.
 * Each call creates an independent closure so no mutable global RNG state
 * is shared across callers. Use as the deterministic fallback wherever a
 * `random` parameter cannot yet be made required.
 */
export function createDefaultRandom(): () => number {
  return createRng(DEFAULT_SIM_SEED).next;
}

export function createValidatedRandom(random: () => number): () => number {
  return () => validateRandomDraw(random());
}

export function validateRandomDraw(draw: number): number {
  if (!Number.isFinite(draw) || draw < 0 || draw >= 1) {
    throw new RangeError(
      `random() must return a finite number in [0, 1); received ${draw}`,
    );
  }
  return draw;
}

export {
  normalizeSeed as normalizeRngSeed,
  PARK_MILLER_MODULUS,
  PARK_MILLER_MULTIPLIER,
};
