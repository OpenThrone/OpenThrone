import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'bun:test';

import { getClassBonusPercent, PLAYER_CLASSES } from '@/utils/classBonuses';

const load = (
  locale: string,
): { classDescriptions: Record<string, string>; classHint: string } =>
  JSON.parse(
    readFileSync(
      join(process.cwd(), 'public/locales', locale, 'common.json'),
      'utf8',
    ),
  );

describe('class descriptions (#282)', () => {
  it('every class has a bonus in the live ruleset', () => {
    for (const playerClass of PLAYER_CLASSES)
      expect(getClassBonusPercent(playerClass)).toBeGreaterThan(0);
  });

  it.each(['en', 'de', 'es'])(
    '%s describes every class with its amount',
    (locale) => {
      const common = load(locale);
      expect(common.classHint.length).toBeGreaterThan(0);
      for (const playerClass of PLAYER_CLASSES)
        expect(common.classDescriptions[playerClass]).toContain('{{amount}}');
    },
  );
});
