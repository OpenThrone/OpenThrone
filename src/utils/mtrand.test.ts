import { mtRand } from './mtrand';

describe('mtRand', () => {
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