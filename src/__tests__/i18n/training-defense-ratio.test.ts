import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'bun:test';

import { CURRENT_COMBAT_RULESET } from '@/utils/balance/combatRulesets';

const read = (...parts: string[]) =>
  readFileSync(join(process.cwd(), ...parts), 'utf8');

const threshold = Math.round(
  CURRENT_COMBAT_RULESET.constants.DEFENSE_COVERAGE_THRESHOLD * 100,
);

// Training's Defense Ratio is Defense Units over total population, the same
// coverage the combat rule checks; the stat says so and the tip matches (#332).
describe('Training Defense Ratio', () => {
  for (const lang of ['en', 'de', 'es']) {
    it(`explains the stat (${lang})`, () => {
      const { training } = JSON.parse(
        read('public/locales', lang, 'battle.json'),
      ) as { training: Record<string, string> };
      expect(training.defenseRatioHint).toContain('{{threshold}}');
    });

    it(`advisor tip names the real threshold (${lang})`, () => {
      const common = JSON.parse(
        read('public/locales', lang, 'common.json'),
      ) as { sidebar: { advisorTips: Record<string, string> } };
      const tip = common.sidebar.advisorTips.fortDefense ?? '';
      expect(tip).toMatch(new RegExp(`\\b${threshold}\\s?%`));
    });
  }

  it('the tip no longer ties citizen losses to the ratio', () => {
    const common = JSON.parse(read('public/locales/en/common.json')) as {
      sidebar: { advisorTips: Record<string, string> };
    };
    expect(common.sidebar.advisorTips.fortDefense).not.toContain(
      'non-combatant',
    );
  });

  it('shows the hint on the page', () => {
    expect(read('src/pages/battle/training.tsx')).toContain(
      "t('training.defenseRatioHint'",
    );
  });
});
