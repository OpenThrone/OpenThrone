// Shared test helper to install a deterministic mtRand implementation for tests.
// Usage: import { installMockMtRand, setNextRandom } from 'test/utils/mockMtRand';

export const mtRandImpl = {
  fn: (min = 0, max = 1) => Math.random() * (max - min) + min,
};

export function installMockMtRand(vi: any) {
  // Provide both a named export `mtRand` and a default export so tests that import
  // either form continue to work when the module is mocked.
  // Callers that pass their own seeded `random` (combat replays) keep it: a
  // leaked mock must never swap a seeded stream for Math.random, or two
  // replays of the same battle diverge.
  const mocked = (min = 0, max = 1, random?: () => number) =>
    random ? min + random() * (max - min) : mtRandImpl.fn(min, max);
  vi.mock('@/utils/mtrand', () => ({
    mtRand: mocked,
    default: mocked,
  }));
}

export function setNextRandom(fn: (min?: number, max?: number) => number) {
  mtRandImpl.fn = fn;
}
