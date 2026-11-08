import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'bun:test';

const load = (lang: string) =>
  JSON.parse(
    readFileSync(
      join(process.cwd(), 'public/locales', lang, 'battle.json'),
      'utf8',
    ),
  ) as { timeline: Record<string, string> };

// The timeline loss line counts every casualty, citizens and workers included,
// so it must not call them soldiers (#320). A single lost unit is named by its
// type instead (#284).
describe('battle timeline loss line', () => {
  const soldierWords: Record<string, RegExp> = {
    en: /soldier/i,
    es: /soldado/i,
    de: /soldat/i,
  };

  for (const [lang, soldier] of Object.entries(soldierWords)) {
    it(`does not name the lost units soldiers (${lang})`, () => {
      const { timeline } = load(lang);
      for (const key of [
        'youLostUnits_one',
        'youLostUnits_other',
        'youLostUnitType',
        'playerLostUnits_one',
        'playerLostUnits_other',
        'playerLostUnitType',
      ]) {
        expect(timeline[key], `${lang} ${key}`).toBeDefined();
        expect(timeline[key]).not.toMatch(soldier);
      }
    });

    it(`names the single lost unit's type (${lang})`, () => {
      const { timeline } = load(lang);
      expect(timeline.youLostUnitType).toContain('{{unit}}');
      expect(timeline.playerLostUnitType).toContain('{{unit}}');
      expect(timeline.playerLostUnitType).toContain('{{player}}');
    });
  }
});
