/** Defines the random fn shape used by related workflows. */
export type RandomFn = () => number;

function hashSeed(seed: number | string): number {
  const seedText = String(seed);
  let h = 1;
  for (let i = 0; i < seedText.length; i += 1) {
    h = (h * 31 + seedText.charCodeAt(i)) % 2147483647;
  }
  return h <= 0 ? h + 2147483646 : h;
}

/** Create seeded random. */
export function createSeededRandom(seed: number | string): RandomFn {
  let state = hashSeed(seed);
  return () => {
    state = (state * 48271) % 2147483647;
    return state / 2147483647;
  };
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
