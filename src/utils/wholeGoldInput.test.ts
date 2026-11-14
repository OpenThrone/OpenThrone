import { describe, expect, it } from 'bun:test';

import {
  wholeGoldInput,
  wholeGoldSeparators,
  wholeGoldValue,
} from '@/utils/wholeGoldInput';

describe('wholeGoldInput', () => {
  it('keeps an emptied field empty instead of snapping back to 0', () => {
    expect(wholeGoldInput('')).toBe('');
  });

  it('reads typed amounts as whole, non-negative gold', () => {
    expect(wholeGoldInput(5000)).toBe(5000);
    expect(wholeGoldInput('70000')).toBe(70000);
    expect(wholeGoldInput(12.9)).toBe(12);
    expect(wholeGoldInput(-3)).toBe(0);
    expect(wholeGoldInput('abc')).toBe(0);
  });

  it('counts an empty field as 0 gold', () => {
    expect(wholeGoldValue('')).toBe(0);
    expect(wholeGoldValue(250)).toBe(250);
  });
});

describe('wholeGoldSeparators', () => {
  it('groups digits the way the page language writes them', () => {
    expect(wholeGoldSeparators('en')).toEqual({
      thousandSeparator: ',',
      decimalSeparator: '.',
    });
    expect(wholeGoldSeparators('de')).toEqual({
      thousandSeparator: '.',
      decimalSeparator: ',',
    });
    expect(wholeGoldSeparators('es')).toEqual({
      thousandSeparator: '.',
      decimalSeparator: ',',
    });
  });

  it('never uses the same character for grouping and decimals', () => {
    for (const locale of ['en', 'de', 'es', 'fr', undefined, 'not-a-locale']) {
      const { thousandSeparator, decimalSeparator } =
        wholeGoldSeparators(locale);
      expect(thousandSeparator).not.toBe(decimalSeparator);
    }
  });
});
