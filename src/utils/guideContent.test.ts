import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'bun:test';

import { buildGuideFacts } from '@/utils/guideFacts';

const LOCALES = ['en', 'de', 'es'] as const;
type Json = { [key: string]: Json | Json[] | string | boolean };

const load = (locale: string, namespace: string): Json =>
  JSON.parse(
    readFileSync(
      path.join(
        process.cwd(),
        'public',
        'locales',
        locale,
        `${namespace}.json`,
      ),
      'utf8',
    ),
  );

/** Flattens a locale file to `a.b.0` keys mapped to their strings. */
const flatten = (
  value: Json | Json[] | string | boolean,
  prefix = '',
): Map<string, string> => {
  const out = new Map<string, string>();
  const walk = (node: unknown, key: string) => {
    if (typeof node === 'string') out.set(key, node);
    else if (Array.isArray(node))
      node.forEach((item, i) => walk(item, `${key}.${i}`));
    else if (node && typeof node === 'object')
      for (const [k, v] of Object.entries(node))
        walk(v, key ? `${key}.${k}` : k);
  };
  walk(value, prefix);
  return out;
};

const placeholders = (text: string) =>
  [...text.matchAll(/{{\s*([\w.]+)\s*}}/g)].map((match) => match[1]).sort();

const resolve = (source: unknown, dotted: string): unknown =>
  dotted
    .split('.')
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === 'object'
          ? (node as Record<string, unknown>)[part]
          : undefined,
      source,
    );

describe('guides and chronicles copy', () => {
  for (const namespace of ['guides', 'chronicles']) {
    it(`${namespace}: de and es carry every en key and the same placeholders`, () => {
      const en = flatten(load('en', namespace));
      for (const locale of ['de', 'es']) {
        const other = flatten(load(locale, namespace));
        expect([...other.keys()].sort()).toEqual([...en.keys()].sort());
        for (const [key, text] of en) {
          expect(placeholders(other.get(key) ?? '')).toEqual(
            placeholders(text),
          );
          expect(other.get(key)?.trim()).not.toBe('');
        }
      }
    });
  }

  it('guides: every placeholder resolves to a live guide figure', () => {
    const facts = buildGuideFacts();
    const extra = { unlockNames: { goldTransfer: '', mercenaryHall: '' } };
    for (const locale of LOCALES) {
      for (const [key, text] of flatten(load(locale, 'guides'))) {
        for (const name of placeholders(text)) {
          if (name === 'number' || name === 'total') continue; // card counters
          const value = resolve(facts, name) ?? resolve(extra, name);
          expect([locale, key, name, value !== undefined]).toEqual([
            locale,
            key,
            name,
            true,
          ]);
        }
      }
    }
  });

  it('never names another game', () => {
    const banned = /dark\s*throne/i;
    for (const locale of LOCALES)
      for (const namespace of ['guides', 'chronicles'])
        for (const text of flatten(load(locale, namespace)).values())
          expect(banned.test(text)).toBe(false);
  });
});
