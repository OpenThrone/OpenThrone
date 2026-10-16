// Shared test helper to install a deterministic mtRand implementation for tests.
// Usage: import { installMockMtRand, setNextRandom } from 'test/utils/mockMtRand';

export const mtRandImpl = {
  fn: (min = 0, max = 1) => Math.random() * (max - min) + min,
};

export function installMockMtRand(vi: any) {
  // Provide both a named export `mtRand` and a default export so tests that import
  // either form continue to work when the module is mocked.
  vi.mock('@/utils/mtrand', () => ({
    mtRand: (...args: any[]) => mtRandImpl.fn(...args),
    default: (...args: any[]) => mtRandImpl.fn(...args),
  }));
}

export function setNextRandom(fn: (min?: number, max?: number) => number) {
  mtRandImpl.fn = fn;
}
