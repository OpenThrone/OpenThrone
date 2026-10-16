import { describe, expect, it } from 'bun:test';
import * as crypto from 'crypto';

import type { PseudonymRandom } from '@/utils/pseudonym';
import { generatePseudonym, generateUniquePseudonym } from '@/utils/pseudonym';

describe('pseudonyms', () => {
  it('uses the requested format with a five-digit suffix', () => {
    for (let i = 0; i < 100; i += 1) {
      expect(generatePseudonym()).toMatch(
        /^[A-Z][a-z]+_[A-Z][a-z]+_[1-9][0-9]{4}$/,
      );
    }
  });
  it('accepts an injectable cryptographic random source', () => {
    const ranges: number[][] = [];
    const randomInt = ((min: number, max?: number) => {
      ranges.push(max === undefined ? [min] : [min, max]);
      return max === undefined ? 0 : min;
    }) as PseudonymRandom['randomInt'];
    expect(generatePseudonym({ randomInt })).toBe('Amber_Acorn_10000');
    expect(ranges).toEqual([[60], [60], [10000, 100000]]);
    expect(generatePseudonym(crypto)).toMatch(/_[0-9]{5}$/);
  });
  it('retries taken names and returns the available candidate', async () => {
    const candidates: string[] = [];
    const result = await generateUniquePseudonym(async (name) => {
      candidates.push(name);
      return candidates.length < 3;
    });
    expect(candidates).toHaveLength(3);
    expect(result).toBe(candidates[2]);
  });
  it('stops after the collision limit', async () => {
    let calls = 0;
    await expect(
      generateUniquePseudonym(async () => {
        calls += 1;
        return true;
      }, 2),
    ).rejects.toThrow('Unable to generate');
    expect(calls).toBe(2);
  });
  it('rejects invalid attempt limits without calling the lookup', async () => {
    let calls = 0;
    const isTaken = async () => {
      calls += 1;
      return false;
    };
    for (const limit of [0, -1, 1.5, NaN, Infinity]) {
      await expect(generateUniquePseudonym(isTaken, limit)).rejects.toThrow(
        'positive integer',
      );
    }
    expect(calls).toBe(0);
  });
  it('propagates lookup errors', async () => {
    await expect(
      generateUniquePseudonym(async () => {
        throw new Error('Lookup unavailable');
      }),
    ).rejects.toThrow('Lookup unavailable');
  });
});
