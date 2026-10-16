/* eslint-disable no-bitwise */
export type RandomFn = () => number;

const MODULUS = 2147483647;
const MULTIPLIER = 48271;

function hashSeed(seed: number | string): number {
  const text = String(seed);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193);
  }
  // Mix every seed bit before the first LCG draw; neighboring labels must not
  // produce neighboring initial states in statistical probes.
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  hash ^= hash >>> 16;
  return ((hash >>> 0) % (MODULUS - 1)) + 1;
}

/** A reproducible simulation stream, not a cryptographic random source. */
export function createSeededRandom(seed: number | string): RandomFn {
  let state = hashSeed(seed);
  return () => {
    state = (state * MULTIPLIER) % MODULUS;
    return state / MODULUS;
  };
}

/** Combat callers must own their stream; an omitted RNG is never a new roll. */
export function requireRandom(random: RandomFn | undefined): RandomFn {
  if (typeof random !== 'function') {
    throw new TypeError('Combat requires an explicit random source.');
  }
  return random;
}

/** Shuffle with random. */
export function shuffleWithRandom<T>(values: T[], random: RandomFn): T[] {
  const next = [...values];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const temp = next[i];
    next[i] = next[j];
    next[j] = temp;
  }
  return next;
}
