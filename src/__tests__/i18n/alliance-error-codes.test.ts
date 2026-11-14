import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'bun:test';

import { ALLIANCE_RULE_CODES } from '@/constants/allianceErrors';
import { ALLIANCE_LIMIT_CODES } from '@/constants/allianceLevels';

const load = (locale: string) =>
  JSON.parse(readFileSync(`public/locales/${locale}/alliances.json`, 'utf8'))
    .errors as Record<string, string>;

describe('alliance refusal translations', () => {
  const codes = [
    ...Object.values(ALLIANCE_RULE_CODES),
    ...Object.values(ALLIANCE_LIMIT_CODES),
  ];

  it.each(['en', 'de', 'es'])('%s has every refusal code', (locale) => {
    const errors = load(locale);
    for (const code of codes) {
      expect(errors[code], `${locale}:${code}`).toBeTruthy();
    }
  });

  it('keeps the same placeholders in every language', () => {
    const placeholders = (text: string) =>
      [...text.matchAll(/\{\{(\w+)/g)].map((m) => m[1]).sort();
    const en = load('en');
    for (const locale of ['de', 'es']) {
      const other = load(locale);
      for (const code of codes) {
        expect(placeholders(other[code]), `${locale}:${code}`).toEqual(
          placeholders(en[code]),
        );
      }
    }
  });
});
