import { computeSpyAmpFactor } from './spyFunctions';

describe('computeSpyAmpFactor', () => {
  it('should return the correct amplification factor for target population <= 10', () => {
    const targetPop = 10;
    const expectedAmpFactor = 0.4 * 1.6;
    const result = computeSpyAmpFactor(targetPop);
    expect(result).toBe(expectedAmpFactor);
  });

  it('should return the correct amplification factor for target population <= 9', () => {
    const targetPop = 9;
    const expectedAmpFactor = 0.4 * 1.5;
    const result = computeSpyAmpFactor(targetPop);
    expect(result).toBe(expectedAmpFactor);
  });

  it('should return the correct amplification factor for target population <= 7', () => {
    const targetPop = 7;
    const expectedAmpFactor = 0.4 * 1.35;
    const result = computeSpyAmpFactor(targetPop);
    expect(result).toBe(expectedAmpFactor);
  });

  it('should return the correct amplification factor for target population <= 5', () => {
    const targetPop = 5;
    const expectedAmpFactor = 0.4 * 1.2;
    const result = computeSpyAmpFactor(targetPop);
    expect(result).toBe(expectedAmpFactor);
  });

  it('should return the correct amplification factor for target population <= 3', () => {
    const targetPop = 3;
    const expectedAmpFactor = 0.4 * 0.95;
    const result = computeSpyAmpFactor(targetPop);
    expect(result).toBe(expectedAmpFactor);
  });

  it('should return the correct amplification factor for target population <= 1', () => {
    const targetPop = 1;
    const expectedAmpFactor = 0.4 * 0.75;
    const result = computeSpyAmpFactor(targetPop);
    expect(result).toBe(expectedAmpFactor);
  });
});