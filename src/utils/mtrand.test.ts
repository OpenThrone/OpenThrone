import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import { installMockMtRand, mtRandImpl } from 'test/utils/mockMtRand';

import { mtRand } from './mtrand';

// Use the shared test helper to mock the module before requiring it.
installMockMtRand(vi);

describe('mtRand', () => {
  beforeEach(() => {
    // Set a deterministic implementation for these tests.
    mtRandImpl.fn = (min = 0, max = 1) => min + 0.5 * (max - min);
  });

  afterEach(() => {
    // Reset to default behavior to avoid surprising other code.
    mtRandImpl.fn = (min = 0, max = 1) => Math.random() * (max - min) + min;
  });

  it('should generate a random number within the specified range', () => {
    const min = 0;
    const max = 10;
    const result = mtRand(min, max);
    expect(result).toBeGreaterThanOrEqual(min);
    expect(result).toBeLessThanOrEqual(max);
  });

  it('should generate a random number within a different range', () => {
    const min = -5;
    const max = 5;
    const result = mtRand(min, max);
    expect(result).toBeGreaterThanOrEqual(min);
    expect(result).toBeLessThanOrEqual(max);
  });

  it('should generate a random number within a range with decimal values', () => {
    const min = 1.5;
    const max = 2.5;
    const result = mtRand(min, max);
    expect(result).toBeGreaterThanOrEqual(min);
    expect(result).toBeLessThanOrEqual(max);
  });
});
