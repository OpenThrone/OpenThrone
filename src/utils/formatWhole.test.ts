import { describe, expect, it } from 'bun:test';

import { formatWhole } from '@/utils/formatWhole';

describe('formatWhole', () => {
  it('writes big gold amounts in full for each language', () => {
    expect(formatWhole(2_000_000_000n, 'en')).toBe('2,000,000,000');
    expect(formatWhole('2000000000', 'de')).toBe('2.000.000.000');
    expect(formatWhole(1234567, 'es')).toBe('1.234.567');
  });

  it('copes with serialized BigInts, empty values and junk', () => {
    expect(formatWhole('1500n', 'en')).toBe('1,500');
    expect(formatWhole(null, 'en')).toBe('0');
    expect(formatWhole('abc', 'en')).toBe('0');
  });
});
