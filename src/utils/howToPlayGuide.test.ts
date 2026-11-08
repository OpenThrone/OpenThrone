import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'bun:test';

import {
  HOW_TO_PLAY_ECONOMY_ENTRIES,
  HOW_TO_PLAY_GENERATED_ENTRIES,
} from '@/utils/howToPlayGuide';

const LOCALES = ['en', 'de', 'es'] as const;
const load = (locale: string) =>
  JSON.parse(
    readFileSync(
      join(process.cwd(), 'public/locales', locale, 'how-to-play.json'),
      'utf8',
    ),
  );

describe('How to Play copy', () => {
  it.each(LOCALES)(
    '%s describes the structures the game has (#276)',
    (locale) => {
      const { economy } = load(locale);
      const { title, description, ...entries } = economy;
      expect(title).toBeTruthy();
      expect(description).toBeTruthy();
      expect(Object.keys(entries).sort()).toEqual(
        [...HOW_TO_PLAY_ECONOMY_ENTRIES].sort(),
      );
      for (const entry of HOW_TO_PLAY_ECONOMY_ENTRIES) {
        expect(entries[entry].title).toBeTruthy();
        if (
          !(HOW_TO_PLAY_GENERATED_ENTRIES as readonly string[]).includes(entry)
        )
          expect(entries[entry].text).toBeTruthy();
      }
    },
  );

  it.each(LOCALES)(
    '%s takes the turn interval from config, not a fixed 30 minutes (#278)',
    (locale) => {
      const { coreLoop } = load(locale);
      for (const text of [coreLoop.description, coreLoop.steps.earn.text]) {
        expect(text).toContain('{{minutes}}');
        expect(text).not.toMatch(/\b30\b/);
      }
    },
  );

  it.each(LOCALES)('%s says where mercenaries come from (#335)', (locale) => {
    const { combat } = load(locale);
    expect(combat.losses.text).toContain('{{mercenaryFort}}');
    expect(combat.losses.text).toContain('{{mercenaryLevel}}');
  });

  it.each(LOCALES)('%s explains where XP comes from (#298)', (locale) => {
    const { combat } = load(locale);
    for (const param of [
      'effortFloor',
      'effortFull',
      'threatFloor',
      'graceDays',
      'stallStep',
      'stallMax',
    ])
      expect(combat.experience.text).toContain(`{{${param}}}`);
  });

  it.each(LOCALES)(
    '%s states the gold shield rule numbers (#284)',
    (locale) => {
      const { combat } = load(locale);
      for (const param of ['allowance', 'share', 'taperLevel'])
        expect(combat.protection.text).toContain(`{{${param}}}`);
    },
  );
});
