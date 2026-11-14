import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'bun:test';

// Namespaces the alliance pages and alliance admin read. A key missing in
// de or es shows English on those pages (index.troops did, as "Alliance
// troops" above the German and Spanish tab strip).
const NAMESPACES = [
  'alliances',
  'allianceTreasury',
  'admin-alliances',
  'admin-users',
];

const load = (locale: string, ns: string) =>
  JSON.parse(
    readFileSync(
      path.join(process.cwd(), 'public/locales', locale, `${ns}.json`),
      'utf8',
    ),
  );

const keysOf = (value: unknown, prefix = ''): string[] =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? Object.entries(value).flatMap(([key, child]) =>
        keysOf(child, prefix ? `${prefix}.${key}` : key),
      )
    : [prefix];

describe('alliance translations', () => {
  for (const ns of NAMESPACES) {
    const english = keysOf(load('en', ns));
    for (const locale of ['de', 'es']) {
      it(`${locale}/${ns}.json has every English key`, () => {
        const translated = new Set(keysOf(load(locale, ns)));
        expect(english.filter((key) => !translated.has(key))).toEqual([]);
      });
    }
  }
});
